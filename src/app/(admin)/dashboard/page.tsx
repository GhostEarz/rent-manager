import Link from "next/link";
import { CollectionChart, ExpenseDonut, TrendChart } from "@/components/Charts";
import { PaymentDialog } from "@/components/forms";
import { MonthPicker } from "@/components/MonthPicker";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { activeHouseId } from "@/lib/house";
import { fmtDate, fmtMonth, rupees, waLink } from "@/lib/format";
import { currentMonth } from "@/server/services/common";
import * as Q from "@/server/services/queries";

const tileTone: Record<string, string> = {
  PAID: "border-emerald-500/50 bg-emerald-500/10",
  PARTIAL: "border-amber-500/60 bg-amber-500/10",
  UNPAID: "border-red-500/50 bg-red-500/10",
  VACANT: "border-line bg-card",
  MAINTENANCE: "border-orange-500/50 bg-orange-500/10",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = (await searchParams).month?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const houseId = (await activeHouseId()) ?? undefined;
  const [k, tiles, trend, cats, late, pays, exps, options] = await Promise.all([
    Q.kpis(month, houseId), Q.roomTiles(month, houseId), Q.trend(month), Q.expensesByCategory(month), Q.overdue(),
    Q.recentPayments(), Q.recentExpenses(), Q.activeTenancyOptions(),
  ]);
  const floors = [...new Set(tiles.map((t) => t.floorNumber))];
  return (
    <>
      <PageHeader title="Dashboard" sub={fmtMonth(month)}>
        <Link className="btn btn-sm no-print" href={`/analytics?month=${month}`}>Full analytics →</Link>
        <MonthPicker value={month} />
        <PaymentDialog options={options as never} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Expected rent" value={rupees(k.expected)} />
        <Stat label="Collected" value={rupees(k.collected)} tone="good" />
        <Stat label="Pending" value={rupees(k.pending)} tone={k.pending > 0 ? "bad" : undefined} />
        <Stat label="Occupancy (monthly)" value={`${k.occupied}/${k.totalRooms}`} />
        <Stat label="Expenses" value={rupees(k.expenses)} />
        <Stat label="Net income" value={rupees(k.net)} tone={k.net >= 0 ? "good" : "bad"} sub={`Received ${rupees(k.received)}`} />
        {k.dailyReceived > 0 && <Stat label="Daily stay revenue" value={rupees(k.dailyReceived)} tone="good" sub="This month" />}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Rooms</h2>
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
          {["PAID", "PARTIAL", "UNPAID", "VACANT"].map((s) => (
            <span key={s} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded border ${tileTone[s]}`} />{s.toLowerCase()}</span>
          ))}
        </div>
        {floors.map((f) => (
          <div key={f} className="mb-3">
            <p className="mb-1 text-xs font-medium text-muted">{tiles.find((t) => t.floorNumber === f)?.floorName}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
              {tiles.filter((t) => t.floorNumber === f).map((t) => {
                const st = t.chargeStatus ?? (t.roomStatus === "MAINTENANCE" ? "MAINTENANCE" : "VACANT");
                return (
                  <Link key={`${t.id}-${t.tenantId}`} href={t.tenantId ? `/tenants/${t.tenantId}` : "/rooms"} className={`rounded-xl border p-3 transition hover:shadow-md ${tileTone[st]}`}>
                    <span className="text-lg font-semibold">{t.number}</span>
                    <p className="truncate text-xs">{t.tenantName ?? (st === "MAINTENANCE" ? "Maintenance" : "Vacant")}</p>
                    {t.amountDue != null && <p className="mt-1 text-xs text-muted">{rupees(t.paid)} / {rupees(t.amountDue)}</p>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="card"><h2 className="mb-2 text-sm font-semibold">Collected vs expected (12 months)</h2><CollectionChart data={trend} /></div>
        <div className="card"><h2 className="mb-2 text-sm font-semibold">Expenses by category — {fmtMonth(month)}</h2><ExpenseDonut data={cats} /></div>
        <div className="card lg:col-span-2"><h2 className="mb-2 text-sm font-semibold">Income vs expense trend</h2><TrendChart data={trend} /></div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="card lg:col-span-3">
          <h2 className="mb-2 text-sm font-semibold">Overdue tenants</h2>
          {late.length === 0 ? <Empty>Nobody is overdue 🎉</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Room</th><th>Tenant</th><th>Owes</th><th>Overdue</th><th /></tr></thead>
                <tbody>
                  {late.map((r) => {
                    const wa = waLink(r.phone, `Hi ${r.name}, a gentle reminder: rent of ${rupees(r.owed)} for room ${r.roomNumber} is pending. Thank you.`);
                    return (
                      <tr key={r.tenancyId}>
                        <td>{r.roomNumber}</td>
                        <td><Link className="hover:underline" href={`/tenants/${r.tenantId}`}>{r.name}</Link></td>
                        <td className="font-medium">{rupees(r.owed)} <span className="text-xs text-muted">({r.months} mo)</span></td>
                        <td><Badge v="UNPAID">{r.daysOverdue} days</Badge></td>
                        <td className="space-x-1 whitespace-nowrap text-right">
                          {r.phone && <a className="btn btn-sm" href={`tel:${r.phone}`}>Call</a>}
                          {wa && <a className="btn btn-sm" target="_blank" rel="noreferrer" href={wa}>WhatsApp</a>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Recent payments</h2>
          {pays.length === 0 ? <Empty>No payments yet</Empty> : (
            <table className="tbl">
              <tbody>
                {pays.map((p) => (
                  <tr key={p.id}><td>{fmtDate(p.paidOn)}</td><td>Room {p.roomNumber} · {p.tenantName}</td><td><Badge v="OCCUPIED">{p.method}</Badge></td><td className="text-right font-medium">{rupees(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Recent expenses</h2>
          {exps.length === 0 ? <Empty>No expenses yet</Empty> : (
            <table className="tbl">
              <tbody>
                {exps.map((e) => (
                  <tr key={e.id}><td>{e.category}<div className="text-xs text-muted">{fmtDate(e.date)}</div></td><td className="text-right font-medium">{rupees(e.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
