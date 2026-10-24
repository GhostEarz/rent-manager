import Link from "next/link";
import { notFound } from "next/navigation";
import { checkInAction } from "@/actions/tenants";
import { cancelStayAction } from "@/actions/stays";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { PaymentDialog } from "@/components/forms";
import { Modal } from "@/components/Modal";
import { MonthCalendar } from "@/components/MonthCalendar";
import { ArriveStayButton, CheckInStayDialog, CheckOutStayDialog, StayPaymentDialog } from "@/components/StayForms";
import { Badge, Empty, Field, PageHeader, Row, Stat, todayStr } from "@/components/ui";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { addMonths } from "@/server/services/billing-core";
import { currentMonth, today } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function RoomPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string; book?: string }> }) {
  const user = await requireUser();
  const roomId = Number((await params).id);
  if (!Number.isInteger(roomId)) notFound();
  const sp = await searchParams;
  const month = sp.month?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const book = sp.book?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];

  const rooms = await Q.listRooms(user);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) notFound();
  const history = await Q.roomRentHistory(user, roomId);
  const unit = room.rentalType === "DAILY" ? "night" : "month";

  const header = (
    <PageHeader title={`Room ${room.number}`} sub={`${room.houseName} · ${room.floorName}`}>
      <Badge v={room.status} />
      <Badge v={room.rentalType === "DAILY" ? "OCCUPIED" : "ACTIVE"}>{room.rentalType === "DAILY" ? "Daily" : "Monthly"}</Badge>
    </PageHeader>
  );
  const back = (
    <p className="no-print -mt-3 mb-4 text-sm">
      <Link href={`/buildings/${room.houseId}`} className="text-indigo-600 hover:underline dark:text-indigo-400">← {room.houseName}</Link>
    </p>
  );

  if (room.rentalType === "DAILY") {
    const [cal, stays, bookable] = await Promise.all([
      Q.roomCalendar(user, roomId, month), Q.listStays(user, { roomId }), Q.bookableDailyRooms(user, room.houseId),
    ]);
    if (!cal) notFound();
    const from = `${month}-01`;
    const to = `${addMonths(month, 1)}-01`;
    const tomorrow = new Date(Date.parse(today()) + 86_400_000).toISOString().slice(0, 10);
    const inMonth = stays
      .filter((s) => s.status !== "CANCELLED" && s.checkIn < to && (s.checkOut ?? tomorrow) > from)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    const href = (extra: Record<string, string>) => `/rooms/${roomId}?${new URLSearchParams({ month, ...extra })}`;

    return (
      <>
        {header}
        {back}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Occupied nights" value={String(cal.occupied)} tone="good" sub={fmtMonth(month)} />
          <Stat label="Vacant nights" value={String(cal.vacant)} sub={`of ${cal.days}`} />
          <Stat label="Rate" value={rupees(room.currentRent)} sub="per night" />
        </div>

        <section className="card mb-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href={`/rooms/${roomId}?month=${addMonths(month, -1)}`} className="btn btn-sm">← {fmtMonth(addMonths(month, -1))}</Link>
            <h2 className="text-sm font-semibold">{fmtMonth(month)}</h2>
            <Link href={`/rooms/${roomId}?month=${addMonths(month, 1)}`} className="btn btn-sm">{fmtMonth(addMonths(month, 1))} →</Link>
          </div>
          <MonthCalendar month={month} stays={cal.stays} today={today()} bookHref={(d) => href({ book: d })} />
          <div className="mt-3">
            <CheckInStayDialog
              key={book ?? "none"}
              rooms={bookable as never}
              roomId={roomId}
              checkIn={book}
              defaultOpen={!!book}
              label="Add booking / check-in"
            />
          </div>
        </section>

        <h2 className="mb-2 text-sm font-semibold">Stays in {fmtMonth(month)}</h2>
        {inMonth.length === 0 ? <Empty>No guests this month — the room is vacant all {cal.days} nights.</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {inMonth.map((s) => (
              <div key={s.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{s.guestName}</p>
                  <Badge v={s.status === "ACTIVE" ? "ACTIVE" : s.status === "BOOKED" ? "PARTIAL" : "ENDED"}>{s.status === "BOOKED" ? "Booked" : s.status}</Badge>
                </div>
                <p className="text-sm">{fmtDate(s.checkIn)} → {s.checkOut ? fmtDate(s.checkOut) : "open"} <span className="text-muted">· {s.nights} night{s.nights === 1 ? "" : "s"}</span></p>
                <p className="text-sm"><span className="text-muted">Due</span> {rupees(s.amountDue)} · <span className="text-muted">Paid</span> {rupees(s.paid)} · <span className={`font-medium ${s.balance > 0 ? "text-red-600" : ""}`}>{s.balance > 0 ? `Balance ${rupees(s.balance)}` : "Settled"}</span></p>
                {s.phone && <a href={`tel:${s.phone}`} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">{s.phone}</a>}
                <div className="flex flex-wrap gap-1">
                  <StayPaymentDialog stayId={s.id} roomNumber={s.roomNumber} balance={s.balance} />
                  {s.status === "BOOKED" && <ArriveStayButton id={s.id} />}
                  {s.status === "ACTIVE" && <CheckOutStayDialog id={s.id} roomNumber={s.roomNumber} />}
                  {(s.status === "ACTIVE" || s.status === "BOOKED") && (
                    <ConfirmAction action={cancelStayAction} fields={{ id: s.id }} label="Cancel" confirm={`Cancel the stay for ${s.guestName}?`} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <RentHistory history={history} unit={unit} />
      </>
    );
  }

  // Monthly room
  const [options, unhoused] = await Promise.all([Q.activeTenancyOptions(user, room.houseId), Q.tenantsWithoutRoom(user, room.houseId)]);
  const mine = options.find((o: any) => o.id === room.tenancyId);
  return (
    <>
      {header}
      {back}
      <div className="card mb-4 space-y-3">
        <p className="text-2xl font-semibold">{rupees(room.currentRent)}<span className="text-sm font-normal text-muted"> / month</span></p>
        {room.tenancyId && room.tenantId ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Current tenant</p>
              <Link href={`/tenants/${room.tenantId}`} className="text-lg font-semibold hover:underline">{room.tenantName}</Link>
              {mine && <p className={`text-sm ${mine.due > 0 ? "text-red-600" : "text-muted"}`}>{mine.due > 0 ? `Owes ${rupees(mine.due)}` : "Rent up to date"}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <PaymentDialog options={options as never} tenancyId={room.tenancyId} />
              <Link href={`/tenants/${room.tenantId}`} className="btn">Tenant details</Link>
            </div>
          </div>
        ) : room.status === "MAINTENANCE" ? (
          <p className="text-sm text-muted">This room is under maintenance. Mark it available from the Rooms page to rent it out.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted">Vacant — no tenant right now.</p>
            {unhoused.length === 0 ? (
              <p className="text-sm">Add a tenant first (<Link className="text-indigo-600 underline" href="/tenants">Tenants</Link>), then move them in here.</p>
            ) : (
              <Modal trigger="Move a tenant in" title={`Move in — room ${room.number}`} variant="primary">
                <ActionForm action={checkInAction} submit="Move in">
                  <input type="hidden" name="roomId" value={room.id} />
                  <Field label="Tenant">
                    <select name="tenantId" required className="input" defaultValue="">
                      <option value="" disabled>Select…</option>
                      {unhoused.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Row>
                    <Field label="Move-in date"><input name="startDate" type="date" required defaultValue={todayStr()} className="input" /></Field>
                    <Field label="Security deposit (₹)"><input name="securityDeposit" type="number" min={0} required defaultValue={0} className="input" /></Field>
                  </Row>
                  <Field label="Custom rent (optional)"><input name="rent" type="number" min={0} className="input" placeholder={`Room rent ${room.currentRent}`} /></Field>
                </ActionForm>
              </Modal>
            )}
          </div>
        )}
      </div>
      <RentHistory history={history} unit={unit} />
    </>
  );
}

function RentHistory({ history, unit }: { history: any[]; unit: string }) {
  return (
    <details className="card mt-4 text-sm">
      <summary className="cursor-pointer font-medium">Rate history</summary>
      <ul className="mt-2 space-y-0.5 text-muted">
        {history.map((h) => <li key={h.id}>{rupees(h.rent)}/{h.rentalType === "DAILY" ? "night" : "month"} from {fmtDate(h.effectiveFrom)}</li>)}
      </ul>
      <p className="mt-2 text-xs text-muted">Change the {unit} rate or rental type from the Rooms page.</p>
    </details>
  );
}
