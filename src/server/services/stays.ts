import type { EntityManager } from "typeorm";
import { getDb } from "../db/data-source";
import { Room, Stay, StayPayment, type PayMethod } from "../entities/core";
import { roomFor, stayFor, stayPaymentFor } from "./access";
import { nightsBetween, stayAmountDue } from "./billing-core";
import { audit, today, type Actor } from "./common";

export interface CheckInStayInput {
  roomId: number;
  guestName: string;
  phone?: string | null;
  checkIn: string;
  /** Planned check-out (exclusive). Leave empty for an open-ended stay. */
  checkOut?: string | null;
  /** Leave undefined to use the room's current nightly rate. */
  dailyRate?: number | null;
  notes?: string | null;
}

/**
 * Nights are the half-open range [checkIn, checkOut): the check-out day is free for the next guest.
 * Throws if the requested range collides with another live (booked/active/ended) stay on the room.
 * An open-ended request (no checkOut) claims just its first night; an open-ended ACTIVE stay claims everything after it.
 */
async function assertNoOverlap(m: EntityManager, roomId: number, checkIn: string, checkOut: string | null, ignoreStayId?: number) {
  const rows: { guestName: string; checkIn: string; checkOut: string | null }[] = await m.query(
    `SELECT "guestName", "checkIn", "checkOut" FROM stays
      WHERE "roomId" = $1 AND status <> 'CANCELLED' AND id <> $4
        AND "checkIn" < COALESCE($3::date, $2::date + 1)
        AND COALESCE("checkOut", 'infinity'::date) > $2::date
      LIMIT 1`,
    [roomId, checkIn, checkOut, ignoreStayId ?? 0],
  );
  if (rows.length) {
    const c = rows[0];
    throw new Error(`Room already has ${c.guestName} from ${c.checkIn} to ${c.checkOut ?? "open"} — those dates overlap`);
  }
}

function assertDates(checkIn: string, checkOut: string | null | undefined) {
  if (checkOut && checkOut <= checkIn) throw new Error("Check-out must be after check-in");
}

/** Check a guest in now/today (ACTIVE), or — if the dates are in the future — reserve them (BOOKED). */
export async function checkInStay(actor: Actor, input: CheckInStayInput) {
  assertDates(input.checkIn, input.checkOut);
  const db = await getDb();
  return db.transaction(async (m) => {
    const room = await roomFor(m, actor, input.roomId);
    if (room.status === "MAINTENANCE") throw new Error(`Room ${room.number} is under maintenance`);
    if (room.rentalType !== "DAILY") throw new Error(`Room ${room.number} is a monthly room — use tenant check-in instead`);
    const checkOut = input.checkOut ?? null;
    if (input.checkIn > today() && !checkOut) throw new Error("A future booking needs a check-out date");
    await assertNoOverlap(m, room.id, input.checkIn, checkOut);
    // Future dates reserve the room; dates already fully in the past are just a historical record.
    const future = input.checkIn > today();
    const past = !future && !!checkOut && checkOut <= today();
    const res = await m.getRepository(Stay).insert({
      roomId: room.id,
      guestName: input.guestName,
      phone: input.phone ?? null,
      checkIn: input.checkIn,
      checkOut,
      dailyRate: input.dailyRate ?? room.currentRent,
      status: future ? "BOOKED" : past ? "ENDED" : "ACTIVE",
      notes: input.notes ?? null,
    });
    const id = res.identifiers[0].id as number;
    if (!future && !past) await m.getRepository(Room).update(room.id, { status: "OCCUPIED" });
    await audit(m, actor, future ? "BOOK" : past ? "BACKFILL" : "CHECK_IN", "Stay", id, null, input);
    return id;
  });
}

/** Turn a reservation into an in-house stay (guest arrived). */
export async function startBookedStay(actor: Actor, stayId: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const stay = await stayFor(m, actor, stayId);
    if (stay.status !== "BOOKED") throw new Error("Only a booked stay can be checked in");
    const room = await m.getRepository(Room).findOneByOrFail({ id: stay.roomId });
    if (room.status === "MAINTENANCE") throw new Error(`Room ${room.number} is under maintenance`);
    if (await m.getRepository(Stay).countBy({ roomId: room.id, status: "ACTIVE" }))
      throw new Error(`Room ${room.number} still has a guest checked in`);
    await m.getRepository(Stay).update(stayId, { status: "ACTIVE" });
    await m.getRepository(Room).update(room.id, { status: "OCCUPIED" });
    await audit(m, actor, "CHECK_IN", "Stay", stayId, stay, null);
  });
}

/** Balance due on a stay as of today (or checkout date once it has one). */
export async function stayBalance(actor: Actor, stayId: number) {
  const db = await getDb();
  await stayFor(db.manager, actor, stayId);
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
    const stay = await stayFor(m, actor, stayId);
    if (stay.status !== "ACTIVE") throw new Error("Stay is not checked in");
    if (checkOut <= stay.checkIn) throw new Error("Check-out must be after check-in");
    // Leaving later than planned must not run into the next reservation.
    if (stay.checkOut == null || checkOut > stay.checkOut) await assertNoOverlap(m, stay.roomId, stay.checkIn, checkOut, stayId);
    await m.getRepository(Stay).update(stayId, { checkOut, status: "ENDED" });
    await m.getRepository(Room).update(stay.roomId, { status: "VACANT" });
    await audit(m, actor, "CHECK_OUT", "Stay", stayId, stay, { checkOut });
  });
}

export async function cancelStay(actor: Actor, stayId: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const stay = await stayFor(m, actor, stayId);
    if (stay.status !== "ACTIVE" && stay.status !== "BOOKED") throw new Error("Stay already ended");
    const paid = await m.getRepository(StayPayment).countBy({ stayId });
    if (paid) throw new Error("Stay has payments recorded and cannot be cancelled. Delete the payments or check the guest out instead.");
    await m.getRepository(Stay).update(stayId, { status: "CANCELLED" });
    if (stay.status === "ACTIVE") await m.getRepository(Room).update(stay.roomId, { status: "VACANT" });
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
    const stay = await stayFor(m, actor, input.stayId);
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
    const p = await stayPaymentFor(m, actor, id);
    await m.getRepository(StayPayment).delete(id);
    await audit(m, actor, "DELETE", "StayPayment", id, p, null);
  });
}
