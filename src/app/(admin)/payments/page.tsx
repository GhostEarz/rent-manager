import Link from "next/link";
import { deletePaymentAction } from "@/actions/payments";
import { ConfirmAction } from "@/components/ActionForm";
import { Badge, Empty, Field, PageHeader, Stat, TableWrap } from "@/components/ui";
import { fmtDate, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import * as Q from "@/server/services/queries";

type SP = { from?: string; to?: string; method?: string; tenantId?: string; roomId?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = {
    from: sp.from || undefined, to: sp.to || undefined, method: sp.method || undefined,
    tenantId: sp.tenantId ? Number(sp.tenantId) : undefined, roomId: sp.roomId ? Number(sp.roomId) : undefined,
  };
  const [rows, tenants, rooms] = await Promise.all([Q.paymentsLedger(filter), Q.tenantOptions(), Q.listRooms()]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Payments" sub={`${rows.length} payments`}>
        <a className="btn" href={`/api/export/payments?${qs}`}>Export CSV</a>
      </PageHeader>
      <form className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Field label="From"><input type="date" name="from" defaultValue={sp.from} className="input" /></Field>
        <Field label="To"><input type="date" name="to" defaultValue={sp.to} className="input" /></Field>
        <Field label="Method">
          <select name="method" defaultValue={sp.method ?? ""} className="input"><option value="">All</option>{["UPI", "CASH", "BANK", "CHEQUE"].map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
        <Field label="Tenant">
          <select name="tenantId" defaultValue={sp.tenantId ?? ""} className="input"><option value="">All</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </Field>
        <Field label="Room">
          <select name="roomId" defaultValue={sp.roomId ?? ""} className="input"><option value="">All</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}</select>
        </Field>
        <div className="flex items-end gap-1"><button className="btn btn-primary">Filter</button><Link href="/payments" className="btn">Reset</Link></div>
      </form>
      <div className="mb-4 max-w-xs"><Stat label="Total in view" value={rupees(rows.reduce((s, r) => s + r.amount, 0))} tone="good" /></div>
      <TableWrap>
        {rows.length === 0 ? <Empty>No payments match.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Room</th><th>Tenant</th><th>Method</th><th>For</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{fmtDate(p.paidOn)}</td>
                  <td>{p.roomNumber}</td>
                  <td><Link className="hover:underline" href={`/tenants/${p.tenantId}`}>{p.tenantName}</Link></td>
                  <td><Badge v="OCCUPIED">{p.method}</Badge></td>
                  <td className="text-xs text-muted">{p.months || "—"}{p.credit > 0 && ` (+${rupees(p.credit)} advance)`}</td>
                  <td className="text-right font-medium">{rupees(p.amount)}</td>
                  <td className="space-x-1 whitespace-nowrap text-right">
                    <Link className="btn btn-sm" href={`/payments/${p.id}/receipt`}>Receipt</Link>
                    {user.role === "ADMIN" && <ConfirmAction action={deletePaymentAction} fields={{ id: p.id }} label="Delete" confirm="Delete this payment?" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>
    </>
  );
}
