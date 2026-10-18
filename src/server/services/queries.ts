// Read models for pages and exports. Plain SQL over the TypeORM connection.
import { getDb } from "../db/data-source";
import { addMonths, daysBetween } from "./billing-core";
import { today } from "./common";

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.query(sql, params);
}

const PAID = `COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id), 0)::int`;

// ---- locations / houses ------------------------------------------------------

export const listLocations = () => q(`SELECT id, name, notes FROM locations ORDER BY name`);

export const listHouses = (locationId?: number) =>
  q(
    `SELECT h.id, h."locationId", h.name, h.address, h.active, l.name AS "locationName"
       FROM houses h JOIN locations l ON l.id = h."locationId"
      ${locationId ? `WHERE h."locationId" = $1` : ""} ORDER BY l.name, h.name`,
    locationId ? [locationId] : [],
  );

export const houseOptions = () =>
  q(`SELECT h.id, h.name, l.name AS "locationName" FROM houses h JOIN locations l ON l.id = h."locationId" WHERE h.active ORDER BY l.name, h.name`);

// ---- rooms ------------------------------------------------------------------

export interface RoomRow {
  id: number; number: string; floorId: number; floorNumber: number; floorName: string;
  houseId: number; houseName: string; rentalType: "MONTHLY" | "DAILY";
  currentRent: number; status: string; notes: string | null;
  tenantName: string | null; tenancyId: number | null; tenantId: number | null;
}

export async function listRooms(houseId?: number): Promise<RoomRow[]> {
  return q(`
    SELECT r.id, r.number, r."floorId", f.number AS "floorNumber", f.name AS "floorName",
           r."houseId", h.name AS "houseName", r."rentalType",
           r."currentRent", r.status, r.notes,
           t.name AS "tenantName", y.id AS "tenancyId", t.id AS "tenantId"
      FROM rooms r JOIN floors f ON f.id = r."floorId" JOIN houses h ON h.id = r."houseId"
      LEFT JOIN tenancies y ON y."roomId" = r.id AND y.status = 'ACTIVE'
      LEFT JOIN tenants t ON t.id = y."tenantId"
     ${houseId ? `WHERE r."houseId" = $1` : ""}
     ORDER BY f.number, r.number`, houseId ? [houseId] : []);
}

export const listFloors = (houseId?: number) =>
  q(`SELECT id, number, name, "houseId" FROM floors ${houseId ? `WHERE "houseId" = $1` : ""} ORDER BY number`, houseId ? [houseId] : []);

export const roomRentHistory = (roomId: number) =>
  q(`SELECT id, rent, "rentalType", "effectiveFrom" FROM room_rent_history WHERE "roomId" = $1 ORDER BY "effectiveFrom" DESC, id DESC`, [roomId]);

/** Vacant rooms available for a new monthly tenancy (daily rooms use stays instead). */
export const vacantRooms = (houseId?: number) =>
  q(
    `SELECT r.id, r.number, r."currentRent" FROM rooms r
      WHERE r.status = 'VACANT' AND r."rentalType" = 'MONTHLY' ${houseId ? `AND r."houseId" = $1` : ""}
      ORDER BY r.number`,
    houseId ? [houseId] : [],
  );

/** Vacant daily rooms available for a new guest stay. */
export const vacantDailyRooms = (houseId?: number) =>
  q(
    `SELECT r.id, r.number, r."currentRent" AS "dailyRate" FROM rooms r
      WHERE r.status = 'VACANT' AND r."rentalType" = 'DAILY' ${houseId ? `AND r."houseId" = $1` : ""}
      ORDER BY r.number`,
    houseId ? [houseId] : [],
  );

// ---- stays (daily rentals) -----------------------------------------------------

export interface StayRow {
  id: number; roomId: number; roomNumber: string; houseId: number; houseName: string;
  guestName: string; phone: string | null; checkIn: string; checkOut: string | null;
  dailyRate: number; status: "ACTIVE" | "ENDED" | "CANCELLED";
  nights: number; amountDue: number; paid: number; balance: number;
}

const STAY_NIGHTS = `GREATEST(0, (COALESCE(s."checkOut", CURRENT_DATE) - s."checkIn"))::int`;
const STAY_PAID = `COALESCE((SELECT SUM(amount) FROM stay_payments WHERE "stayId" = s.id), 0)::int`;

