// Read models for pages and exports. Plain SQL over the TypeORM connection.
// Every function takes the Actor first and filters on the houses that actor may see ($1 = int[]),
// so org isolation and manager scoping cannot be forgotten by a page.
import { getDb } from "../db/data-source";
import { addMonths, daysBetween } from "./billing-core";
import { isOwner, scopeHouses, today, type Actor } from "./common";

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.query(sql, params);
}

const PAID = `COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id), 0)::int`;
const HS = `= ANY($1::int[])`;

/** Small builder for "WHERE" fragments with numbered params after $1. */
function where(first: unknown[]) {
  const w: string[] = [];
  const p: unknown[] = [...first];
  return {
    p,
    add(sql: string, v: unknown) { p.push(v); w.push(sql.replaceAll("?", `$${p.length}`)); },
    sql: () => (w.length ? " AND " + w.join(" AND ") : ""),
  };
}

// ---- locations / houses ------------------------------------------------------

export const listLocations = (a: Actor) =>
  q(
    `SELECT l.id, l.name, l.notes FROM locations l
      WHERE l."orgId" = $1 AND ($2 OR l.id IN (SELECT "locationId" FROM houses WHERE id ${`= ANY($3::int[])`}))
      ORDER BY l.name`,
    [a.orgId, isOwner(a), a.houseIds],
  );

export const listHouses = (a: Actor, locationId?: number) =>
  q(
    `SELECT h.id, h."locationId", h.name, h.address, h.active, l.name AS "locationName"
       FROM houses h JOIN locations l ON l.id = h."locationId"
      WHERE h.id ${HS} ${locationId ? `AND h."locationId" = $2` : ""} ORDER BY l.name, h.name`,
    locationId ? [a.houseIds, locationId] : [a.houseIds],
  );

export const houseOptions = (a: Actor) =>
  q(`SELECT h.id, h.name, l.name AS "locationName" FROM houses h JOIN locations l ON l.id = h."locationId"
      WHERE h.active AND h.id ${HS} ORDER BY l.name, h.name`, [a.houseIds]);

// ---- rooms ------------------------------------------------------------------

export interface RoomRow {
  id: number; number: string; floorId: number; floorNumber: number; floorName: string;
  houseId: number; houseName: string; rentalType: "MONTHLY" | "DAILY";
  currentRent: number; status: string; notes: string | null;
  tenantName: string | null; tenancyId: number | null; tenantId: number | null;
}

export async function listRooms(a: Actor, houseId?: number | null): Promise<RoomRow[]> {
  return q(`
    SELECT r.id, r.number, r."floorId", f.number AS "floorNumber", f.name AS "floorName",
           r."houseId", h.name AS "houseName", r."rentalType",
           r."currentRent", r.status, r.notes,
           t.name AS "tenantName", y.id AS "tenancyId", t.id AS "tenantId"
      FROM rooms r JOIN floors f ON f.id = r."floorId" JOIN houses h ON h.id = r."houseId"
      LEFT JOIN tenancies y ON y."roomId" = r.id AND y.status = 'ACTIVE'
      LEFT JOIN tenants t ON t.id = y."tenantId"
     WHERE r."houseId" ${HS}
     ORDER BY h.name, f.number, r.number`, [scopeHouses(a, houseId)]);
}

export const listFloors = (a: Actor, houseId?: number | null) =>
  q(`SELECT id, number, name, "houseId" FROM floors WHERE "houseId" ${HS} ORDER BY number`, [scopeHouses(a, houseId)]);

export const roomRentHistory = (a: Actor, roomId: number) =>
  q(`SELECT rh.id, rh.rent, rh."rentalType", rh."effectiveFrom" FROM room_rent_history rh JOIN rooms r ON r.id = rh."roomId"
      WHERE rh."roomId" = $2 AND r."houseId" ${HS} ORDER BY rh."effectiveFrom" DESC, rh.id DESC`, [a.houseIds, roomId]);

/** Vacant rooms available for a new monthly tenancy (daily rooms use stays instead). */
export const vacantRooms = (a: Actor, houseId?: number | null) =>
  q(
    `SELECT r.id, r.number, r."currentRent", r."houseId", h.name AS "houseName" FROM rooms r JOIN houses h ON h.id = r."houseId"
      WHERE r.status = 'VACANT' AND r."rentalType" = 'MONTHLY' AND r."houseId" ${HS}
      ORDER BY h.name, r.number`,
    [scopeHouses(a, houseId)],
  );

