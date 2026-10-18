import { checkInStayAction, checkOutStayAction, recordStayPaymentAction } from "@/actions/stays";
import { ActionForm } from "./ActionForm";
import { Modal } from "./Modal";
import { Field, Row, todayStr } from "./ui";

export function CheckInStayDialog({ rooms }: { rooms: { id: number; number: string; dailyRate: number }[] }) {
  return (
    <Modal trigger="Check in guest" title="Check in guest" variant="primary">
      <ActionForm action={checkInStayAction} submit="Check in">
        <Row>
          <Field label="Room">
            <select name="roomId" required className="input" defaultValue="">
              <option value="" disabled>Select…</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.number} (₹{r.dailyRate}/night)</option>)}
            </select>
          </Field>
          <Field label="Check-in"><input name="checkIn" type="date" required defaultValue={todayStr()} className="input" /></Field>
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
