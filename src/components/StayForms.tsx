import { checkInStayAction, checkOutStayAction, recordStayPaymentAction, startBookedStayAction } from "@/actions/stays";
import { ActionForm } from "./ActionForm";
import { Modal } from "./Modal";
import { Field, Row, todayStr } from "./ui";

export function CheckInStayDialog({
  rooms, roomId, label = "Add booking / check-in", checkIn, small = false, defaultOpen = false,
}: {
  rooms: { id: number; number: string; dailyRate: number; houseName?: string }[];
  roomId?: number; label?: string; checkIn?: string; small?: boolean; defaultOpen?: boolean;
}) {
  return (
    <Modal trigger={label} title="Daily stay" variant="primary" small={small} defaultOpen={defaultOpen}>
      <ActionForm action={checkInStayAction} submit="Save">
        <p className="text-xs text-muted">Pick the nights the room is taken. Check-out is the morning the guest leaves, so that night is free for the next guest. A future check-in date reserves the room; leave check-out empty for an open-ended stay starting today or earlier.</p>
        <Field label="Room">
          <select name="roomId" required className="input" defaultValue={roomId ?? ""}>
            <option value="" disabled>Select…</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.houseName ? `${r.houseName} · ` : ""}Room {r.number} (₹{r.dailyRate}/night)</option>)}
          </select>
        </Field>
        <Row>
          <Field label="Check-in"><input name="checkIn" type="date" required defaultValue={checkIn ?? todayStr()} className="input" /></Field>
          <Field label="Check-out"><input name="checkOut" type="date" className="input" /></Field>
        </Row>
        <Row>
          <Field label="Guest name"><input name="guestName" required className="input" /></Field>
          <Field label="Phone"><input name="phone" className="input" inputMode="tel" /></Field>
        </Row>
        <Field label="Nightly rate override (₹)"><input name="dailyRate" type="number" min={1} className="input" placeholder="Leave blank to use the room's rate" /></Field>
        <Field label="Notes"><input name="notes" className="input" /></Field>
      </ActionForm>
    </Modal>
  );
}

export function ArriveStayButton({ id }: { id: number }) {
  return (
    <ActionForm action={startBookedStayAction} submit="Check in" inline>
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}

export function CheckOutStayDialog({ id, roomNumber }: { id: number; roomNumber: string }) {
  return (
    <Modal trigger="Check out" title={`Check out — room ${roomNumber}`} small>
      <ActionForm action={checkOutStayAction} submit="Check out">
        <input type="hidden" name="id" value={id} />
        <Field label="Check-out date"><input name="checkOut" type="date" required defaultValue={todayStr()} className="input" /></Field>
      </ActionForm>
    </Modal>
  );
}

export function StayPaymentDialog({ stayId, roomNumber, balance }: { stayId: number; roomNumber: string; balance: number }) {
  return (
    <Modal trigger="Record payment" title={`Payment — room ${roomNumber}`} small variant="primary">
      <ActionForm action={recordStayPaymentAction} submit="Save payment">
        <input type="hidden" name="stayId" value={stayId} />
        <Row>
          <Field label="Amount (₹)"><input name="amount" type="number" min={1} required defaultValue={balance > 0 ? balance : undefined} className="input" /></Field>
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
        <Field label="Note"><input name="note" className="input" /></Field>
      </ActionForm>
    </Modal>
  );
}
