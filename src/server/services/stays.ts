import type { EntityManager } from "typeorm";
import { getDb } from "../db/data-source";
import { Room, Stay, StayPayment, type PayMethod } from "../entities/core";
import { nightsBetween, stayAmountDue } from "./billing-core";
import { audit, today, type Actor } from "./common";

export interface CheckInStayInput {
  roomId: number;
  guestName: string;
  phone?: string | null;
  checkIn: string;
  /** Leave undefined to use the room's current nightly rate. */
  dailyRate?: number | null;
  notes?: string | null;
}

export async function checkInStay(actor: Actor, input: CheckInStayInput) {
  const db = await getDb();
  const id = await db.transaction(async (m) => {
    const room = await m.getRepository(Room).findOneByOrFail({ id: input.roomId });
    if (room.status === "MAINTENANCE") throw new Error(`Room ${room.number} is under maintenance`);
    if (room.rentalType !== "DAILY") throw new Error(`Room ${room.number} is a monthly room — use tenant check-in instead`);
    if (await m.getRepository(Stay).countBy({ roomId: room.id, status: "ACTIVE" }))
      throw new Error(`Room ${room.number} already has an active stay`);
    const res = await m.getRepository(Stay).insert({
      roomId: room.id,
      guestName: input.guestName,
      phone: input.phone ?? null,
      checkIn: input.checkIn,
      checkOut: null,
      dailyRate: input.dailyRate ?? room.currentRent,
      status: "ACTIVE",
      notes: input.notes ?? null,
    });
    const id = res.identifiers[0].id as number;
    await m.getRepository(Room).update(room.id, { status: "OCCUPIED" });
    await audit(m, actor, "CHECK_IN", "Stay", id, null, input);
    return id;
  });
  return id;
}

/** Balance due on a stay as of today (or checkout date once it has one). */
export async function stayBalance(stayId: number) {
  const db = await getDb();
  const [row] = await db.query(
    `SELECT s."checkIn", s."checkOut", s."dailyRate", COALESCE((SELECT SUM(amount) FROM stay_payments WHERE "stayId" = s.id), 0)::int AS paid
       FROM stays s WHERE s.id = $1`,
    [stayId],
  );
  if (!row) throw new Error("Stay not found");
  const nights = nightsBetween(row.checkIn, row.checkOut, today());
  const amountDue = stayAmountDue(row.dailyRate, nights);
  return { nights, amountDue, paid: row.paid as number, balance: amountDue - (row.paid as number) };
}

export async function checkOutStay(actor: Actor, stayId: number, checkOut: string) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const stay = await m.getRepository(Stay).findOneByOrFail({ id: stayId });
    if (stay.status !== "ACTIVE") throw new Error("Stay already ended");
    if (checkOut < stay.checkIn) throw new Error("Check-out date is before check-in");
    await m.getRepository(Stay).update(stayId, { checkOut, status: "ENDED" });
    await m.getRepository(Room).update(stay.roomId, { status: "VACANT" });
    await audit(m, actor, "CHECK_OUT", "Stay", stayId, stay, { checkOut });
  });
}

export async function cancelStay(actor: Actor, stayId: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const stay = await m.getRepository(Stay).findOneByOrFail({ id: stayId });
    if (stay.status !== "ACTIVE") throw new Error("Stay already ended");
    const paid = await m.getRepository(StayPayment).countBy({ stayId });
    if (paid) throw new Error("Stay has payments recorded and cannot be cancelled. Check the guest out instead.");
    await m.getRepository(Stay).update(stayId, { status: "CANCELLED" });
    await m.getRepository(Room).update(stay.roomId, { status: "VACANT" });
    await audit(m, actor, "CANCEL", "Stay", stayId, stay, null);
  });
}

export interface StayPaymentInput {
  stayId: number;
  amount: number;
  paidOn: string;
  method: PayMethod;
  referenceNo?: string | null;
  note?: string | null;
}

export async function recordStayPayment(actor: Actor, input: StayPaymentInput) {
  if (input.amount <= 0) throw new Error("Amount must be greater than zero");
  const db = await getDb();
  return db.transaction(async (m: EntityManager) => {
    const stay = await m.getRepository(Stay).findOneByOrFail({ id: input.stayId });
    if (stay.status === "CANCELLED") throw new Error("Stay was cancelled");
    const res = await m.getRepository(StayPayment).insert({ ...input, recordedById: actor.id });
    const id = res.identifiers[0].id as number;
    await audit(m, actor, "CREATE", "StayPayment", id, null, input);
    return id;
  });
}

export async function deleteStayPayment(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const p = await m.getRepository(StayPayment).findOneByOrFail({ id });
    await m.getRepository(StayPayment).delete(id);
    await audit(m, actor, "DELETE", "StayPayment", id, p, null);
  });
}
