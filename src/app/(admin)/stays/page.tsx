import Link from "next/link";
import { cancelStayAction } from "@/actions/stays";
import { ConfirmAction } from "@/components/ActionForm";
import { ArriveStayButton, CheckInStayDialog, CheckOutStayDialog, StayPaymentDialog } from "@/components/StayForms";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { activeHouseId } from "@/lib/house";
import { fmtDate, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import * as Q from "@/server/services/queries";

export default async function StaysPage() {
  const user = await requireUser();
  const houseId = await activeHouseId(user);
  const [stays, rooms] = await Promise.all([Q.listStays(user, { houseId }), Q.bookableDailyRooms(user, houseId)]);
  const active = stays.filter((s) => s.status === "ACTIVE");
  const booked = stays.filter((s) => s.status === "BOOKED").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const past = stays.filter((s) => s.status === "ENDED" || s.status === "CANCELLED");

  return (
    <>
      <PageHeader title="Daily stays" sub={`${active.length} in house · ${booked.length} upcoming · ${rooms.length} daily rooms`}>
        <CheckInStayDialog rooms={rooms as never} />
      </PageHeader>

      <StaySection title="In house" empty="No guests in house">
        {active.map((s) => (
          <StayCard key={s.id} s={s}>
            <StayPaymentDialog stayId={s.id} roomNumber={s.roomNumber} balance={s.balance} />
            <CheckOutStayDialog id={s.id} roomNumber={s.roomNumber} />
            <ConfirmAction action={cancelStayAction} fields={{ id: s.id }} label="Cancel" confirm={`Cancel this stay for ${s.guestName}?`} />
          </StayCard>
        ))}
      </StaySection>

      <StaySection title="Upcoming bookings" empty="No upcoming bookings">
        {booked.map((s) => (
          <StayCard key={s.id} s={s}>
            <StayPaymentDialog stayId={s.id} roomNumber={s.roomNumber} balance={s.balance} />
            <ArriveStayButton id={s.id} />
            <ConfirmAction action={cancelStayAction} fields={{ id: s.id }} label="Cancel" confirm={`Cancel the booking for ${s.guestName}?`} />
          </StayCard>
        ))}
      </StaySection>

      <StaySection title="Past stays" empty="No past stays">
        {past.map((s) => <StayCard key={s.id} s={s} />)}
      </StaySection>
    </>
  );
}

function StaySection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children.length === 0 ? <Empty>{empty}</Empty> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>}
    </section>
  );
}

function StayCard({ s, children }: { s: Awaited<ReturnType<typeof Q.listStays>>[number]; children?: React.ReactNode }) {
  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{s.guestName}</p>
          <p className="text-sm text-muted">
            <Link href={`/rooms/${s.roomId}`} className="hover:underline">{s.houseName} · Room {s.roomNumber}</Link>
          </p>
        </div>
        <Badge v={s.status === "ACTIVE" ? "ACTIVE" : s.status === "BOOKED" ? "PARTIAL" : "ENDED"}>{s.status === "BOOKED" ? "Booked" : s.status}</Badge>
      </div>
      <p className="text-sm">{fmtDate(s.checkIn)} → {s.checkOut ? fmtDate(s.checkOut) : "open"} <span className="text-muted">· {s.nights} night{s.nights === 1 ? "" : "s"} × {rupees(s.dailyRate)}</span></p>
      {s.status !== "CANCELLED" && (
        <p className="text-sm">
          <span className="text-muted">Due</span> {rupees(s.amountDue)} · <span className="text-muted">Paid</span> {rupees(s.paid)} ·{" "}
          <span className={`font-medium ${s.balance > 0 ? "text-red-600" : ""}`}>{s.balance > 0 ? `Balance ${rupees(s.balance)}` : "Settled"}</span>
        </p>
      )}
      {s.phone && <a href={`tel:${s.phone}`} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">{s.phone}</a>}
      {children && <div className="flex flex-wrap gap-1">{children}</div>}
    </div>
  );
}
