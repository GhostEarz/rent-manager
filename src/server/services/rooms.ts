import { getDb } from "../db/data-source";
import { Floor, Room, RoomRentHistory, Stay, Tenancy, type RentalType, type RoomStatus } from "../entities/core";
import { audit, today, type Actor } from "./common";

export async function addFloor(actor: Actor, input: { houseId: number; number: number; name: string }) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const res = await m.getRepository(Floor).insert(input);
    await audit(m, actor, "CREATE", "Floor", res.identifiers[0].id, null, input);
  });
}

export async function updateFloor(actor: Actor, id: number, input: { number: number; name: string }) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await m.getRepository(Floor).findOneByOrFail({ id });
    await m.getRepository(Floor).update(id, input);
    await audit(m, actor, "UPDATE", "Floor", id, before, input);
  });
}

export async function deleteFloor(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const n = await m.getRepository(Room).countBy({ floorId: id });
    if (n) throw new Error("Floor still has rooms — move or delete them first");
    const before = await m.getRepository(Floor).findOneByOrFail({ id });
    await m.getRepository(Floor).delete(id);
    await audit(m, actor, "DELETE", "Floor", id, before, null);
  });
}

export async function addRoom(
  actor: Actor,
  input: { number: string; floorId: number; rentalType?: RentalType; rent: number; notes?: string | null },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const floor = await m.getRepository(Floor).findOneByOrFail({ id: input.floorId });
    const rentalType = input.rentalType ?? "MONTHLY";
    const res = await m.getRepository(Room).insert({
      number: input.number,
      floorId: input.floorId,
      houseId: floor.houseId,
      rentalType,
      currentRent: input.rent,
      notes: input.notes ?? null,
      status: "VACANT",
    });
    const id = res.identifiers[0].id as number;
    await m.getRepository(RoomRentHistory).insert({ roomId: id, rentalType, rent: input.rent, effectiveFrom: "2000-01-01" });
    await audit(m, actor, "CREATE", "Room", id, null, input);
  });
}

export async function updateRoom(
  actor: Actor,
  id: number,
  input: { number: string; floorId: number; notes?: string | null; status?: RoomStatus },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await m.getRepository(Room).findOneByOrFail({ id });
    const floor = await m.getRepository(Floor).findOneByOrFail({ id: input.floorId });
    const active = await m.getRepository(Tenancy).countBy({ roomId: id, status: "ACTIVE" });
    let status = input.status ?? before.status;
    // Occupancy is driven by tenancies; the only manual toggle is VACANT ⇄ MAINTENANCE.
    if (active) status = "OCCUPIED";
    else if (status === "OCCUPIED") status = "VACANT";
    await m.getRepository(Room).update(id, {
      number: input.number,
      floorId: input.floorId,
      houseId: floor.houseId,
      notes: input.notes ?? null,
      status,
    });
    await audit(m, actor, "UPDATE", "Room", id, before, { ...input, status });
  });
}

/**
 * Switch a vacant room between MONTHLY and DAILY, with a new rate from `effectiveFrom`
 * (default today). Past tenancy/stay records and their charges/payments are untouched —
 * old history rows keep whatever rentalType they were written with.
 */
export async function changeRentalType(
  actor: Actor,
  roomId: number,
  input: { rentalType: RentalType; rent: number; effectiveFrom?: string },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const room = await m.getRepository(Room).findOneByOrFail({ id: roomId });
    if (room.status === "MAINTENANCE") throw new Error(`Room ${room.number} is under maintenance`);
    if (await m.getRepository(Tenancy).countBy({ roomId, status: "ACTIVE" }))
      throw new Error(`Room ${room.number} has an active tenancy — move the tenant out first`);
    if (await m.getRepository(Stay).countBy({ roomId, status: "ACTIVE" }))
      throw new Error(`Room ${room.number} has an active stay — check the guest out first`);
    const effectiveFrom = input.effectiveFrom ?? today();
    await m.getRepository(RoomRentHistory).insert({ roomId, rentalType: input.rentalType, rent: input.rent, effectiveFrom });
    if (effectiveFrom <= today()) {
      await m.getRepository(Room).update(roomId, { rentalType: input.rentalType, currentRent: input.rent });
    }
    await audit(m, actor, "RENTAL_TYPE_CHANGE", "Room", roomId,
      { rentalType: room.rentalType, rent: room.currentRent }, { ...input, effectiveFrom });
  });
}

export async function deleteRoom(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const n = await m.getRepository(Tenancy).countBy({ roomId: id });
    const s = await m.getRepository(Stay).countBy({ roomId: id });
    if (n || s) throw new Error("Room has tenancy or stay history and cannot be deleted. Mark it as Maintenance instead.");
    const before = await m.getRepository(Room).findOneByOrFail({ id });
    await m.getRepository(Room).delete(id);
    await audit(m, actor, "DELETE", "Room", id, before, null);
  });
}

/**
 * Record a new rent for a room from `effectiveFrom`. Past charges are never touched;
 * tenancies that follow the room's rent pick it up for months starting on/after the date.
 */
export async function changeRoomRent(actor: Actor, roomId: number, rent: number, effectiveFrom: string) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const room = await m.getRepository(Room).findOneByOrFail({ id: roomId });
    await m.getRepository(RoomRentHistory).insert({ roomId, rentalType: room.rentalType, rent, effectiveFrom });
    if (effectiveFrom <= today()) await m.getRepository(Room).update(roomId, { currentRent: rent });
    await audit(m, actor, "RENT_CHANGE", "Room", roomId, { rent: room.currentRent }, { rent, effectiveFrom });
  });
}