export async function listStays(opts: { houseId?: number; status?: string } = {}): Promise<StayRow[]> {
  const w: string[] = []; const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace("?", `$${p.length}`)); };
  if (opts.houseId) add(`r."houseId" = ?`, opts.houseId);
  if (opts.status) add(`s.status = ?`, opts.status);
  const rows = await q<StayRow & { amountDue: string | number }>(`
    SELECT s.id, s."roomId", r.number AS "roomNumber", r."houseId", h.name AS "houseName",
           s."guestName", s.phone, s."checkIn", s."checkOut", s."dailyRate", s.status,
           ${STAY_NIGHTS} AS nights, (s."dailyRate" * ${STAY_NIGHTS})::int AS "amountDue",
           ${STAY_PAID} AS paid, (s."dailyRate" * ${STAY_NIGHTS} - ${STAY_PAID})::int AS balance
      FROM stays s JOIN rooms r ON r.id = s."roomId" JOIN houses h ON h.id = r."houseId"
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
     ORDER BY (s.status = 'ACTIVE') DESC, s."checkIn" DESC`, p);
  return rows;
}

export async function stayDetail(id: number) {
  const [stay] = await listStays().then((rows) => rows.filter((r) => r.id === id));
  if (!stay) return null;
  const payments = await q(
    `SELECT id, amount, "paidOn", method, "referenceNo", note FROM stay_payments WHERE "stayId" = $1 ORDER BY "paidOn", id`,
    [id],
  );
  return { stay, payments };
}

// ---- rent collection ----------------------------------------------------------

