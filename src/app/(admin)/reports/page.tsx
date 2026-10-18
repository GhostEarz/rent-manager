import Link from "next/link";
import { PrintButton } from "@/components/MonthPicker";
import { Badge, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";
import { fmtMonth, rupees } from "@/lib/format";
import { today } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const thisYear = Number(today().slice(0, 4));
  const year = Number((await searchParams).year) || thisYear;
  const [pnl, cats, rooms, late, tenants] = await Promise.all([
    Q.pnlByMonth(year), Q.expenseByCategoryYear(year), Q.roomWise(year), Q.defaulters(), Q.tenantsList(),
  ]);
  const income = pnl.reduce((s, r) => s + r.income, 0);
  const expenses = pnl.reduce((s, r) => s + r.expenses, 0);

  return (
    <>
      <PageHeader title="Reports" sub={`Year ${year}`}>
        <Link className="btn btn-sm no-print" href="/analytics">Full analytics →</Link>
        <Link className="btn" href={`/reports?year=${year - 1}`}>← {year - 1}</Link>
        {year < thisYear && <Link className="btn" href={`/reports?year=${year + 1}`}>{year + 1} →</Link>}
        <PrintButton />
      </PageHeader>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Income received" value={rupees(income)} tone="good" />
        <Stat label="Expenses" value={rupees(expenses)} />
        <Stat label="Net profit" value={rupees(income - expenses)} tone={income - expenses >= 0 ? "good" : "bad"} />
      </div>

      <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Profit &amp; loss by month</h2><a className="btn btn-sm no-print" href={`/api/export/pnl?year=${year}`}>CSV</a></div>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>Month</th><th className="text-right">Income</th><th className="text-right">Expenses</th><th className="text-right">Net</th></tr></thead>
          <tbody>
            {pnl.map((r) => (
              <tr key={r.month}><td>{fmtMonth(r.month)}</td><td className="text-right">{rupees(r.income)}</td><td className="text-right">{rupees(r.expenses)}</td>
                <td className={`text-right font-medium ${r.net < 0 ? "text-red-600" : ""}`}>{rupees(r.net)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Expenses by category</h2>
          <TableWrap>
            {cats.length === 0 ? <Empty>No expenses.</Empty> : (
              <table className="tbl"><tbody>{cats.map((c) => <tr key={c.name}><td>{c.name}</td><td className="text-right font-medium">{rupees(c.total)}</td></tr>)}</tbody></table>
            )}
          </TableWrap>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Defaulters</h2><a className="btn btn-sm no-print" href="/api/export/defaulters">CSV</a></div>
          <TableWrap>
            {late.length === 0 ? <Empty>No overdue rent.</Empty> : (
              <table className="tbl">
                <thead><tr><th>Room</th><th>Tenant</th><th className="text-right">Owes</th><th>Overdue</th></tr></thead>
                <tbody>{late.map((r) => <tr key={r.tenancyId}><td>{r.roomNumber}</td><td>{r.name}</td><td className="text-right font-medium">{rupees(r.owed)}</td><td><Badge v="UNPAID">{r.daysOverdue}d</Badge></td></tr>)}</tbody>
              </table>
            )}
          </TableWrap>
        </section>
      </div>

      <div className="mb-2 mt-6 flex items-center justify-between"><h2 className="text-sm font-semibold">Room-wise collection</h2><a className="btn btn-sm no-print" href={`/api/export/roomwise?year=${year}`}>CSV</a></div>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>Room</th><th className="text-right">Expected</th><th className="text-right">Collected</th><th className="text-right">Pending</th></tr></thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.room}><td>{r.room}</td><td className="text-right">{rupees(r.expected)}</td><td className="text-right">{rupees(r.collected)}</td>
                <td className={`text-right font-medium ${r.pending > 0 ? "text-red-600" : ""}`}>{rupees(r.pending)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <section className="no-print mt-6">
        <h2 className="mb-2 text-sm font-semibold">Tenant statements</h2>
        <div className="flex flex-wrap gap-1">
          {tenants.map((t) => <Link key={t.id} className="btn btn-sm" href={`/tenants/${t.id}/statement`}>{t.name}{t.roomNumber && ` (${t.roomNumber})`}</Link>)}
        </div>
      </section>
    </>
  );
}
