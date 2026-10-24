import { getDb } from "../db/data-source";
import { Room, RoomRentHistory, Tenancy, Tenant } from "../entities/core";
import { monthOf, rentForMonth } from "./billing-core";
import { adjustChargesOnMoveOut, ensureCharges } from "./billing";
import { houseFor, roomFor, tenancyFor, tenantFor } from "./access";
import { audit, type Actor } from "./common";

export interface TenantInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  idProofType?: string | null;
  idProofNumber?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  docUrl?: string | null;
  notes?: string | null;
}

export async function createTenant(actor: Actor, input: TenantInput & { houseId: number }) {
  const db = await getDb();
  return db.transaction(async (m) => {
    await houseFor(m, actor, input.houseId);
    const res = await m.getRepository(Tenant).insert({ ...input, orgId: actor.orgId });
    const id = res.identifiers[0].id as number;
    await audit(m, actor, "CREATE", "Tenant", id, null, input);
    return id;
  });
}

export async function updateTenant(actor: Actor, id: number, input: TenantInput) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await tenantFor(m, actor, id);
    await m.getRepository(Tenant).update(id, input);
    await audit(m, actor, "UPDATE", "Tenant", id, before, input);
  });
}

export async function deleteTenant(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await tenantFor(m, actor, id);
    if (await m.getRepository(Tenancy).countBy({ tenantId: id }))
      throw new Error("Tenant has tenancy history and cannot be deleted");
    await m.getRepository(Tenant).delete(id);
    await audit(m, actor, "DELETE", "Tenant", id, before, null);
  });
}

export interface CheckInInput {
  tenantId: number;
  roomId: number;
  startDate: string;
  /** Leave undefined to follow the room's rent (and its future rent changes). */
  rent?: number | null;
  securityDeposit: number;
}

async function startTenancy(m: import("typeorm").EntityManager, actor: Actor, input: CheckInInput) {
  const room = await roomFor(m, actor, input.roomId);
  await tenantFor(m, actor, input.tenantId);
  if (room.status === "MAINTENANCE") throw new Error(`Room ${room.number} is under maintenance`);
  if (room.rentalType !== "MONTHLY") throw new Error(`Room ${room.number} is a daily-rental room — check in a guest stay instead`);
  if (await m.getRepository(Tenancy).countBy({ roomId: room.id, status: "ACTIVE" }))
    throw new Error(`Room ${room.number} is already occupied`);
  if (await m.getRepository(Tenancy).countBy({ tenantId: input.tenantId, status: "ACTIVE" }))
    throw new Error("Tenant already has an active tenancy — move them out or use Transfer");
  const history = await m.getRepository(RoomRentHistory).findBy({ roomId: room.id });
  const roomRent = rentForMonth(history, monthOf(input.startDate), room.currentRent);
  const rent = input.rent ?? roomRent;
  const res = await m.getRepository(Tenancy).insert({
    tenantId: input.tenantId,
    roomId: room.id,
    startDate: input.startDate,
    endDate: null,
    monthlyRent: rent,
    rentOverride: rent !== roomRent,
    securityDeposit: input.securityDeposit,
    depositReturned: 0,
    status: "ACTIVE",
  });
  await m.getRepository(Room).update(room.id, { status: "OCCUPIED" });
  await m.getRepository(Tenant).update(input.tenantId, { houseId: room.houseId });
  return res.identifiers[0].id as number;
}

export async function checkIn(actor: Actor, input: CheckInInput) {
  const db = await getDb();
  const id = await db.transaction(async (m) => {
    const id = await startTenancy(m, actor, input);
    await audit(m, actor, "CHECK_IN", "Tenancy", id, null, input);
    return id;
  });
  await ensureCharges(actor.orgId);
  return id;
}

export async function moveOut(actor: Actor, tenancyId: number, endDate: string, depositReturned: number) {
  const db = await getDb();
  await ensureCharges(actor.orgId); // charges must exist before the final month is re-priced
  await db.transaction(async (m) => {
    const t = await tenancyFor(m, actor, tenancyId);
    if (t.status !== "ACTIVE") throw new Error("Tenancy already ended");
    if (endDate < t.startDate) throw new Error("Move-out date is before check-in");
    if (depositReturned > t.securityDeposit) throw new Error("Returned deposit exceeds the deposit held");
    await m.getRepository(Tenancy).update(tenancyId, { endDate, status: "ENDED", depositReturned });
    await m.getRepository(Room).update(t.roomId, { status: "VACANT" });
    await adjustChargesOnMoveOut(m, actor.orgId, { ...t, endDate }, endDate);
    await audit(m, actor, "MOVE_OUT", "Tenancy", tenancyId, t, { endDate, depositReturned });
  });
}

/** Move a tenant to another room: closes the old tenancy the day before, opens a new one, carries the deposit. */
export async function transferRoom(actor: Actor, tenancyId: number, newRoomId: number, date: string, rent?: number | null) {
  const db = await getDb();
  await ensureCharges(actor.orgId);
  await db.transaction(async (m) => {
    const old = await tenancyFor(m, actor, tenancyId);
    if (old.status !== "ACTIVE") throw new Error("Tenancy already ended");
    if (old.roomId === newRoomId) throw new Error("Choose a different room");
    if (date <= old.startDate) throw new Error("Transfer date must be after the original check-in");
    const prev = new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);
    await m.getRepository(Tenancy).update(tenancyId, { endDate: prev, status: "ENDED", depositReturned: old.securityDeposit });
    await m.getRepository(Room).update(old.roomId, { status: "VACANT" });
    await adjustChargesOnMoveOut(m, actor.orgId, { ...old, endDate: prev }, prev);
    const id = await startTenancy(m, actor, {
      tenantId: old.tenantId,
      roomId: newRoomId,
      startDate: date,
      rent,
      securityDeposit: old.securityDeposit,
    });
    await audit(m, actor, "TRANSFER", "Tenancy", id, { from: old.roomId, tenancyId }, { to: newRoomId, date });
  });
  await ensureCharges(actor.orgId);
}

export async function updateTenancy(
  actor: Actor,
  id: number,
  input: { monthlyRent: number; rentOverride: boolean; securityDeposit: number },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await tenancyFor(m, actor, id);
    await m.getRepository(Tenancy).update(id, input);
    await audit(m, actor, "UPDATE", "Tenancy", id, before, input);
  });
}
