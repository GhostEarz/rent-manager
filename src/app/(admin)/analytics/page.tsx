import Link from "next/link";
import { AnalyticsFilters } from "@/components/AnalyticsFilters";
import { ExpenseDonut, HouseRevenueChart, PnlTrendChart, RevenueStackedChart } from "@/components/Charts";
import { PrintButton } from "@/components/MonthPicker";
import { Badge, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { currentMonth } from "@/server/services/common";
import * as A from "@/server/services/analytics";
import * as Q from "@/server/services/queries";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; locationId?: string; houseId?: string; rentalType?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = sp.month?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const locationId = sp.locationId ? Number(sp.locationId) : undefined;
  const houseId = sp.houseId ? Number(sp.houseId) : undefined;
  const rentalType = sp.rentalType === "MONTHLY" || sp.rentalType === "DAILY" ? sp.rentalType : undefined;
  const filter = A.monthFilter(month, { locationId, houseId, rentalType });

  const [summary, trend12, byHouse, occupancy, roomPerf, unpaid, defaulters, expCats, locations, houses] = await Promise.all([
    A.analyticsSummary(user, filter),
    trendRange(user, filter, 12),
    A.revenueByHouse(user, filter),
    A.occupancyStats(user, filter),
    A.roomPerformance(user, filter),
    A.unpaidStays(user, filter),
    A.defaultersScoped(user, filter),
    A.expensesByCategoryScoped(user, filter),
    Q.listLocations(user),
    Q.houseOptions(user),
  ]);

  return (
    <>
      <PageHeader title="Analytics" sub={fmtMonth(month)}>
        <AnalyticsFilters month={month} locations={locations as never} houses={houses as never} />
        <PrintButton />
        <a className="btn btn-sm no-print" href={`/api/export/analytics-summary?${toQuery(sp)}`}>CSV</a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total revenue" value={rupees(summary.revenue)} tone="good" sub={`Monthly ${rupees(summary.monthlyCollected)} · Daily ${rupees(summary.dailyCollected)}`} />
        <Stat label="Expenses" value={rupees(summary.expenses)} />
        <Stat label="Net" value={rupees(summary.net)} tone={summary.net >= 0 ? "good" : "bad"} />
        <Stat label="Occupancy (monthly)" value={`${occupancy.monthlyOccupied}/${occupancy.monthlyTotal}`} />
        <Stat
          label="Outstanding"
          value={rupees(summary.pending)}
          tone={summary.pending > 0 ? "bad" : undefined}
          sub={`Rent ${rupees(summary.pendingMonthly)} · Stays ${rupees(summary.pendingStays)}`}
        />
      </div>

      {occupancy.dailyRoomNightsAvailable > 0 && (
        <p className="mt-2 text-xs text-muted">
          Daily rooms: {occupancy.dailyRoomNightsSold} / {occupancy.dailyRoomNightsAvailable} room-nights sold this period
          ({Math.round((occupancy.dailyRoomNightsSold / occupancy.dailyRoomNightsAvailable) * 100)}%).
        </p>
      )}

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Revenue trend — monthly vs daily (12 periods)</h2>
          <RevenueStackedChart data={trend12} />
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Income vs expense vs net</h2>
          <PnlTrendChart data={trend12} />
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Expenses by category — {fmtMonth(month)}</h2>
          <ExpenseDonut data={expCats as never} />
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Revenue by building</h2>
          <HouseRevenueChart data={byHouse as never} />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Building summary</h2>
        <a className="btn btn-sm no-print" href={`/api/export/revenue-by-house?${toQuery(sp)}`}>CSV</a>
      </div>
      <TableWrap>
        {byHouse.length === 0 ? <Empty>No buildings yet</Empty> : (
          <table className="tbl">
            <thead><tr><th>Building</th><th className="text-right">Monthly</th><th className="text-right">Daily</th><th className="text-right">Revenue</th><th className="text-right">Expenses</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {byHouse.map((h: any) => (
                <tr key={h.houseId}>
                  <td>{h.houseName}</td>
                  <td className="text-right">{rupees(h.monthlyCollected)}</td>
                  <td className="text-right">{rupees(h.dailyCollected)}</td>
                  <td className="text-right font-medium">{rupees(h.revenue)}</td>
                  <td className="text-right">{rupees(h.expenses)}</td>
                  <td className={`text-right font-medium ${h.net < 0 ? "text-red-600" : ""}`}>{rupees(h.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Room performance</h2>
        <a className="btn btn-sm no-print" href={`/api/export/room-performance?${toQuery(sp)}`}>CSV</a>
      </div>
      <TableWrap>
        {roomPerf.length === 0 ? <Empty>No rooms yet</Empty> : (
          <table className="tbl">
            <thead><tr><th>Room</th><th>Building</th><th>Type</th><th className="text-right">Expected</th><th className="text-right">Collected</th><th className="text-right">Pending</th><th className="text-right">Stays</th></tr></thead>
            <tbody>
              {roomPerf.map((r) => (
                <tr key={r.roomId}>
                  <td>{r.roomNumber}</td>
                  <td>{r.houseName}</td>
                  <td><Badge v={r.rentalType === "DAILY" ? "OCCUPIED" : "ACTIVE"}>{r.rentalType}</Badge></td>
                  <td className="text-right">{rupees(r.expected)}</td>
                  <td className="text-right">{rupees(r.collected)}</td>
                  <td className={`text-right ${r.pending > 0 ? "font-medium text-red-600" : ""}`}>{rupees(r.pending)}</td>
                  <td className="text-right">{r.stays || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Monthly defaulters</h2>
          <TableWrap>
            {defaulters.length === 0 ? <Empty>No overdue rent.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Room</th><th>Tenant</th><th>Building</th><th className="text-right">Owes</th></tr></thead>
                <tbody>
                  {defaulters.map((d: any) => (
                    <tr key={d.tenancyId}>
                      <td>{d.roomNumber}</td>
                      <td><Link className="hover:underline" href={`/tenants/${d.tenantId}`}>{d.name}</Link></td>
                      <td>{d.houseName}</td>
                      <td className="text-right font-medium">{rupees(d.owed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableWrap>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Unpaid completed stays</h2>
          <TableWrap>
            {unpaid.length === 0 ? <Empty>No unpaid stays.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Room</th><th>Guest</th><th>Checked out</th><th className="text-right">Balance</th></tr></thead>
                <tbody>
                  {unpaid.map((s: any) => (
                    <tr key={s.id}>
                      <td>{s.roomNumber}</td>
                      <td>{s.guestName}</td>
                      <td>{fmtDate(s.checkOut)}</td>
                      <td className="text-right font-medium text-red-600">{rupees(s.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableWrap>
        </section>
      </div>
    </>
  );
}

async function trendRange(user: import("@/server/services/common").Actor, filter: A.AnalyticsFilter, periods: number) {
  const { addMonths } = await import("@/server/services/billing-core");
  const month = filter.from.slice(0, 7);
  const from = addMonths(month, -(periods - 1));
  const wide = { ...filter, from: `${from}-01`, to: filter.to };
  return A.revenueTrend(user, wide);
}

function toQuery(sp: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
  return p.toString();
}
