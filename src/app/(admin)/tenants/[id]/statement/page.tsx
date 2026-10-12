import { notFound } from "next/navigation";
import { PrintButton } from "@/components/MonthPicker";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import { getSettings } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [d, s] = await Promise.all([Q.tenantStatement(id), getSettings()]);
  if (!d) notFound();
  return (
    <div className="card mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tenant statement</h1>
          <p className="text-sm text-muted">{s.propertyName}{s.propertyAddress && ` · ${s.propertyAddress}`}</p>
        </div>
        <PrintButton />
      </div>
      <div className="text-sm">
        <p className="font-medium">{d.tenant.name}</p>
        <p className="text-muted">{d.tenant.phone}</p>
        <p className="text-muted">Generated {fmtDate(new Date().toISOString().slice(0, 10))}</p>
      </div>
      <table className="tbl">
        <thead><tr><th>Month</th><th>Room</th><th className="text-right">Due</th><th className="text-right">Paid</th><th className="text-right">Balance</th></tr></thead>
        <tbody>
          {d.charges.map((c: any) => (
            <tr key={c.id}><td>{fmtMonth(c.month)}</td><td>{c.roomNumber}</td><td className="text-right">{rupees(c.amountDue)}</td><td className="text-right">{rupees(c.paid)}</td><td className="text-right">{rupees(c.amountDue - c.paid)}</td></tr>
          ))}
        </tbody>
      </table>
      <h2 className="text-sm font-semibold">Payments</h2>
      <table className="tbl">
        <thead><tr><th>Date</th><th>Method</th><th>Ref</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {d.payments.map((p: any) => (
            <tr key={p.id}><td>{fmtDate(p.paidOn)}</td><td>{p.method}</td><td>{p.referenceNo ?? ""}</td><td className="text-right">{rupees(p.amount)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line pt-3 text-right text-sm">
        <p>Total charged: <b>{rupees(d.charged)}</b></p>
        <p>Total paid: <b>{rupees(d.paid)}</b></p>
        <p className="text-base">{d.balance >= 0 ? "Balance due" : "Advance credit"}: <b>{rupees(Math.abs(d.balance))}</b></p>
      </div>
    </div>
  );
}