/** Daily rooms (any status except maintenance) that can take a new booking. */
export const bookableDailyRooms = (a: Actor, houseId?: number | null) =>
  q(
    `SELECT r.id, r.number, r."currentRent" AS "dailyRate", r."houseId", h.name AS "houseName" FROM rooms r JOIN houses h ON h.id = r."houseId"
      WHERE r.status <> 'MAINTENANCE' AND r."rentalType" = 'DAILY' AND r."houseId" ${HS}
      ORDER BY h.name, r.number`,
    [scopeHouses(a, houseId)],
  );

// ---- stays (daily rentals) -----------------------------------------------------

export interface StayRow {
  id: number; roomId: number; roomNumber: string; houseId: number; houseName: string;
  guestName: string; phone: string | null; checkIn: string; checkOut: string | null;
  dailyRate: number; status: "BOOKED" | "ACTIVE" | "ENDED" | "CANCELLED";
  nights: number; amountDue: number; paid: number; balance: number;
}

const STAY_NIGHTS = `GREATEST(0, (COALESCE(s."checkOut", CURRENT_DATE) - s."checkIn"))::int`;
const STAY_PAID = `COALESCE((SELECT SUM(amount) FROM stay_payments WHERE "stayId" = s.id), 0)::int`;

export async function listStays(a: Actor, opts: { houseId?: number | null; status?: string; roomId?: number; id?: number } = {}): Promise<StayRow[]> {
  const w = where([scopeHouses(a, opts.houseId)]);
  if (opts.status) w.add(`s.status = ?`, opts.status);
  if (opts.roomId) w.add(`s."roomId" = ?`, opts.roomId);
  if (opts.id) w.add(`s.id = ?`, opts.id);
  return q<StayRow>(`
    SELECT s.id, s."roomId", r.number AS "roomNumber", r."houseId", h.name AS "houseName",
           s."guestName", s.phone, s."checkIn", s."checkOut", s."dailyRate", s.status,
           ${STAY_NIGHTS} AS nights, (s."dailyRate" * ${STAY_NIGHTS})::int AS "amountDue",
           ${STAY_PAID} AS paid, (s."dailyRate" * ${STAY_NIGHTS} - ${STAY_PAID})::int AS balance
      FROM stays s JOIN rooms r ON r.id = s."roomId" JOIN houses h ON h.id = r."houseId"
     WHERE r."houseId" ${HS}${w.sql()}
     ORDER BY (s.status = 'ACTIVE') DESC, (s.status = 'BOOKED') DESC, s."checkIn" DESC`, w.p);
}

export async function stayDetail(a: Actor, id: number) {
  const [stay] = await listStays(a, { id });
  if (!stay) return null;
  const payments = await q(
    `SELECT id, amount, "paidOn", method, "referenceNo", note FROM stay_payments WHERE "stayId" = $1 ORDER BY "paidOn", id`,
    [id],
  );
  return { stay, payments };
}

/** One daily room's month: every non-cancelled stay touching it, plus occupied / vacant night counts. */
export async function roomCalendar(a: Actor, roomId: number, month: string) {
  const from = `${month}-01`;
  const to = `${addMonths(month, 1)}-01`;
  const [room] = await q(
    `SELECT r.id, r.number, r."rentalType", r."currentRent", r."houseId", h.name AS "houseName"
       FROM rooms r JOIN houses h ON h.id = r."houseId" WHERE r.id = $2 AND r."houseId" ${HS}`,
    [a.houseIds, roomId],
  );
  if (!room) return null;
  const stays = await q(
    `SELECT s.id, s."guestName", s.phone, s."checkIn", s."checkOut", s."dailyRate", s.status
       FROM stays s WHERE s."roomId" = $1 AND s.status <> 'CANCELLED'
        AND s."checkIn" < $3::date AND COALESCE(s."checkOut", $3::date) > $2::date
      ORDER BY s."checkIn"`,
    [roomId, from, to],
  );
  const days = daysBetween(from, to);
  // An open-ended stay occupies the room up to and including today.
  const tomorrow = new Date(Date.parse(today()) + 86_400_000).toISOString().slice(0, 10);
  let occupied = 0;
  for (const s of stays) {
    const start = s.checkIn > from ? s.checkIn : from;
    const stayEnd = s.checkOut ?? tomorrow;
    const end = stayEnd < to ? stayEnd : to;
    occupied += Math.max(0, daysBetween(start, end));
  }
  occupied = Math.min(occupied, days);
  return { room, stays, days, occupied, vacant: days - occupied };
}