export interface RentRow {
  chargeId: number; tenancyId: number; tenantId: number; tenantName: string; phone: string | null;
  roomNumber: string; roomId: number; month: string; amountDue: number; paid: number; balance: number;
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

export async function monthlyReceiptRows(month: string): Promise<MonthlyReceiptRow[]> {
  const rows = await q<
    RentRow & { payments: MonthlyReceiptPaymentLine[] | string }
  >(
    `SELECT c.id AS "chargeId", c."tenancyId", t.id AS "tenantId", t.name AS "tenantName", t.phone,
            r.number AS "roomNumber", r.id AS "roomId", c.month, c."amountDue", ${PAID} AS paid,
            (c."amountDue" - ${PAID}) AS balance, c.status, c."dueDate",
            COALESCE((
              SELECT json_agg(json_build_object(
                'paidOn', p."paidOn", 'method', p.method, 'referenceNo', p."referenceNo", 'amount', a.amount
              ) ORDER BY p."paidOn", p.id)
              FROM payment_allocations a
              JOIN payments p ON p.id = a."paymentId"
              WHERE a."chargeId" = c.id
            ), '[]'::json) AS payments
       FROM rent_charges c
       JOIN tenancies y ON y.id = c."tenancyId"
       JOIN tenants t ON t.id = y."tenantId"
       JOIN rooms r ON r.id = y."roomId"
      WHERE c.month = $1
      ORDER BY r.number`,
    [month],
  );
  return rows.map((r) => ({
    ...r,
    payments: Array.isArray(r.payments) ? r.payments : [],
  }));
}

export async function rentTable(month: string, status?: string): Promise<RentRow[]> {
  const rows = await q<RentRow>(
    `SELECT c.id AS "chargeId", c."tenancyId", t.id AS "tenantId", t.name AS "tenantName", t.phone,
            r.number AS "roomNumber", r.id AS "roomId", c.month, c."amountDue", ${PAID} AS paid,
            (c."amountDue" - ${PAID}) AS balance, c.status, c."dueDate"
       FROM rent_charges c
       JOIN tenancies y ON y.id = c."tenancyId"
       JOIN tenants t ON t.id = y."tenantId"
       JOIN rooms r ON r.id = y."roomId"
      WHERE c.month = $1 ${status ? `AND c.status = $2` : ""}
      ORDER BY r.number`,
    status ? [month, status] : [month],
  );
  return rows;
}

/** Active tenancies for the "record payment" picker, with outstanding balance + credit. */
export async function activeTenancyOptions() {
  return q(`
    SELECT y.id, t.name AS "tenantName", r.number AS "roomNumber",
           COALESCE((SELECT SUM(c."amountDue" - ${PAID}) FROM rent_charges c WHERE c."tenancyId" = y.id), 0)::int AS due
      FROM tenancies y JOIN tenants t ON t.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
     WHERE y.status = 'ACTIVE' ORDER BY r.number`);
}

export const openCharges = (tenancyId: number) =>
  q(`SELECT c.id, c.month, c."amountDue", ${PAID} AS paid FROM rent_charges c
      WHERE c."tenancyId" = $1 AND c."amountDue" > ${PAID} ORDER BY c.month`, [tenancyId]);

// ---- dashboard ----------------------------------------------------------------

export async function kpis(month: string, houseId?: number) {
  const scope = houseId ? `AND r."houseId" = $2` : "";
  const [rent] = await q(
    `SELECT COALESCE(SUM(c."amountDue"),0)::int AS expected, COALESCE(SUM(${PAID}),0)::int AS collected
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId" JOIN rooms r ON r.id = y."roomId"
      WHERE c.month = $1 ${scope}`,
    houseId ? [month, houseId] : [month],
  );
  const [recv] = await q(
    `SELECT COALESCE(SUM(p.amount),0)::int AS received FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN rooms r ON r.id = y."roomId"
      WHERE to_char(p."paidOn",'YYYY-MM') = $1 ${scope}`,
    houseId ? [month, houseId] : [month],
  );
  const [dailyRecv] = await q(
    `SELECT COALESCE(SUM(sp.amount),0)::int AS received FROM stay_payments sp JOIN stays s ON s.id = sp."stayId" JOIN rooms r ON r.id = s."roomId"
      WHERE to_char(sp."paidOn",'YYYY-MM') = $1 ${scope}`,
    houseId ? [month, houseId] : [month],
  );
  const [exp] = await q(
    `SELECT COALESCE(SUM(e.amount),0)::int AS expenses FROM expenses e LEFT JOIN rooms r ON r.id = e."roomId"
      WHERE e."billMonth" = $1 ${houseId ? `AND (r.id IS NULL OR r."houseId" = $2)` : ""}`,
    houseId ? [month, houseId] : [month],
  );
  const [occ] = await q(
    `SELECT COUNT(*) FILTER (WHERE status = 'OCCUPIED' AND "rentalType" = 'MONTHLY')::int AS occupied,
            COUNT(*) FILTER (WHERE "rentalType" = 'MONTHLY')::int AS total
       FROM rooms ${houseId ? `WHERE "houseId" = $1` : ""}`,
    houseId ? [houseId] : [],
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

export async function roomTiles(month: string, houseId?: number) {
  return q(`
    SELECT r.id, r.number, r."floorId", f.number AS "floorNumber", f.name AS "floorName", r.status AS "roomStatus",
           t.name AS "tenantName", t.id AS "tenantId", c."amountDue", ${PAID} AS paid, c.status AS "chargeStatus"
      FROM rooms r JOIN floors f ON f.id = r."floorId"
      LEFT JOIN tenancies y ON y."roomId" = r.id
      LEFT JOIN rent_charges c ON c."tenancyId" = y.id AND c.month = $1
      LEFT JOIN tenants t ON t.id = y."tenantId"
     WHERE (c.id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM tenancies y2 JOIN rent_charges c2 ON c2."tenancyId" = y2.id
             WHERE y2."roomId" = r.id AND c2.month = $1))
       ${houseId ? `AND r."houseId" = $2` : ""}
     ORDER BY f.number, r.number`, houseId ? [month, houseId] : [month]);
}

export async function trend(month: string) {
  const start = addMonths(month, -11);
  const rows = await q(
    `WITH m AS (SELECT to_char(d,'YYYY-MM') AS month FROM generate_series($1::date, $2::date, interval '1 month') d)
     SELECT m.month,
       COALESCE((SELECT SUM(c."amountDue") FROM rent_charges c WHERE c.month = m.month),0)::int AS expected,
       COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN rent_charges c ON c.id = a."chargeId" WHERE c.month = m.month),0)::int AS collected,
       COALESCE((SELECT SUM(p.amount) FROM payments p WHERE to_char(p."paidOn",'YYYY-MM') = m.month),0)::int AS received,
       COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e."billMonth" = m.month),0)::int AS expenses
     FROM m ORDER BY m.month`,
    [`${start}-01`, `${month}-01`],
  );
  return rows.map((r) => ({ ...r, net: r.received - r.expenses }));
}

export const expensesByCategory = (month: string) =>
  q(`SELECT k.name, SUM(e.amount)::int AS value FROM expenses e JOIN expense_categories k ON k.id = e."categoryId"
      WHERE e."billMonth" = $1 GROUP BY k.name ORDER BY value DESC`, [month]);

export async function overdue() {
  const t = today();
  const rows = await q(
    `SELECT te.id AS "tenantId", te.name, te.phone, r.number AS "roomNumber", y.id AS "tenancyId",
            SUM(c."amountDue" - ${PAID})::int AS owed, MIN(c."dueDate") AS "oldestDue", COUNT(*)::int AS months
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId"
       JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
      WHERE c."dueDate" < $1 AND c."amountDue" > ${PAID}
      GROUP BY te.id, te.name, te.phone, r.number, y.id ORDER BY MIN(c."dueDate")`,
    [t],
  );
  return rows.map((r) => ({ ...r, daysOverdue: daysBetween(r.oldestDue, t) }));
}

export const recentPayments = (n = 6) =>
  q(`SELECT p.id, p.amount, p."paidOn", p.method, te.name AS "tenantName", r.number AS "roomNumber"
       FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
      ORDER BY p."paidOn" DESC, p.id DESC LIMIT $1`, [n]);

export const recentExpenses = (n = 6) =>
  q(`SELECT e.id, e.amount, e.date, k.name AS category, e.vendor FROM expenses e JOIN expense_categories k ON k.id = e."categoryId"
      ORDER BY e.date DESC, e.id DESC LIMIT $1`, [n]);

// ---- ledgers -------------------------------------------------------------------

export interface PaymentFilter { from?: string; to?: string; method?: string; tenantId?: number; roomId?: number }

export async function paymentsLedger(f: PaymentFilter) {
  const w: string[] = []; const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace("?", `$${p.length}`)); };
  if (f.from) add(`p."paidOn" >= ?`, f.from);
  if (f.to) add(`p."paidOn" <= ?`, f.to);
  if (f.method) add(`p.method = ?`, f.method);
  if (f.tenantId) add(`te.id = ?`, f.tenantId);
  if (f.roomId) add(`r.id = ?`, f.roomId);
  return q(
    `SELECT p.id, p.amount, p."paidOn", p.method, p."referenceNo", p."receivedIntoAccount", p.note,
            te.id AS "tenantId", te.name AS "tenantName", r.number AS "roomNumber",
            COALESCE((SELECT string_agg(c.month, ', ' ORDER BY c.month) FROM payment_allocations a JOIN rent_charges c ON c.id = a."chargeId" WHERE a."paymentId" = p.id), '') AS months,
            (p.amount - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."paymentId" = p.id),0))::int AS credit
       FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
      ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY p."paidOn" DESC, p.id DESC`, p);
}

export async function receipt(id: number) {
  const [row] = await q(
    `SELECT p.*, te.name AS "tenantName", te.phone, r.number AS "roomNumber", u.name AS "recordedBy",
            COALESCE((SELECT string_agg(c.month || ' (₹' || a.amount || ')', ', ' ORDER BY c.month) FROM payment_allocations a JOIN rent_charges c ON c.id = a."chargeId" WHERE a."paymentId" = p.id), '') AS applied
       FROM payments p JOIN tenancies y ON y.id = p."tenancyId" JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId"
       LEFT JOIN users u ON u.id = p."recordedById" WHERE p.id = $1`, [id]);
  return row;
}

export interface ExpenseFilter { from?: string; to?: string; categoryId?: number; month?: string }

export async function expensesList(f: ExpenseFilter) {
  const w: string[] = []; const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace("?", `$${p.length}`)); };
  if (f.month) add(`e."billMonth" = ?`, f.month);
  if (f.from) add(`e.date >= ?`, f.from);
  if (f.to) add(`e.date <= ?`, f.to);
  if (f.categoryId) add(`e."categoryId" = ?`, f.categoryId);
  return q(
    `SELECT e.id, e.amount, e.date, e."billMonth", e.vendor, e."billNo", e."paymentMethod", e.note, e."attachmentUrl",
            e."categoryId", k.name AS category, e."roomId", r.number AS "roomNumber"
       FROM expenses e JOIN expense_categories k ON k.id = e."categoryId" LEFT JOIN rooms r ON r.id = e."roomId"
      ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY e.date DESC, e.id DESC`, p);
}

