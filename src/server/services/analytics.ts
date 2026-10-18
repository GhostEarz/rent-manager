// Portfolio-wide analytics: unifies the monthly ledger (payment_allocations / rent_charges)
// and the daily ledger (stay_payments / stays) without double-counting either one.
import { getDb } from "../db/data-source";
import { addMonths } from "./billing-core";
import { today } from "./common";

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.query(sql, params);
}

export interface AnalyticsFilter {
  from: string; // inclusive, YYYY-MM-DD
  to: string; // inclusive, YYYY-MM-DD
  locationId?: number;
  houseId?: number; // overrides locationId when set
  rentalType?: "MONTHLY" | "DAILY";
}

/** Default filter: the given calendar month, all houses. */
export function monthFilter(month: string, extra: Omit<AnalyticsFilter, "from" | "to"> = {}): AnalyticsFilter {
  return { from: `${month}-01`, to: addMonths(month, 1) + "-01", ...extra };
}

/** Room-scope WHERE fragment + params shared by every query below (alias "r" = rooms). */
function roomScope(f: AnalyticsFilter, startParamIndex: number) {
  const w: string[] = [];
  const p: unknown[] = [];
  let i = startParamIndex;
  if (f.houseId) { w.push(`r."houseId" = $${i++}`); p.push(f.houseId); }
  else if (f.locationId) { w.push(`h."locationId" = $${i++}`); p.push(f.locationId); }
  if (f.rentalType) { w.push(`r."rentalType" = $${i++}`); p.push(f.rentalType); }
  return { sql: w.length ? "AND " + w.join(" AND ") : "", params: p, next: i };
}

export async function analyticsSummary(f: AnalyticsFilter) {
  const scope = roomScope(f, 3);
  const [monthly] = await q(
    `SELECT COALESCE(SUM(a.amount),0)::int AS collected
       FROM payment_allocations a
       JOIN payments p ON p.id = a."paymentId"
       JOIN tenancies y ON y.id = p."tenancyId"
       JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE p."paidOn" >= $1 AND p."paidOn" < $2 ${scope.sql}`,
    [f.from, f.to, ...scope.params],
  );
  const [daily] = await q(
    `SELECT COALESCE(SUM(sp.amount),0)::int AS collected
       FROM stay_payments sp JOIN stays s ON s.id = sp."stayId"
       JOIN rooms r ON r.id = s."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE sp."paidOn" >= $1 AND sp."paidOn" < $2 ${scope.sql}`,
    [f.from, f.to, ...scope.params],
  );
  const [expected] = await q(
    `SELECT COALESCE(SUM(c."amountDue"),0)::int AS expected
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId"
       JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE c."dueDate" >= $1 AND c."dueDate" < $2 ${scope.sql}`,
    [f.from, f.to, ...scope.params],
  );
  const [expenses] = await q(
    `SELECT COALESCE(SUM(e.amount),0)::int AS expenses
       FROM expenses e LEFT JOIN rooms r ON r.id = e."roomId" LEFT JOIN houses h ON h.id = r."houseId"
      WHERE e.date >= $1 AND e.date < $2 ${f.houseId || f.locationId ? "AND r.id IS NOT NULL " + scope.sql : ""}`,
    [f.from, f.to, ...(f.houseId || f.locationId ? scope.params : [])],
  );
  const pendingScope = roomScope(f, 1);
  const [pendingMonthly] = await q(
    `SELECT COALESCE(SUM(c."amountDue" - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id),0)),0)::int AS pending
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId"
       JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE c."amountDue" > COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id),0) ${pendingScope.sql}`,
    pendingScope.params,
  );
  const [pendingStays] = await q(
    `SELECT COALESCE(SUM(s."dailyRate" * GREATEST(0, (COALESCE(s."checkOut", CURRENT_DATE) - s."checkIn")) -
             COALESCE((SELECT SUM(amount) FROM stay_payments WHERE "stayId" = s.id),0)),0)::int AS pending
       FROM stays s JOIN rooms r ON r.id = s."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE s.status != 'CANCELLED' ${pendingScope.sql}`,
    pendingScope.params,
  );
  const monthlyCollected = monthly.collected as number;
  const dailyCollected = daily.collected as number;
  const revenue = monthlyCollected + dailyCollected;
  const exp = expenses.expenses as number;
  return {
    revenue, monthlyCollected, dailyCollected,
    expected: expected.expected as number,
    expenses: exp,
    net: revenue - exp,
    pendingMonthly: pendingMonthly.pending as number,
    pendingStays: pendingStays.pending as number,
    pending: (pendingMonthly.pending as number) + (pendingStays.pending as number),
  };
}