// ---- rent collection ----------------------------------------------------------

export interface RentRow {
  chargeId: number; tenancyId: number; tenantId: number; tenantName: string; phone: string | null;
  roomNumber: string; roomId: number; houseName: string; month: string; amountDue: number; paid: number; balance: number;
  status: "PAID" | "PARTIAL" | "UNPAID"; dueDate: string;
}

export interface MonthlyReceiptPaymentLine {
  paidOn: string;
  method: string;
  referenceNo: string | null;
  amount: number;
}

export interface MonthlyReceiptRow extends RentRow {
  payments: MonthlyReceiptPaymentLine[];
}

export async function monthlyReceiptRows(a: Actor, month: string, houseId?: number | null): Promise<MonthlyReceiptRow[]> {
  const rows = await q<RentRow & { payments: MonthlyReceiptPaymentLine[] | string }>(
    `SELECT c.id AS "chargeId", c."tenancyId", t.id AS "tenantId", t.name AS "tenantName", t.phone,
            r.number AS "roomNumber", r.id AS "roomId", h.name AS "houseName", c.month, c."amountDue", ${PAID} AS paid,
            (c."amountDue" - ${PAID}) AS balance, c.status, c."dueDate",
            COALESCE((
              SELECT json_agg(json_build_object(
                'paidOn', p."paidOn", 'method', p.method, 'referenceNo', p."referenceNo", 'amount', al.amount
              ) ORDER BY p."paidOn", p.id)
              FROM payment_allocations al
              JOIN payments p ON p.id = al."paymentId"
              WHERE al."chargeId" = c.id
            ), '[]'::json) AS payments
       FROM rent_charges c
       JOIN tenancies y ON y.id = c."tenancyId"
       JOIN tenants t ON t.id = y."tenantId"
       JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE r."houseId" ${HS} AND c.month = $2
      ORDER BY h.name, r.number`,
    [scopeHouses(a, houseId), month],
  );
  return rows.map((r) => ({ ...r, payments: Array.isArray(r.payments) ? r.payments : [] }));
}

export async function rentTable(a: Actor, month: string, status?: string, houseId?: number | null): Promise<RentRow[]> {
  const w = where([scopeHouses(a, houseId), month]);
  if (status) w.add(`c.status = ?`, status);
  return q<RentRow>(
    `SELECT c.id AS "chargeId", c."tenancyId", t.id AS "tenantId", t.name AS "tenantName", t.phone,
            r.number AS "roomNumber", r.id AS "roomId", h.name AS "houseName", c.month, c."amountDue", ${PAID} AS paid,
            (c."amountDue" - ${PAID}) AS balance, c.status, c."dueDate"
       FROM rent_charges c
       JOIN tenancies y ON y.id = c."tenancyId"
       JOIN tenants t ON t.id = y."tenantId"
       JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE r."houseId" ${HS} AND c.month = $2${w.sql()}
      ORDER BY h.name, r.number`,
    w.p,
  );
}

/** Active tenancies for the "record payment" picker, with outstanding balance + credit. */
export async function activeTenancyOptions(a: Actor, houseId?: number | null) {
  return q(`
    SELECT y.id, t.name AS "tenantName", r.number AS "roomNumber", h.name AS "houseName",
           COALESCE((SELECT SUM(c."amountDue" - ${PAID}) FROM rent_charges c WHERE c."tenancyId" = y.id), 0)::int AS due
      FROM tenancies y JOIN tenants t ON t.id = y."tenantId" JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
     WHERE y.status = 'ACTIVE' AND r."houseId" ${HS} ORDER BY h.name, r.number`, [scopeHouses(a, houseId)]);
}