export const listCategories = () => q(`SELECT id, name FROM expense_categories ORDER BY name`);

// ---- tenants --------------------------------------------------------------------

export async function tenantsList(search?: string) {
  const p: unknown[] = []; let w = "";
  if (search) { p.push(`%${search}%`); w = `WHERE te.name ILIKE $1 OR te.phone ILIKE $1 OR r.number ILIKE $1`; }
  return q(
    `SELECT te.id, te.name, te.phone, r.number AS "roomNumber", y.id AS "tenancyId", y."startDate",
            COALESCE((SELECT SUM(c."amountDue") FROM rent_charges c JOIN tenancies y2 ON y2.id = c."tenancyId" WHERE y2."tenantId" = te.id),0)::int
          - COALESCE((SELECT SUM(p.amount) FROM payments p JOIN tenancies y2 ON y2.id = p."tenancyId" WHERE y2."tenantId" = te.id),0)::int AS balance
       FROM tenants te
       LEFT JOIN tenancies y ON y."tenantId" = te.id AND y.status = 'ACTIVE'
       LEFT JOIN rooms r ON r.id = y."roomId"
      ${w} ORDER BY (y.id IS NULL), r.number, te.name`, p);
}

export async function tenantDetail(id: number) {
  const [tenant] = await q(`SELECT * FROM tenants WHERE id = $1`, [id]);
  if (!tenant) return null;
  const tenancies = await q(
    `SELECT y.*, r.number AS "roomNumber" FROM tenancies y JOIN rooms r ON r.id = y."roomId" WHERE y."tenantId" = $1 ORDER BY y."startDate" DESC`, [id]);
  const charges = await q(
    `SELECT c.id, c.month, c."amountDue", c."dueDate", c.status, ${PAID} AS paid, r.number AS "roomNumber"
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId" JOIN rooms r ON r.id = y."roomId"
      WHERE y."tenantId" = $1 ORDER BY c.month DESC`, [id]);
  const payments = await paymentsLedger({ tenantId: id });
  const charged = charges.reduce((s, c) => s + c.amountDue, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return { tenant, tenancies, charges, payments, charged, paid, balance: charged - paid };
}

// ---- reports -----------------------------------------------------------------------

export async function pnlByMonth(year: number) {
  const rows = await q(
    `WITH m AS (SELECT to_char(d,'YYYY-MM') AS month FROM generate_series($1::date, $2::date, interval '1 month') d)
     SELECT m.month,
       COALESCE((SELECT SUM(p.amount) FROM payments p WHERE to_char(p."paidOn",'YYYY-MM') = m.month),0)::int AS income,
       COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e."billMonth" = m.month),0)::int AS expenses
     FROM m ORDER BY m.month`, [`${year}-01-01`, `${year}-12-01`]);
  return rows.map((r) => ({ ...r, net: r.income - r.expenses }));
}

export const expenseByCategoryYear = (year: number) =>
  q(`SELECT k.name, SUM(e.amount)::int AS total FROM expenses e JOIN expense_categories k ON k.id = e."categoryId"
      WHERE e."billMonth" LIKE $1 GROUP BY k.name ORDER BY total DESC`, [`${year}-%`]);

export const roomWise = (year: number) =>
  q(`SELECT r.number AS room,
            COALESCE(SUM(c."amountDue"),0)::int AS expected,
            COALESCE(SUM(${PAID}),0)::int AS collected,
            (COALESCE(SUM(c."amountDue"),0) - COALESCE(SUM(${PAID}),0))::int AS pending
       FROM rooms r
       LEFT JOIN tenancies y ON y."roomId" = r.id
       LEFT JOIN rent_charges c ON c."tenancyId" = y.id AND c.month LIKE $1
      GROUP BY r.id, r.number ORDER BY r.number`, [`${year}-%`]);

export const defaulters = overdue;

export async function tenantStatement(tenantId: number) {
  return tenantDetail(tenantId);
}

// ---- admin ----------------------------------------------------------------------

export const auditLog = (limit = 200) =>
  q(`SELECT id, "userName", action, entity, "entityId", before, after, "createdAt" FROM audit_logs ORDER BY id DESC LIMIT $1`, [limit]);

export const usersList = () => q(`SELECT id, name, email, role, active FROM users ORDER BY id`);

export const tenantOptions = () => q(`SELECT id, name FROM tenants ORDER BY name`);

export const tenantsWithoutRoom = () =>
  q(`SELECT te.id, te.name FROM tenants te WHERE NOT EXISTS (SELECT 1 FROM tenancies y WHERE y."tenantId" = te.id AND y.status = 'ACTIVE') ORDER BY te.name`);
