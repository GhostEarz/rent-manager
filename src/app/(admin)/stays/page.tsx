import { cancelStayAction } from "@/actions/stays";
import { ConfirmAction } from "@/components/ActionForm";
import { CheckInStayDialog, CheckOutStayDialog, StayPaymentDialog } from "@/components/StayForms";
import { Badge, Empty, PageHeader, TableWrap } from "@/components/ui";
import { activeHouseId } from "@/lib/house";
import { fmtDate, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import * as Q from "@/server/services/queries";

export default async function StaysPage() {
  const user = await requireUser();
  const admin = user.role === "ADMIN";
  const houseId = (await activeHouseId()) ?? undefined;
  const [stays, vacant] = await Promise.all([Q.listStays({ houseId }), Q.vacantDailyRooms(houseId)]);
  const active = stays.filter((s) => s.status === "ACTIVE");
  const past = stays.filter((s) => s.status !== "ACTIVE");

  return (
    <>
      <PageHeader title="Stays" sub={`${active.length} active · ${vacant.length} rooms available`}>
        <CheckInStayDialog rooms={vacant as never} />
      </PageHeader>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Active stays</h2>
        {active.length === 0 ? <Empty>No active stays</Empty> : (
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Room</th><th>Guest</th><th>Check-in</th><th>Nights</th><th>Due</th><th>Paid</th><th>Balance</th><th /></tr></thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.id}>
                    <td>{s.roomNumber}</td>
                    <td>{s.guestName}{s.phone && <div className="text-xs text-muted">{s.phone}</div>}</td>
                    <td>{fmtDate(s.checkIn)}</td>
                    <td>{s.nights}</td>
                    <td>{rupees(s.amountDue)}</td>
                    <td>{rupees(s.paid)}</td>
                    <td className={`font-medium ${s.balance > 0 ? "text-red-600" : ""}`}>{rupees(s.balance)}</td>
                    <td className="space-x-1 whitespace-nowrap text-right">
                      <StayPaymentDialog stayId={s.id} roomNumber={s.roomNumber} balance={s.balance} />
                      <CheckOutStayDialog id={s.id} roomNumber={s.roomNumber} />
                      {admin && <ConfirmAction action={cancelStayAction} fields={{ id: s.id }} label="Cancel" confirm={`Cancel this stay for ${s.guestName}?`} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Past stays</h2>
        {past.length === 0 ? <Empty>No past stays</Empty> : (
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Room</th><th>Guest</th><th>Check-in</th><th>Check-out</th><th>Nights</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {past.map((s) => (
                  <tr key={s.id}>
                    <td>{s.roomNumber}</td>
                    <td>{s.guestName}</td>
                    <td>{fmtDate(s.checkIn)}</td>
                    <td>{fmtDate(s.checkOut)}</td>
                    <td>{s.nights}</td>
                    <td>{rupees(s.amountDue)}</td>
                    <td className={s.balance > 0 ? "font-medium text-red-600" : ""}>{rupees(s.balance)}</td>
                    <td><Badge v={s.status === "CANCELLED" ? "ENDED" : "PAID"}>{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
