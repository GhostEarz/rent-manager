import { notFound } from "next/navigation";
import { PrintButton } from "@/components/MonthPicker";
import { fmtDate, rupees } from "@/lib/format";
import { getSettings } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [p, s] = await Promise.all([Q.receipt(id), getSettings()]);
  if (!p) notFound();
  const rows: [string, string][] = [
    ["Received from", p.tenantName], ["Room", p.roomNumber], ["Date", fmtDate(p.paidOn)], ["Method", p.method],
    ["Reference", p.referenceNo ?? "—"], ["Applied to", p.applied || "Advance credit"], ["Received by", p.recordedBy ?? "—"],
  ];
  return (
    <div className="card mx-auto max-w-md space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">{s.propertyName}</h1>
        {s.propertyAddress && <p className="text-xs text-muted">{s.propertyAddress}</p>}
        <p className="mt-2 text-sm font-medium uppercase tracking-wide">Rent receipt #{String(p.id).padStart(5, "0")}</p>
      </div>
      <dl className="space-y-1 text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}
      </dl>
      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">Amount received</span>
        <span className="text-2xl font-semibold">{rupees(p.amount)}</span>
      </div>
      {p.note && <p className="text-xs text-muted">Note: {p.note}</p>}
      <div className="text-center"><PrintButton /></div>
    </div>
  );
}