export async function revenueTrend(f: AnalyticsFilter) {
  const scope = roomScope(f, 3);
  const rows = await q(
    `WITH m AS (SELECT to_char(d,'YYYY-MM') AS month FROM generate_series($1::date, ($2::date - interval '1 day'), interval '1 month') d)
     SELECT m.month,
       COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN payments p ON p.id = a."paymentId"
                 JOIN tenancies y ON y.id = p."tenancyId" JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
                 WHERE to_char(p."paidOn",'YYYY-MM') = m.month ${scope.sql}),0)::int AS "monthlyCollected",
       COALESCE((SELECT SUM(sp.amount) FROM stay_payments sp JOIN stays s ON s.id = sp."stayId"
                 JOIN rooms r ON r.id = s."roomId" JOIN houses h ON h.id = r."houseId"
                 WHERE to_char(sp."paidOn",'YYYY-MM') = m.month ${scope.sql}),0)::int AS "dailyCollected",
       COALESCE((SELECT SUM(c."amountDue") FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId"
                 JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
                 WHERE c.month = m.month ${scope.sql}),0)::int AS expected,
       COALESCE((SELECT SUM(e.amount) FROM expenses e LEFT JOIN rooms r ON r.id = e."roomId" LEFT JOIN houses h ON h.id = r."houseId"
                 WHERE e."billMonth" = m.month ${f.houseId || f.locationId ? "AND r.id IS NOT NULL " + scope.sql : ""}),0)::int AS expenses
     FROM m ORDER BY m.month`,
    [f.from, f.to, ...scope.params],
  );
  return rows.map((r: any) => ({
    ...r,
    collected: r.monthlyCollected + r.dailyCollected,
    net: r.monthlyCollected + r.dailyCollected - r.expenses,
  }));
}

export async function revenueByHouse(f: AnalyticsFilter) {
  const w: string[] = []; const p: unknown[] = [f.from, f.to];
  if (f.houseId) { w.push(`h.id = $${p.length + 1}`); p.push(f.houseId); }
  else if (f.locationId) { w.push(`h."locationId" = $${p.length + 1}`); p.push(f.locationId); }
  const rows = await q(
    `SELECT h.id AS "houseId", h.name AS "houseName",
       COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN payments p ON p.id = a."paymentId"
                 JOIN tenancies y ON y.id = p."tenancyId" JOIN rooms r ON r.id = y."roomId"
                 WHERE r."houseId" = h.id AND p."paidOn" >= $1 AND p."paidOn" < $2),0)::int AS "monthlyCollected",
       COALESCE((SELECT SUM(sp.amount) FROM stay_payments sp JOIN stays s ON s.id = sp."stayId" JOIN rooms r ON r.id = s."roomId"
                 WHERE r."houseId" = h.id AND sp."paidOn" >= $1 AND sp."paidOn" < $2),0)::int AS "dailyCollected",
       COALESCE((SELECT SUM(e.amount) FROM expenses e JOIN rooms r ON r.id = e."roomId"
                 WHERE r."houseId" = h.id AND e.date >= $1 AND e.date < $2),0)::int AS expenses
     FROM houses h
     ${w.length ? "WHERE " + w.join(" AND ") : ""}
     ORDER BY h.name`,
    p,
  );
  return rows.map((r: any) => ({
    ...r,
    revenue: r.monthlyCollected + r.dailyCollected,
    net: r.monthlyCollected + r.dailyCollected - r.expenses,
  }));
}

export async function occupancyStats(f: AnalyticsFilter) {
  const scope = roomScope(f, 3);
  const [monthly] = await q(
    `SELECT COUNT(*) FILTER (WHERE r.status = 'OCCUPIED')::int AS occupied, COUNT(*)::int AS total
       FROM rooms r JOIN houses h ON h.id = r."houseId"
      WHERE r."rentalType" = 'MONTHLY' ${scope.sql}`,
    scope.params,
  );
  const [daily] = await q(
    `SELECT COUNT(DISTINCT r.id)::int AS total,
            COALESCE(SUM(GREATEST(0, LEAST(COALESCE(s."checkOut", $2::date), $2::date) - GREATEST(s."checkIn", $1::date))),0)::int AS "roomNightsSold"
       FROM rooms r JOIN houses h ON h.id = r."houseId"
       LEFT JOIN stays s ON s."roomId" = r.id AND s.status != 'CANCELLED' AND s."checkIn" < $2 AND (s."checkOut" IS NULL OR s."checkOut" > $1)
      WHERE r."rentalType" = 'DAILY' ${scope.sql}`,
    [f.from, f.to, ...scope.params],
  );
  const days = Math.max(1, Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86_400_000));
  const dailyRoomCount = await q(
    `SELECT COUNT(*)::int AS n FROM rooms r JOIN houses h ON h.id = r."houseId" WHERE r."rentalType" = 'DAILY' ${scope.sql}`,
    scope.params,
  ).then((rows) => rows[0].n as number);
  return {
    monthlyOccupied: monthly.occupied as number,
    monthlyTotal: monthly.total as number,
    dailyRoomNightsSold: daily.roomNightsSold as number,
    dailyRoomNightsAvailable: dailyRoomCount * days,
  };
}

