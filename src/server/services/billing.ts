import type { EntityManager } from "typeorm";
import { getDb } from "../db/data-source";
import { Payment, PaymentAllocation, RentCharge, RoomRentHistory, Tenancy, type PayMethod } from "../entities/core";
import {
  allocate,
  chargeAmount,
  dueDateFor,
  monthOf,
  monthRange,
  rentForMonth,
  statusFor,
} from "./billing-core";
import { paymentFor, tenancyFor } from "./access";
import { audit, currentMonth, getSettings, today, type Actor } from "./common";

/** Rent for a tenancy in a month: locked override, or the room's rent history. */
function tenancyRent(t: Tenancy, history: RoomRentHistory[], month: string) {
  return t.rentOverride ? t.monthlyRent : rentForMonth(history, month, t.monthlyRent);
}

/** Tenancies belong to an organization through room → house. */
const ORG_TENANCIES = `FROM tenancies y JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId" WHERE h."orgId" = $1`;

/**
 * Create any missing RentCharge rows (start month … min(end month, current month)) for one
 * organization, then let leftover advance payments settle them. Idempotent — safe to call on every page load.
 */
export async function ensureCharges(orgId: number): Promise<number> {
  const db = await getDb();
  const settings = await getSettings(orgId);
  const now = currentMonth();
  return db.transaction(async (m) => {
    const tenancies: Tenancy[] = await m.query(`SELECT y.* ${ORG_TENANCIES}`, [orgId]);
    const history: RoomRentHistory[] = await m.query(
      `SELECT rh.* FROM room_rent_history rh JOIN rooms r ON r.id = rh."roomId" JOIN houses h ON h.id = r."houseId" WHERE h."orgId" = $1`,
      [orgId],
    );
    const existing: { tenancyId: number; month: string }[] = await m.query(
      `SELECT c."tenancyId", c.month FROM rent_charges c WHERE c."tenancyId" IN (SELECT y.id ${ORG_TENANCIES})`,
      [orgId],
    );
    const have = new Set(existing.map((c) => `${c.tenancyId}:${c.month}`));
    const toInsert: Partial<RentCharge>[] = [];
    const touched = new Set<number>();
    for (const t of tenancies) {
      const last = t.endDate ? (monthOf(t.endDate) < now ? monthOf(t.endDate) : now) : now;
      const roomHistory = history.filter((h) => h.roomId === t.roomId);
      for (const month of monthRange(monthOf(t.startDate), last)) {
        if (have.has(`${t.id}:${month}`)) continue;
        const amountDue = chargeAmount({
          rent: tenancyRent(t, roomHistory, month),
          startDate: t.startDate,
          endDate: t.endDate,
          month,
          prorate: settings.prorate,
        });
        toInsert.push({ tenancyId: t.id, month, amountDue, dueDate: dueDateFor(month, settings.dueDay), status: "UNPAID" });
        touched.add(t.id);
      }
    }
    if (toInsert.length) await m.getRepository(RentCharge).insert(toInsert);
    for (const id of touched) await applyCredit(m, id);
    return toInsert.length;
  });
}

async function chargesWithPaid(m: EntityManager, tenancyId: number) {
  const rows: { id: number; month: string; amountDue: number; paid: string }[] = await m.query(
    `SELECT c.id, c.month, c."amountDue",
            COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id), 0) AS paid
       FROM rent_charges c WHERE c."tenancyId" = $1 ORDER BY c.month`,
    [tenancyId],
  );
  return rows.map((r) => ({ id: r.id, month: r.month, amountDue: r.amountDue, paid: Number(r.paid) }));
}

export async function refreshStatuses(m: EntityManager, tenancyId: number) {
  for (const c of await chargesWithPaid(m, tenancyId)) {
    await m.getRepository(RentCharge).update(c.id, { status: statusFor(c.amountDue, c.paid) });
  }
}

/** Apply unallocated payment remainders (advance credit) to the oldest unpaid charges. */
export async function applyCredit(m: EntityManager, tenancyId: number, targetChargeId?: number | null) {
  const pays: { id: number; left: string }[] = await m.query(
    `SELECT p.id, p.amount - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."paymentId" = p.id), 0) AS left
       FROM payments p WHERE p."tenancyId" = $1 ORDER BY p."paidOn", p.id`,
    [tenancyId],
  );
  for (const p of pays) {
    const left = Number(p.left);
    if (left <= 0) continue;
    const charges = await chargesWithPaid(m, tenancyId);
    const { allocations } = allocate(charges, left, targetChargeId);
    if (allocations.length) {
      await m.getRepository(PaymentAllocation).insert(allocations.map((a) => ({ paymentId: p.id, ...a })));
    }
  }
  await refreshStatuses(m, tenancyId);
}

