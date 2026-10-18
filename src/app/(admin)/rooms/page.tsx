import { addFloorAction, addRoomAction, changeRentAction, changeRentalTypeAction, deleteFloorAction, deleteRoomAction, updateFloorAction, updateRoomAction } from "@/actions/rooms";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { Badge, Field, PageHeader, Row, todayStr } from "@/components/ui";
import { activeHouseId } from "@/lib/house";
import { fmtDate, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import * as Q from "@/server/services/queries";

export default async function RoomsPage() {
  const user = await requireUser();
  const admin = user.role === "ADMIN";
  const houseId = (await activeHouseId()) ?? undefined;
  const [rooms, floors] = await Promise.all([Q.listRooms(houseId), Q.listFloors(houseId)]);
  const history = Object.fromEntries(await Promise.all(rooms.map(async (r) => [r.id, await Q.roomRentHistory(r.id)] as const)));

  return (
    <>
      <PageHeader title="Rooms" sub={`${rooms.length} rooms on ${floors.length} floors`}>
        {admin && houseId && (
          <Modal trigger="Add floor" title="Add floor">
            <ActionForm action={addFloorAction}>
              <input type="hidden" name="houseId" value={houseId} />
              <Row>
                <Field label="Number"><input name="number" type="number" required className="input" defaultValue={floors.length + 1} /></Field>
                <Field label="Name"><input name="name" required className="input" placeholder="Floor 3" /></Field>
              </Row>
            </ActionForm>
          </Modal>
        )}
        <Modal trigger="Add room" title="Add room" variant="primary">
          <ActionForm action={addRoomAction}>
            <Row>
              <Field label="Room number"><input name="number" required className="input" placeholder="108" /></Field>
              <Field label="Floor">
                <select name="floorId" required className="input">{floors.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              </Field>
            </Row>
            <Row>
              <Field label="Rental type">
                <select name="rentalType" className="input" defaultValue="MONTHLY">
                  <option value="MONTHLY">Monthly</option>
                  <option value="DAILY">Daily</option>
                </select>
              </Field>
              <Field label="Rent (₹)"><input name="rent" type="number" min={1} required className="input" /></Field>
            </Row>
            <Field label="Notes"><input name="notes" className="input" /></Field>
          </ActionForm>
        </Modal>
      </PageHeader>

      {floors.map((f) => (
        <section key={f.id} className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{f.name}</h2>
            {admin && (
              <div className="flex gap-1">
                <Modal trigger="Rename" title="Edit floor" small>
                  <ActionForm action={updateFloorAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <Row>
                      <Field label="Number"><input name="number" type="number" required defaultValue={f.number} className="input" /></Field>
                      <Field label="Name"><input name="name" required defaultValue={f.name} className="input" /></Field>
                    </Row>
                  </ActionForm>
                </Modal>
                {rooms.every((r) => r.floorId !== f.id) && (
                  <ConfirmAction action={deleteFloorAction} fields={{ id: f.id }} label="Delete" confirm={`Delete ${f.name}?`} />
                )}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.filter((r) => r.floorId === f.id).map((r) => (
              <div key={r.id} className="card space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-semibold">Room {r.number}</p>
                    <p className="text-sm text-muted">{r.tenantName ?? "No tenant"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge v={r.status} />
                    <span className="text-[10px] font-medium uppercase text-muted">{r.rentalType === "DAILY" ? "Daily" : "Monthly"}</span>
                  </div>
                </div>
                <p className="text-xl font-semibold">{rupees(r.currentRent)}<span className="text-xs font-normal text-muted"> / {r.rentalType === "DAILY" ? "night" : "month"}</span></p>
                {r.notes && <p className="text-xs text-muted">{r.notes}</p>}
                <div className="flex flex-wrap gap-1">
                  <Modal trigger="Edit" title={`Edit room ${r.number}`} small>
                    <ActionForm action={updateRoomAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <Row>
                        <Field label="Room number"><input name="number" required defaultValue={r.number} className="input" /></Field>
                        <Field label="Floor">
                          <select name="floorId" defaultValue={r.floorId} className="input">{floors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                        </Field>
                      </Row>
                      <Field label="Status">
                        <select name="status" defaultValue={r.status === "MAINTENANCE" ? "MAINTENANCE" : "VACANT"} disabled={r.status === "OCCUPIED"} className="input">
                          <option value="VACANT">Available</option>
                          <option value="MAINTENANCE">Under maintenance</option>
                        </select>
                      </Field>
                      {r.status === "OCCUPIED" && <input type="hidden" name="status" value="OCCUPIED" />}
                      <Field label="Notes"><input name="notes" defaultValue={r.notes ?? ""} className="input" /></Field>
                    </ActionForm>
                  </Modal>
                  {admin && (
                    <Modal trigger="Change rent" title={`Change rent — room ${r.number}`} small>
                      <ActionForm action={changeRentAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <p className="text-xs text-muted">Past months keep their old rent. Tenants who were not given a custom rent follow this change from the effective date.</p>
                        <Row>
                          <Field label="New rent (₹)"><input name="rent" type="number" min={1} required defaultValue={r.currentRent} className="input" /></Field>
                          <Field label="Effective from"><input name="effectiveFrom" type="date" required defaultValue={todayStr()} className="input" /></Field>
                        </Row>
                      </ActionForm>
                    </Modal>
                  )}
                  {admin && r.status === "VACANT" && (
                    <Modal trigger="Change rental type" title={`Change rental type — room ${r.number}`} small>
                      <ActionForm action={changeRentalTypeAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <p className="text-xs text-muted">Only allowed while the room is vacant. Past tenancy/stay records keep their original type and rate.</p>
                        <Row>
                          <Field label="Rental type">
                            <select name="rentalType" className="input" defaultValue={r.rentalType}>
                              <option value="MONTHLY">Monthly</option>
                              <option value="DAILY">Daily</option>
                            </select>
                          </Field>
                          <Field label={`New rate (₹)`}><input name="rent" type="number" min={1} required defaultValue={r.currentRent} className="input" /></Field>
                        </Row>
                        <Field label="Effective from"><input name="effectiveFrom" type="date" required defaultValue={todayStr()} className="input" /></Field>
                      </ActionForm>
                    </Modal>
                  )}
                  {admin && !r.tenancyId && (
                    <ConfirmAction action={deleteRoomAction} fields={{ id: r.id }} label="Delete" confirm={`Delete room ${r.number}?`} />
                  )}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted">Rent history</summary>
                  <ul className="mt-1 space-y-0.5">
                    {history[r.id].map((h: any) => <li key={h.id}>{rupees(h.rent)} from {fmtDate(h.effectiveFrom)}</li>)}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