export const openCharges = (a: Actor, tenancyId: number) =>
  q(`SELECT c.id, c.month, c."amountDue", ${PAID} AS paid FROM rent_charges c
       JOIN tenancies y ON y.id = c."tenancyId" JOIN rooms r ON r.id = y."roomId"
      WHERE c."tenancyId" = $2 AND r."houseId" ${HS} AND c."amountDue" > ${PAID} ORDER BY c.month`, [a.houseIds, tenancyId]);

// ---- dashboard ----------------------------------------------------------------

export async function kpis(a: Actor, month: string, houseId?: number | null) {
  const hs = scopeHouses(a, houseId);
  const [rent] = await q(
    `SELECT COALESCE(SUM(c."amountDue"),0)::int AS expected, COALESCE(SUM(${PAID}),0)::int AS collected
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId" JOIN rooms r ON r.id = y."roomId"
      WHERE r."houseId" ${HS} AND c.month = $2`,
    [hs, month],
  );
  const [recv] = await q(
    `SELECT COALESCE(SUM(p.amount),0)::int AS received FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN rooms r ON r.id = y."roomId"
      WHERE r."houseId" ${HS} AND to_char(p."paidOn",'YYYY-MM') = $2`,
    [hs, month],
  );
  const [dailyRecv] = await q(
    `SELECT COALESCE(SUM(sp.amount),0)::int AS received FROM stay_payments sp JOIN stays s ON s.id = sp."stayId" JOIN rooms r ON r.id = s."roomId"
      WHERE r."houseId" ${HS} AND to_char(sp."paidOn",'YYYY-MM') = $2`,
    [hs, month],
  );
  const [exp] = await q(
    `SELECT COALESCE(SUM(e.amount),0)::int AS expenses FROM expenses e WHERE e."houseId" ${HS} AND e."billMonth" = $2`,
    [hs, month],
  );
  const [occ] = await q(
    `SELECT COUNT(*) FILTER (WHERE status = 'OCCUPIED' AND "rentalType" = 'MONTHLY')::int AS occupied,
            COUNT(*) FILTER (WHERE "rentalType" = 'MONTHLY')::int AS total
       FROM rooms WHERE "houseId" ${HS}`,
    [hs],
  );
  const received = (recv.received as number) + (dailyRecv.received as number);
  return {
    expected: rent.expected as number,
    collected: rent.collected as number,
    pending: (rent.expected - rent.collected) as number,
    received,
    dailyReceived: dailyRecv.received as number,
    expenses: exp.expenses as number,
    net: (received - exp.expenses) as number,
    occupied: occ.occupied as number,
    totalRooms: occ.total as number,
  };
}

export async function roomTiles(a: Actor, month: string, houseId?: number | null) {
  return q(`
    SELECT r.id, r.number, r."floorId", f.number AS "floorNumber", f.name AS "floorName", r.status AS "roomStatus",
           r."rentalType", r."houseId", h.name AS "houseName",
           t.name AS "tenantName", t.id AS "tenantId", c."amountDue", ${PAID} AS paid, c.status AS "chargeStatus"
      FROM rooms r JOIN floors f ON f.id = r."floorId" JOIN houses h ON h.id = r."houseId"
      LEFT JOIN tenancies y ON y."roomId" = r.id
      LEFT JOIN rent_charges c ON c."tenancyId" = y.id AND c.month = $2
      LEFT JOIN tenants t ON t.id = y."tenantId"
     WHERE (c.id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM tenancies y2 JOIN rent_charges c2 ON c2."tenancyId" = y2.id
             WHERE y2."roomId" = r.id AND c2.month = $2))
       AND r."houseId" ${HS}
     ORDER BY h.name, f.number, r.number`, [scopeHouses(a, houseId), month]);
}