export interface RoomPerformanceRow {
  roomId: number; roomNumber: string; houseName: string; rentalType: "MONTHLY" | "DAILY";
  expected: number; collected: number; pending: number; stays: number;
}

export async function roomPerformance(f: AnalyticsFilter): Promise<RoomPerformanceRow[]> {
  const scope = roomScope(f, 3);
  return q(
    `SELECT r.id AS "roomId", r.number AS "roomNumber", h.name AS "houseName", r."rentalType",
       COALESCE((SELECT SUM(c."amountDue") FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId"
                 WHERE y."roomId" = r.id AND c."dueDate" >= $1 AND c."dueDate" < $2),0)::int AS expected,
       (COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN payments p ON p.id = a."paymentId"
                 JOIN tenancies y ON y.id = p."tenancyId" WHERE y."roomId" = r.id AND p."paidOn" >= $1 AND p."paidOn" < $2),0)
        + COALESCE((SELECT SUM(sp.amount) FROM stay_payments sp JOIN stays s ON s.id = sp."stayId"
                 WHERE s."roomId" = r.id AND sp."paidOn" >= $1 AND sp."paidOn" < $2),0))::int AS collected,
       COALESCE((SELECT SUM(c."amountDue" - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id),0))
                 FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId" WHERE y."roomId" = r.id
                   AND c."amountDue" > COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id),0)),0)::int AS pending,
       COALESCE((SELECT COUNT(*) FROM stays s WHERE s."roomId" = r.id AND s.status != 'CANCELLED'
                 AND s."checkIn" >= $1 AND s."checkIn" < $2),0)::int AS stays
     FROM rooms r JOIN houses h ON h.id = r."houseId"
     WHERE 1=1 ${scope.sql}
     ORDER BY h.name, r.number`,
    [f.from, f.to, ...scope.params],
  );
}

/** Completed (checked-out) stays with an outstanding balance. */
export async function unpaidStays(f: AnalyticsFilter) {
  const scope = roomScope(f, 3);
  return q(
    `SELECT s.id, r.number AS "roomNumber", h.name AS "houseName", s."guestName", s.phone, s."checkIn", s."checkOut",
            (s."dailyRate" * (s."checkOut" - s."checkIn"))::int AS total,
            COALESCE((SELECT SUM(amount) FROM stay_payments WHERE "stayId" = s.id),0)::int AS paid,
            (s."dailyRate" * (s."checkOut" - s."checkIn") - COALESCE((SELECT SUM(amount) FROM stay_payments WHERE "stayId" = s.id),0))::int AS balance
       FROM stays s JOIN rooms r ON r.id = s."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE s.status = 'ENDED' AND s."checkOut" >= $1 AND s."checkOut" < $2 ${scope.sql}
        AND (s."dailyRate" * (s."checkOut" - s."checkIn") - COALESCE((SELECT SUM(amount) FROM stay_payments WHERE "stayId" = s.id),0)) > 0
      ORDER BY s."checkOut" DESC`,
    [f.from, f.to, ...scope.params],
  );
}

/** Overdue monthly rent, scoped to house/location (reuses the same shape as queries.overdue). */
export async function defaultersScoped(f: AnalyticsFilter) {
  const scope = roomScope(f, 2);
  const t = today();
  const rows = await q(
    `SELECT te.id AS "tenantId", te.name, te.phone, r.number AS "roomNumber", h.name AS "houseName", y.id AS "tenancyId",
            SUM(c."amountDue" - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id),0))::int AS owed,
            MIN(c."dueDate") AS "oldestDue"
       FROM rent_charges c JOIN tenancies y ON y.id = c."tenancyId"
       JOIN tenants te ON te.id = y."tenantId" JOIN rooms r ON r.id = y."roomId" JOIN houses h ON h.id = r."houseId"
      WHERE c."dueDate" < $1 AND c."amountDue" > COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a."chargeId" = c.id),0) ${scope.sql}
      GROUP BY te.id, te.name, te.phone, r.number, h.name, y.id ORDER BY MIN(c."dueDate")`,
    [t, ...scope.params],
  );
  return rows;
}

export const expensesByCategoryScoped = (f: AnalyticsFilter) => {
  const scope = roomScope(f, 3);
  return q(
    `SELECT k.name, SUM(e.amount)::int AS value
       FROM expenses e JOIN expense_categories k ON k.id = e."categoryId"
       LEFT JOIN rooms r ON r.id = e."roomId" LEFT JOIN houses h ON h.id = r."houseId"
      WHERE e.date >= $1 AND e.date < $2 ${f.houseId || f.locationId ? "AND r.id IS NOT NULL " + scope.sql : ""}
      GROUP BY k.name ORDER BY value DESC`,
    [f.from, f.to, ...(f.houseId || f.locationId ? scope.params : [])],
  );
};
