import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseDonut, PnlTrendChart, RevenueStackedChart } from "@/components/Charts";
import { ExpenseDialog } from "@/components/forms";
import { MonthPicker } from "@/components/MonthPicker";
import { Badge, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import * as A from "@/server/services/analytics";
import { currentMonth } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function BuildingPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const houseId = Number((await params).id);
  if (!Number.isInteger(houseId) || !user.houseIds.includes(houseId)) notFound();
  const month = (await searchParams).month?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const filter = A.monthFilter(month, { houseId });

  const [houses, summary, trend, occ, cats, perf, rooms, expenses, categories, late, tiles] = await Promise.all([
    Q.listHouses(user), A.analyticsSummary(user, filter), A.revenueTrendMonths(user, filter, 12), A.occupancyStats(user, filter),
    A.expensesByCategoryScoped(user, filter), A.roomPerformance(user, filter), Q.listRooms(user, houseId),
    Q.expensesList(user, { month, houseId }), Q.listCategories(user), Q.overdue(user, houseId), Q.roomTiles(user, month, houseId),
  ]);
  const house: any = houses.find((h: any) => h.id === houseId);
  if (!house) notFound();
  const tileById = new Map(tiles.map((t: any) => [t.id as number, t]));
  const dailyPct = occ.dailyRoomNightsAvailable ? Math.round((occ.dailyRoomNightsSold / occ.dailyRoomNightsAvailable) * 100) : null;

  return (
    <>
      <PageHeader title={house.name} sub={`${house.locationName} · ${fmtMonth(month)}`}>
        <MonthPicker value={month} />
        <ExpenseDialog label="Add expense" categories={categories} houses={[house]} defaultHouseId={houseId} />
      </PageHeader>
      <p className="no-print -mt-3 mb-4 text-sm"><Link href="/buildings" className="text-indigo-600 hover:underline dark:text-indigo-400">← All buildings</Link></p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Revenue" value={rupees(summary.revenue)} tone="good" sub={`Monthly ${rupees(summary.monthlyCollected)} · Daily ${rupees(summary.dailyCollected)}`} />
        <Stat label="Expenses" value={rupees(summary.expenses)} />
        <Stat label="Net profit" value={rupees(summary.net)} tone={summary.net >= 0 ? "good" : "bad"} />
        <Stat label="Outstanding" value={rupees(summary.pending)} tone={summary.pending > 0 ? "bad" : undefined} sub={`Rent ${rupees(summary.pendingMonthly)} · Stays ${rupees(summary.pendingStays)}`} />
        <Stat label="Monthly rooms occupied" value={`${occ.monthlyOccupied}/${occ.monthlyTotal}`} />
        <Stat label="Daily room occupancy" value={dailyPct == null ? "—" : `${dailyPct}%`} sub={dailyPct == null ? "No daily rooms" : `${occ.dailyRoomNightsSold}/${occ.dailyRoomNightsAvailable} nights`} />
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Rooms</h2>
          <Link href="/rooms" className="btn btn-sm">Manage rooms</Link>
        </div>
        {rooms.length === 0 ? <Empty>No rooms yet. <Link className="text-indigo-600 underline" href="/rooms">Add rooms</Link></Empty> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {rooms.map((r) => {
              const t: any = tileById.get(r.id);
              const st = r.rentalType === "MONTHLY" ? (t?.chargeStatus ?? (r.status === "OCCUPIED" ? "UNPAID" : r.status)) : r.status;
              const tone = st === "PAID" ? "border-emerald-500/50 bg-emerald-500/10" : st === "PARTIAL" ? "border-amber-500/60 bg-amber-500/10" : st === "UNPAID" ? "border-red-500/50 bg-red-500/10" : st === "OCCUPIED" ? "border-indigo-500/50 bg-indigo-500/10" : st === "MAINTENANCE" ? "border-orange-500/50 bg-orange-500/10" : "border-line bg-card";
              return (
                <Link key={r.id} href={`/rooms/${r.id}`} className={`rounded-xl border p-3 transition hover:shadow-md ${tone}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">{r.number}</span>
                    <span className="text-[10px] font-medium uppercase text-muted">{r.rentalType === "DAILY" ? "Daily" : "Monthly"}</span>
                  </div>
                  <p className="truncate text-xs">{r.tenantName ?? (r.status === "OCCUPIED" ? "Guest in house" : r.status === "MAINTENANCE" ? "Maintenance" : "Vacant")}</p>
                  <p className="mt-1 text-xs text-muted">{rupees(r.currentRent)}/{r.rentalType === "DAILY" ? "night" : "mo"}</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="card"><h2 className="mb-2 text-sm font-semibold">Revenue — monthly vs daily (12 months)</h2><RevenueStackedChart data={trend} /></div>
        <div className="card"><h2 className="mb-2 text-sm font-semibold">Income vs expense</h2><PnlTrendChart data={trend} /></div>
        <div className="card"><h2 className="mb-2 text-sm font-semibold">Expenses by category — {fmtMonth(month)}</h2><ExpenseDonut data={cats as never} /></div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Overdue rent</h2>
          {late.length === 0 ? <Empty>Nobody is overdue 🎉</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {late.map((r: any) => (
                <li key={r.tenancyId} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">Room {r.roomNumber} · <Link className="hover:underline" href={`/tenants/${r.tenantId}`}>{r.name}</Link></span>
                  <span className="shrink-0 font-medium">{rupees(r.owed)} <Badge v="UNPAID">{r.daysOverdue}d</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Room performance — {fmtMonth(month)}</h2>
      <TableWrap>
        {perf.length === 0 ? <Empty>No rooms yet</Empty> : (
          <table className="tbl">
            <thead><tr><th>Room</th><th>Type</th><th className="text-right">Expected</th><th className="text-right">Collected</th><th className="text-right">Pending</th><th className="text-right">Stays</th></tr></thead>
            <tbody>
              {perf.map((r) => (
                <tr key={r.roomId}>
                  <td><Link className="font-medium hover:underline" href={`/rooms/${r.roomId}`}>{r.roomNumber}</Link></td>
                  <td><Badge v={r.rentalType === "DAILY" ? "OCCUPIED" : "ACTIVE"}>{r.rentalType === "DAILY" ? "Daily" : "Monthly"}</Badge></td>
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

      <h2 className="mb-2 mt-6 text-sm font-semibold">Expenses — {fmtMonth(month)}</h2>
      <TableWrap>
        {expenses.length === 0 ? <Empty>No expenses recorded this month.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Category</th><th>Vendor / note</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td>{e.category}</td>
                  <td>{e.vendor ?? ""}<div className="text-xs text-muted">{e.note}</div></td>
                  <td className="text-right font-medium">{rupees(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>
    </>
  );
}