/** Cash income (monthly payments + daily stay payments) vs expenses for the 12 months ending at `month`. */
export async function trend(a: Actor, month: string, houseId?: number | null) {
  const start = addMonths(month, -11);
  const rows = await q(
    `WITH m AS (SELECT to_char(d,'YYYY-MM') AS month FROM generate_series($2::date, $3::date, interval '1 month') d)
     SELECT m.month,
       COALESCE((SELECT SUM(c."amountDue") FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId" JOIN rooms r ON r.id = y."roomId"
                  WHERE c.month = m.month AND r."houseId" ${HS}),0)::int AS expected,
       COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN rent_charges c ON c.id = a."chargeId"
                  JOIN tenancies y ON y.id = c."tenancyId" JOIN rooms r ON r.id = y."roomId"
                  WHERE c.month = m.month AND r."houseId" ${HS}),0)::int AS collected,
       (COALESCE((SELECT SUM(p.amount) FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN rooms r ON r.id = y."roomId"
                  WHERE to_char(p."paidOn",'YYYY-MM') = m.month AND r."houseId" ${HS}),0)
        + COALESCE((SELECT SUM(sp.amount) FROM stay_payments sp JOIN stays s ON s.id = sp."stayId" JOIN rooms r ON r.id = s."roomId"
                  WHERE to_char(sp."paidOn",'YYYY-MM') = m.month AND r."houseId" ${HS}),0))::int AS received,
       COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e."billMonth" = m.month AND e."houseId" ${HS}),0)::int AS expenses
     FROM m ORDER BY m.month`,
    [scopeHouses(a, houseId), `${start}-01`, `${month}-01`],
  );
  return rows.map((r) => ({ ...r, net: r.received - r.expenses }));
}

export const expensesByCategory = (a: Actor, month: string, houseId?: number | null) =>
  q(`SELECT k.name, SUM(e.amount)::int AS value FROM expenses e JOIN expense_categories k ON k.id = e."categoryId"
      WHERE e."houseId" ${HS} AND e."billMonth" = $2 GROUP BY k.name ORDER BY value DESC`, [scopeHouses(a, houseId), month]);

export async function overdue(a: Actor, houseId?: number | null) {
  const t = today();
  const rows = await q(
    `SELECT te.id AS "tenantId", te.name, te.phone, r.number AS "roomNumber", y.id AS "tenancyId",
            SUM(c."amountDue" - ${PAID})::int AS owed, MIN(c."dueDate") AS "oldestDue", COUNT(*)::int AS months
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId"
       JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
      WHERE r."houseId" ${HS} AND c."dueDate" < $2 AND c."amountDue" > ${PAID}
      GROUP BY te.id, te.name, te.phone, r.number, y.id ORDER BY MIN(c."dueDate")`,
    [scopeHouses(a, houseId), t],
  );
  return rows.map((r) => ({ ...r, daysOverdue: daysBetween(r.oldestDue, t) }));
}

export const recentPayments = (a: Actor, n = 6, houseId?: number | null) =>
  q(`SELECT p.id, p.amount, p."paidOn", p.method, te.name AS "tenantName", r.number AS "roomNumber"
       FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
      WHERE r."houseId" ${HS} ORDER BY p."paidOn" DESC, p.id DESC LIMIT $2`, [scopeHouses(a, houseId), n]);

export const recentExpenses = (a: Actor, n = 6, houseId?: number | null) =>
  q(`SELECT e.id, e.amount, e.date, k.name AS category, e.vendor FROM expenses e JOIN expense_categories k ON k.id = e."categoryId"
      WHERE e."houseId" ${HS} ORDER BY e.date DESC, e.id DESC LIMIT $2`, [scopeHouses(a, houseId), n]);

// ---- ledgers -------------------------------------------------------------------

export interface PaymentFilter { from?: string; to?: string; method?: string; tenantId?: number; roomId?: number; houseId?: number | null }

export async function paymentsLedger(a: Actor, f: PaymentFilter) {
  const w = where([scopeHouses(a, f.houseId)]);
  if (f.from) w.add(`p."paidOn" >= ?`, f.from);
  if (f.to) w.add(`p."paidOn" <= ?`, f.to);
  if (f.method) w.add(`p.method = ?`, f.method);
  if (f.tenantId) w.add(`te.id = ?`, f.tenantId);
  if (f.roomId) w.add(`r.id = ?`, f.roomId);
  return q(
    `SELECT p.id, p.amount, p."paidOn", p.method, p."referenceNo", p."receivedIntoAccount", p.note,
            te.id AS "tenantId", te.name AS "tenantName", r.number AS "roomNumber", h.name AS "houseName",
            COALESCE((SELECT string_agg(c.month, ', ' ORDER BY c.month) FROM payment_allocations al JOIN rent_charges c ON c.id = al."chargeId" WHERE al."paymentId" = p.id), '') AS months,
            (p.amount - COALESCE((SELECT SUM(al.amount) FROM payment_allocations al WHERE al."paymentId" = p.id),0))::int AS credit
       FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN tenants te ON te.id = y."tenantId"
       JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE r."houseId" ${HS}${w.sql()} ORDER BY p."paidOn" DESC, p.id DESC`, w.p);
}

