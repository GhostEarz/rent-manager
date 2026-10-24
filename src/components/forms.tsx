import { recordPaymentAction } from "@/actions/payments";
import { saveExpenseAction } from "@/actions/expenses";
import { createTenantAction, updateTenantAction } from "@/actions/tenants";
import { ActionForm } from "./ActionForm";
import { Modal } from "./Modal";
import { Field, Row, todayStr } from "./ui";
import { fmtMonth } from "@/lib/format";

export interface TenancyOption { id: number; tenantName: string; roomNumber: string; due: number; houseName?: string }
export interface HouseOption { id: number; name: string; locationName?: string }

export function PaymentDialog({
  options, tenancyId, charge, amount, label = "Record payment", small = false, variant = "primary",
}: {
  options: TenancyOption[]; tenancyId?: number; charge?: { id: number; month: string }; amount?: number;
  label?: string; small?: boolean; variant?: "primary" | "";
}) {
  const picked = options.find((o) => o.id === tenancyId);
  return (
    <Modal trigger={label} title={picked ? `Payment — Room ${picked.roomNumber}, ${picked.tenantName}` : "Record payment"} variant={variant} small={small}>
      <ActionForm action={recordPaymentAction} submit="Save payment">
        {picked ? (
          <input type="hidden" name="tenancyId" value={picked.id} />
        ) : (
          <Field label="Tenant / room">
            <select name="tenancyId" required className="input" defaultValue="">
              <option value="" disabled>{options.length ? "Select…" : "No active tenancies"}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.houseName ? `${o.houseName} · ` : ""}Room {o.roomNumber} — {o.tenantName}{o.due > 0 ? ` (owes ₹${o.due})` : ""}</option>)}
            </select>
          </Field>
        )}
        <Row>
          <Field label="Amount (₹)"><input name="amount" type="number" min={1} required defaultValue={amount || undefined} className="input" /></Field>
          <Field label="Paid on"><input name="paidOn" type="date" required defaultValue={todayStr()} className="input" /></Field>
        </Row>
        <Row>
          <Field label="Method">
            <select name="method" className="input" defaultValue="UPI">
              {["UPI", "CASH", "BANK", "CHEQUE"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Reference no."><input name="referenceNo" className="input" /></Field>
        </Row>
        <Field label="Apply to">
          <select name="chargeId" className="input" defaultValue={charge?.id ?? ""}>
            <option value="">Oldest unpaid month first</option>
            {charge && <option value={charge.id}>{fmtMonth(charge.month)} only (overflow goes to other months)</option>}
          </select>
        </Field>
        <Field label="Received into account"><input name="receivedIntoAccount" className="input" placeholder="e.g. SBI ••1234 / cash box" /></Field>
        <Field label="Note"><input name="note" className="input" /></Field>
      </ActionForm>
    </Modal>
  );
}

export function TenantDialog({
  tenant, label, small = false, houses = [], defaultHouseId,
}: {
  tenant?: Record<string, any>; label: string; small?: boolean; houses?: HouseOption[]; defaultHouseId?: number | null;
}) {
  const t = tenant ?? {};
  return (
    <Modal trigger={label} title={tenant ? "Edit tenant" : "Add tenant"} variant={tenant ? "" : "primary"} small={small}>
      <ActionForm action={tenant ? updateTenantAction : createTenantAction}>
        {tenant && <input type="hidden" name="id" value={t.id} />}
        {!tenant && (houses.length === 1 ? (
          <input type="hidden" name="houseId" value={houses[0].id} />
        ) : (
          <Field label="Building">
            <select name="houseId" required className="input" defaultValue={defaultHouseId ?? ""}>
              <option value="" disabled>Select…</option>
              {houses.map((h) => <option key={h.id} value={h.id}>{h.locationName ? `${h.locationName} — ` : ""}{h.name}</option>)}
            </select>
          </Field>
        ))}
        <Field label="Name"><input name="name" required defaultValue={t.name} className="input" /></Field>
        <Row>
          <Field label="Phone"><input name="phone" defaultValue={t.phone ?? ""} className="input" inputMode="tel" /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={t.email ?? ""} className="input" /></Field>
        </Row>
        <Row>
          <Field label="ID proof type"><input name="idProofType" defaultValue={t.idProofType ?? ""} className="input" placeholder="Aadhaar, PAN…" /></Field>
          <Field label="ID proof number"><input name="idProofNumber" defaultValue={t.idProofNumber ?? ""} className="input" /></Field>
        </Row>
        <Field label="Address"><textarea name="address" defaultValue={t.address ?? ""} rows={2} className="input" /></Field>
        <Field label="Emergency contact"><input name="emergencyContact" defaultValue={t.emergencyContact ?? ""} className="input" /></Field>
        <Field label="Photo / document link"><input name="docUrl" defaultValue={t.docUrl ?? ""} className="input" /></Field>
        <Field label="Notes"><textarea name="notes" defaultValue={t.notes ?? ""} rows={2} className="input" /></Field>
      </ActionForm>
    </Modal>
  );
}

export function ExpenseDialog({
  expense, categories, houses, defaultHouseId, label, small = false,
}: {
  expense?: Record<string, any>; categories: { id: number; name: string }[]; houses: HouseOption[];
  defaultHouseId?: number | null; label: string; small?: boolean;
}) {
  const e = expense ?? {};
  return (
    <Modal trigger={label} title={expense ? "Edit expense" : "Add expense"} variant={expense ? "" : "primary"} small={small}>
      <ActionForm action={saveExpenseAction}>
        {expense && <input type="hidden" name="id" value={e.id} />}
        <Field label="Building">
          <select name="houseId" required className="input" defaultValue={e.houseId ?? defaultHouseId ?? (houses.length === 1 ? houses[0].id : "")}>
            <option value="" disabled>Select…</option>
            {houses.map((h) => <option key={h.id} value={h.id}>{h.locationName ? `${h.locationName} — ` : ""}{h.name}</option>)}
          </select>
        </Field>
        <Row>
          <Field label="Category">
            <select name="categoryId" required className="input" defaultValue={e.categoryId ?? ""}>
              <option value="" disabled>Select…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Amount (₹)"><input name="amount" type="number" min={1} required defaultValue={e.amount} className="input" /></Field>
        </Row>
        <Row>
          <Field label="Paid on"><input name="date" type="date" required defaultValue={e.date ?? todayStr()} className="input" /></Field>
          <Field label="Bill month"><input name="billMonth" type="month" required defaultValue={e.billMonth ?? todayStr().slice(0, 7)} className="input" /></Field>
        </Row>
        <Row>
          <Field label="Vendor"><input name="vendor" defaultValue={e.vendor ?? ""} className="input" /></Field>
          <Field label="Bill no."><input name="billNo" defaultValue={e.billNo ?? ""} className="input" /></Field>
        </Row>
        <Field label="Payment method">
          <select name="paymentMethod" className="input" defaultValue={e.paymentMethod ?? ""}>
            <option value="">—</option>
            {["UPI", "CASH", "BANK", "CHEQUE"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Bill / attachment link"><input name="attachmentUrl" defaultValue={e.attachmentUrl ?? ""} className="input" /></Field>
        <Field label="Note"><input name="note" defaultValue={e.note ?? ""} className="input" /></Field>
      </ActionForm>
    </Modal>
  );
}