export interface PaymentInput {
  tenancyId: number;
  amount: number;
  paidOn: string;
  method: PayMethod;
  chargeId?: number | null;
  /** Month (YYYY-MM) the rent is for; used when no chargeId is given. */
  forMonth?: string | null;
  referenceNo?: string | null;
  receivedIntoAccount?: string | null;
  note?: string | null;
}

export async function recordPayment(actor: Actor, input: PaymentInput) {
  if (input.amount <= 0) throw new Error("Amount must be greater than zero");
  await ensureCharges(actor.orgId);
  const db = await getDb();
  return db.transaction(async (m) => {
    await tenancyFor(m, actor, input.tenancyId);
    const { chargeId: pickedCharge, forMonth, ...rest } = input;
    let chargeId = pickedCharge;
    if (!chargeId && forMonth) {
      const [c] = await m.query(`SELECT id FROM rent_charges WHERE "tenancyId" = $1 AND month = $2`, [input.tenancyId, forMonth]);
      chargeId = c?.id ?? null; // no charge yet (future month): falls back to oldest-first / advance credit
    }
    const res = await m.getRepository(Payment).insert({ ...rest, recordedById: actor.id });
    const id = res.identifiers[0].id as number;
    await applyCredit(m, input.tenancyId, chargeId);
    await audit(m, actor, "CREATE", "Payment", id, null, { ...input, chargeId });
    return id;
  });
}

export async function deletePayment(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const p = await paymentFor(m, actor, id);
    await m.getRepository(Payment).delete(id); // allocations cascade
    await applyCredit(m, p.tenancyId); // freed money may flow to other charges, then statuses refresh
    await audit(m, actor, "DELETE", "Payment", id, p, null);
  });
}

/** Outstanding on charges, advance credit, and net balance (positive = tenant owes). */
export async function tenancyBalance(actor: Actor, tenancyId: number) {
  const db = await getDb();
  await tenancyFor(db.manager, actor, tenancyId);
  const [r] = await db.query(
    `SELECT
       COALESCE((SELECT SUM("amountDue") FROM rent_charges WHERE "tenancyId" = $1), 0) AS charged,
       COALESCE((SELECT SUM(amount) FROM payments WHERE "tenancyId" = $1), 0) AS paid`,
    [tenancyId],
  );
  const charged = Number(r.charged);
  const paid = Number(r.paid);
  return { charged, paid, balance: charged - paid };
}

/** Called when a tenancy ends: re-price the final month and drop charges after it. */
export async function adjustChargesOnMoveOut(m: EntityManager, orgId: number, t: Tenancy, endDate: string) {
  const settings = await getSettings(orgId);
  const history = await m.getRepository(RoomRentHistory).findBy({ roomId: t.roomId });
  const endMonth = monthOf(endDate);
  const charges = await m.getRepository(RentCharge).findBy({ tenancyId: t.id });
  for (const c of charges) {
    if (c.month > endMonth) {
      await m.getRepository(RentCharge).delete(c.id); // allocations cascade → payments become credit
    } else if (c.month === endMonth) {
      const amountDue = chargeAmount({
        rent: tenancyRent(t, history, c.month),
        startDate: t.startDate,
        endDate,
        month: c.month,
        prorate: settings.prorate,
      });
      await m.getRepository(RentCharge).update(c.id, { amountDue });
      // If the re-priced charge is now over-paid, release its allocations so the money becomes credit.
      await m.query(
        `DELETE FROM payment_allocations WHERE "chargeId" = $1
           AND (SELECT SUM(amount) FROM payment_allocations WHERE "chargeId" = $1) > $2`,
        [c.id, amountDue],
      );
    }
  }
  await applyCredit(m, t.id);
}

/** Cron entry point: every organization. */
export async function ensureChargesAll(): Promise<number> {
  const db = await getDb();
  const orgs: { id: number }[] = await db.query(`SELECT id FROM organizations`);
  let created = 0;
  for (const o of orgs) created += await ensureCharges(o.id);
  return created;
}

export { today };
