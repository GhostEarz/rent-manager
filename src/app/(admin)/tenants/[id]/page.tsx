import Link from "next/link";
import { notFound } from "next/navigation";
import { checkInAction, deleteTenantAction, moveOutAction, transferAction, updateTenancyAction } from "@/actions/tenants";
import { deletePaymentAction } from "@/actions/payments";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { PaymentDialog, TenantDialog } from "@/components/forms";
import { Modal } from "@/components/Modal";
import { Badge, Empty, Field, PageHeader, Row, Stat, TableWrap, todayStr } from "@/components/ui";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import * as Q from "@/server/services/queries";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const admin = user.role === "OWNER";
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const d = await Q.tenantDetail(user, id);
  if (!d) notFound();
  const { tenant: t, tenancies, charges, payments } = d;
  const [vacant, options] = await Promise.all([Q.vacantRooms(user), Q.activeTenancyOptions(user)]);
  const active = tenancies.find((y: any) => y.status === "ACTIVE");

  return (
    <>
      <PageHeader title={t.name} sub={[t.phone, t.email].filter(Boolean).join(" · ") || undefined}>
        <Link href={`/tenants/${id}/statement`} className="btn">Statement</Link>
        <TenantDialog tenant={t} label="Edit" />
        {admin && !tenancies.length && <ConfirmAction action={deleteTenantAction} fields={{ id }} label="Delete" confirm="Delete this tenant?" />}
      </PageHeader>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total charged" value={rupees(d.charged)} />
        <Stat label="Total paid" value={rupees(d.paid)} tone="good" />
        <Stat label={d.balance < 0 ? "Advance credit" : "Balance due"} value={rupees(Math.abs(d.balance))} tone={d.balance > 0 ? "bad" : d.balance < 0 ? "good" : undefined} />
      </div>

      <div className="card mb-4">
        {active ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Current room</p>
              <p className="text-lg font-semibold">Room {active.roomNumber} · {rupees(active.monthlyRent)}/mo</p>
              <p className="text-xs text-muted">
                Since {fmtDate(active.startDate)} · Deposit {rupees(active.securityDeposit)} ·{" "}
                {active.rentOverride ? "custom rent" : "follows room rent"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PaymentDialog options={options as never} tenancyId={active.id} />
              <Modal trigger="Transfer room" title="Transfer to another room">
                <ActionForm action={transferAction} submit="Transfer">
                  <input type="hidden" name="tenancyId" value={active.id} />
                  <Field label="New room">
                    <select name="roomId" required className="input" defaultValue="">
                      <option value="" disabled>Select vacant room…</option>
                      {vacant.map((r: any) => <option key={r.id} value={r.id}>Room {r.number} ({rupees(r.currentRent)})</option>)}
                    </select>
                  </Field>
                  <Row>
                    <Field label="Transfer date"><input name="date" type="date" required defaultValue={todayStr()} className="input" /></Field>
                    <Field label="Custom rent (optional)"><input name="rent" type="number" min={0} className="input" placeholder="room rent" /></Field>
                  </Row>
                </ActionForm>
              </Modal>
              <Modal trigger="Move out" title="Move out tenant" variant="danger">
                <ActionForm action={moveOutAction} submit="Confirm move-out" danger>
                  <input type="hidden" name="tenancyId" value={active.id} />
                  <p className="text-sm text-muted">
                    Current balance: <b>{d.balance > 0 ? `${rupees(d.balance)} due` : d.balance < 0 ? `${rupees(-d.balance)} credit` : "settled"}</b>.
                    Deposit held: <b>{rupees(active.securityDeposit)}</b>. The final month is pro-rated if enabled in Settings.
                  </p>
                  <Row>
                    <Field label="Move-out date"><input name="endDate" type="date" required defaultValue={todayStr()} className="input" /></Field>
                    <Field label="Deposit returned (₹)"><input name="depositReturned" type="number" min={0} max={active.securityDeposit} required defaultValue={active.securityDeposit} className="input" /></Field>
                  </Row>
                </ActionForm>
              </Modal>
              {admin && (
                <Modal trigger="Edit tenancy" title="Edit tenancy">
                  <ActionForm action={updateTenancyAction}>
                    <input type="hidden" name="id" value={active.id} />
                    <Row>
                      <Field label="Monthly rent (₹)"><input name="monthlyRent" type="number" min={0} required defaultValue={active.monthlyRent} className="input" /></Field>
                      <Field label="Security deposit (₹)"><input name="securityDeposit" type="number" min={0} required defaultValue={active.securityDeposit} className="input" /></Field>
                    </Row>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="rentOverride" defaultChecked={active.rentOverride} /> Use this rent instead of following the room&apos;s rent
                    </label>
                    <p className="text-xs text-muted">Only affects months not yet charged.</p>
                  </ActionForm>
                </Modal>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Not currently living in any room.</p>
            <Modal trigger="Check in" title={`Check in ${t.name}`} variant="primary">
              <ActionForm action={checkInAction} submit="Check in">
                <input type="hidden" name="tenantId" value={id} />
                <Field label="Room">
                  <select name="roomId" required className="input" defaultValue="">
                    <option value="" disabled>Select vacant room…</option>
                    {vacant.map((r: any) => <option key={r.id} value={r.id}>Room {r.number} ({rupees(r.currentRent)})</option>)}
                  </select>
                </Field>
                <Row>
                  <Field label="Check-in date"><input name="startDate" type="date" required defaultValue={todayStr()} className="input" /></Field>
                  <Field label="Security deposit (₹)"><input name="securityDeposit" type="number" min={0} required defaultValue={0} className="input" /></Field>
                </Row>
                <Field label="Custom rent (optional)"><input name="rent" type="number" min={0} className="input" placeholder="leave empty to use room rent" /></Field>
              </ActionForm>
            </Modal>
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold">Rent charges</h2>
      <TableWrap>
        {charges.length === 0 ? <Empty>No charges yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Month</th><th>Room</th><th className="text-right">Due</th><th className="text-right">Paid</th><th>Status</th></tr></thead>
            <tbody>
              {charges.map((c: any) => (
                <tr key={c.id}><td>{fmtMonth(c.month)}</td><td>{c.roomNumber}</td><td className="text-right">{rupees(c.amountDue)}</td><td className="text-right">{rupees(c.paid)}</td><td><Badge v={c.status} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Payments</h2>
      <TableWrap>
        {payments.length === 0 ? <Empty>No payments yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Method</th><th>Applied to</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paidOn)}</td><td>{p.method}</td>
                  <td>{p.months || "—"}{p.credit > 0 && <span className="text-xs text-muted"> (+{rupees(p.credit)} advance)</span>}</td>
                  <td className="text-right font-medium">{rupees(p.amount)}</td>
                  <td className="space-x-1 whitespace-nowrap text-right">
                    <Link className="btn btn-sm" href={`/payments/${p.id}/receipt`}>Receipt</Link>
                    {admin && <ConfirmAction action={deletePaymentAction} fields={{ id: p.id }} label="Delete" confirm="Delete this payment?" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Tenancy history</h2>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>Room</th><th>From</th><th>To</th><th className="text-right">Rent</th><th className="text-right">Deposit</th><th>Status</th></tr></thead>
          <tbody>
            {tenancies.map((y: any) => (
              <tr key={y.id}><td>{y.roomNumber}</td><td>{fmtDate(y.startDate)}</td><td>{fmtDate(y.endDate)}</td><td className="text-right">{rupees(y.monthlyRent)}</td>
                <td className="text-right">{rupees(y.securityDeposit)}{y.status === "ENDED" && ` (returned ${rupees(y.depositReturned)})`}</td><td><Badge v={y.status} /></td></tr>
            ))}
            {tenancies.length === 0 && <tr><td colSpan={6}><Empty>No tenancies yet.</Empty></td></tr>}
          </tbody>
        </table>
      </TableWrap>

      {(t.idProofType || t.address || t.emergencyContact || t.notes) && (
        <div className="card mt-6 space-y-1 text-sm">
          {t.idProofType && <p><span className="text-muted">ID:</span> {t.idProofType} {t.idProofNumber}</p>}
          {t.address && <p><span className="text-muted">Address:</span> {t.address}</p>}
          {t.emergencyContact && <p><span className="text-muted">Emergency:</span> {t.emergencyContact}</p>}
          {t.notes && <p><span className="text-muted">Notes:</span> {t.notes}</p>}
        </div>
      )}
    </>
  );
}