export async function receipt(a: Actor, id: number) {
  const [row] = await q(
    `SELECT p.*, te.name AS "tenantName", te.phone, r.number AS "roomNumber", u.name AS "recordedBy",
            COALESCE((SELECT string_agg(c.month || ' (₹' || al.amount || ')', ', ' ORDER BY c.month) FROM payment_allocations al JOIN rent_charges c ON c.id = al."chargeId" WHERE al."paymentId" = p.id), '') AS applied
       FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
       LEFT JOIN users u ON u.id = p."recordedById" WHERE p.id = $2 AND r."houseId" ${HS}`, [a.houseIds, id]);
  return row;
}

export interface ExpenseFilter { from?: string; to?: string; categoryId?: number; month?: string; houseId?: number | null }

export async function expensesList(a: Actor, f: ExpenseFilter) {
  const w = where([scopeHouses(a, f.houseId)]);
  if (f.month) w.add(`e."billMonth" = ?`, f.month);
  if (f.from) w.add(`e.date >= ?`, f.from);
  if (f.to) w.add(`e.date <= ?`, f.to);
  if (f.categoryId) w.add(`e."categoryId" = ?`, f.categoryId);
  return q(
    `SELECT e.id, e.amount, e.date, e."billMonth", e.vendor, e."billNo", e."paymentMethod", e.note, e."attachmentUrl",
            e."categoryId", k.name AS category, e."roomId", r.number AS "roomNumber", e."houseId", h.name AS "houseName"
       FROM expenses e JOIN expense_categories k ON k.id = e."categoryId" JOIN houses h ON h.id = e."houseId"
       LEFT JOIN rooms r ON r.id = e."roomId"
      WHERE e."houseId" ${HS}${w.sql()} ORDER BY e.date DESC, e.id DESC`, w.p);
}

export const listCategories = (a: Actor) =>
  q(`SELECT id, name FROM expense_categories WHERE "orgId" = $1 ORDER BY name`, [a.orgId]);

// ---- tenants --------------------------------------------------------------------

export async function tenantsList(a: Actor, search?: string, houseId?: number | null) {
  const w = where([scopeHouses(a, houseId)]);
  if (search) w.add(`(te.name ILIKE ? OR te.phone ILIKE ? OR r.number ILIKE ?)`, `%${search}%`);
  return q(
    `SELECT te.id, te.name, te.phone, r.number AS "roomNumber", h.name AS "houseName", y.id AS "tenancyId", y."startDate",
            COALESCE((SELECT SUM(c."amountDue") FROM rent_charges c JOIN tenancies y2 ON y2.id = c."tenancyId" WHERE y2."tenantId" = te.id),0)::int
          - COALESCE((SELECT SUM(p.amount) FROM payments p JOIN tenancies y2 ON y2.id = p."tenancyId" WHERE y2."tenantId" = te.id),0)::int AS balance
       FROM tenants te JOIN houses h ON h.id = te."houseId"
       LEFT JOIN tenancies y ON y."tenantId" = te.id AND y.status = 'ACTIVE'
       LEFT JOIN rooms r ON r.id = y."roomId"
      WHERE te."houseId" ${HS}${w.sql()} ORDER BY (y.id IS NULL), h.name, r.number, te.name`, w.p);
}

