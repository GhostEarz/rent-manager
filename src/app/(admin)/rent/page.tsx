import Link from "next/link";
import { PaymentDialog } from "@/components/forms";
import { MonthPicker } from "@/components/MonthPicker";
import { Badge, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import { activeHouseId } from "@/lib/house";
import { requireUser } from "@/lib/session";
import { currentMonth } from "@/server/services/common";
import * as Q from "@/server/services/queries";

const FILTERS = ["", "UNPAID", "PARTIAL", "PAID"] as const;

export default async function RentPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string }> }) {
  const user = await requireUser();
  const houseId = await activeHouseId(user);
  const sp = await searchParams;
  const month = sp.month?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const status = FILTERS.includes(sp.status as never) ? sp.status || undefined : undefined;
  const [all, options] = await Promise.all([Q.rentTable(user, month, undefined, houseId), Q.activeTenancyOptions(user, houseId)]);
  const rows = status ? all.filter((r) => r.status === status) : all;
  const due = all.reduce((s, r) => s + r.amountDue, 0);
  const paid = all.reduce((s, r) => s + r.paid, 0);

  return (
    <>
      <PageHeader title="Rent collection" sub={fmtMonth(month)}>
        <MonthPicker value={month} />
        {user.role === "OWNER" && (
          <>
            <a className="btn" href={`/api/receipts/monthly?month=${month}`}>Download receipts</a>
            <a className="btn btn-sm" href={`/api/receipts/monthly?month=${month}&refresh=1`} title="Regenerate and save a fresh copy on Vercel Blob">
              Refresh archive
            </a>
          </>
        )}
        <PaymentDialog options={options as never} />
      </PageHeader>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Due" value={rupees(due)} />
        <Stat label="Paid" value={rupees(paid)} tone="good" />
        <Stat label="Balance" value={rupees(due - paid)} tone={due - paid > 0 ? "bad" : undefined} />
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link key={f} href={`/rent?month=${month}${f ? `&status=${f}` : ""}`} className={`btn btn-sm ${(status ?? "") === f ? "btn-primary" : ""}`}>{f ? f[0] + f.slice(1).toLowerCase() : "All"}</Link>
        ))}
      </div>
      <TableWrap>
        {rows.length === 0 ? <Empty>No rent charges for this selection.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Room</th><th>Tenant</th><th>Due date</th><th className="text-right">Due</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.chargeId}>
                  <td className="font-medium">{r.roomNumber}</td>
                  <td><Link className="hover:underline" href={`/tenants/${r.tenantId}`}>{r.tenantName}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(r.dueDate)}</td>
                  <td className="text-right">{rupees(r.amountDue)}</td>
                  <td className="text-right">{rupees(r.paid)}</td>
                  <td className="text-right font-medium">{rupees(r.balance)}</td>
                  <td><Badge v={r.status} /></td>
                  <td className="text-right">
                    {r.balance > 0 && (
                      <PaymentDialog options={options as never} tenancyId={r.tenancyId} charge={{ id: r.chargeId, month: r.month }} amount={r.balance} label="Record payment" small />
                    )}
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