export async function tenantDetail(a: Actor, id: number) {
  const [tenant] = await q(`SELECT * FROM tenants WHERE id = $2 AND "houseId" ${HS}`, [a.houseIds, id]);
  if (!tenant) return null;
  const tenancies = await q(
    `SELECT y.*, r.number AS "roomNumber" FROM tenancies y JOIN rooms r ON r.id = y."roomId" WHERE y."tenantId" = $1 ORDER BY y."startDate" DESC`, [id]);
  const charges = await q(
    `SELECT c.id, c.month, c."amountDue", c."dueDate", c.status, ${PAID} AS paid, r.number AS "roomNumber"
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId" JOIN rooms r ON r.id = y."roomId"
      WHERE y."tenantId" = $1 ORDER BY c.month DESC`, [id]);
  const payments = await paymentsLedger(a, { tenantId: id });
  const charged = charges.reduce((s, c) => s + c.amountDue, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return { tenant, tenancies, charges, payments, charged, paid, balance: charged - paid };
}

// ---- reports -----------------------------------------------------------------------

export async function pnlByMonth(a: Actor, year: number, houseId?: number | null) {
  const rows = await q(
    `WITH m AS (SELECT to_char(d,'YYYY-MM') AS month FROM generate_series($2::date, $3::date, interval '1 month') d)
     SELECT m.month,
       (COALESCE((SELECT SUM(p.amount) FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN rooms r ON r.id = y."roomId"
                   WHERE to_char(p."paidOn",'YYYY-MM') = m.month AND r."houseId" ${HS}),0)
        + COALESCE((SELECT SUM(sp.amount) FROM stay_payments sp JOIN stays s ON s.id = sp."stayId" JOIN rooms r ON r.id = s."roomId"
                   WHERE to_char(sp."paidOn",'YYYY-MM') = m.month AND r."houseId" ${HS}),0))::int AS income,
       COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e."billMonth" = m.month AND e."houseId" ${HS}),0)::int AS expenses
     FROM m ORDER BY m.month`, [scopeHouses(a, houseId), `${year}-01-01`, `${year}-12-01`]);
  return rows.map((r) => ({ ...r, net: r.income - r.expenses }));
}

export const expenseByCategoryYear = (a: Actor, year: number, houseId?: number | null) =>
  q(`SELECT k.name, SUM(e.amount)::int AS total FROM expenses e JOIN expense_categories k ON k.id = e."categoryId"
      WHERE e."houseId" ${HS} AND e."billMonth" LIKE $2 GROUP BY k.name ORDER BY total DESC`, [scopeHouses(a, houseId), `${year}-%`]);

export const roomWise = (a: Actor, year: number, houseId?: number | null) =>
  q(`SELECT r.number AS room, h.name AS house,
            COALESCE(SUM(c."amountDue"),0)::int AS expected,
            COALESCE(SUM(${PAID}),0)::int AS collected,
            (COALESCE(SUM(c."amountDue"),0) - COALESCE(SUM(${PAID}),0))::int AS pending
       FROM rooms r JOIN houses h ON h.id = r."houseId"
       LEFT JOIN tenancies y ON y."roomId" = r.id
       LEFT JOIN rent_charges c ON c."tenancyId" = y.id AND c.month LIKE $2
      WHERE r."houseId" ${HS}
      GROUP BY r.id, r.number, h.name ORDER BY h.name, r.number`, [scopeHouses(a, houseId), `${year}-%`]);

export const defaulters = overdue;

export async function tenantStatement(a: Actor, tenantId: number) {
  return tenantDetail(a, tenantId);
}

// ---- admin ----------------------------------------------------------------------

export const auditLog = (a: Actor, limit = 200) =>
  q(`SELECT id, "userName", action, entity, "entityId", before, after, "createdAt" FROM audit_logs WHERE "orgId" = $1 ORDER BY id DESC LIMIT $2`, [a.orgId, limit]);

export const usersList = (a: Actor) =>
  q(`SELECT u.id, u.name, u.email, u.role, u.active,
            COALESCE((SELECT array_agg(uh."houseId" ORDER BY uh."houseId") FROM user_houses uh WHERE uh."userId" = u.id), '{}') AS "houseIds"
       FROM users u WHERE u."orgId" = $1 ORDER BY u.id`, [a.orgId]);

export const tenantOptions = (a: Actor, houseId?: number | null) =>
  q(`SELECT id, name FROM tenants WHERE "houseId" ${HS} ORDER BY name`, [scopeHouses(a, houseId)]);

export const tenantsWithoutRoom = (a: Actor, houseId?: number | null) =>
  q(`SELECT te.id, te.name, te."houseId" FROM tenants te WHERE te."houseId" ${HS}
      AND NOT EXISTS (SELECT 1 FROM tenancies y WHERE y."tenantId" = te.id AND y.status = 'ACTIVE') ORDER BY te.name`, [scopeHouses(a, houseId)]);
