import {
  addHouseAction, addLocationAction, deleteHouseAction, deleteLocationAction, updateHouseAction, updateLocationAction,
} from "@/actions/properties";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { Badge, Field, PageHeader, Row } from "@/components/ui";
import { requireOwnerPage } from "@/lib/session";
import * as Q from "@/server/services/queries";

export default async function PropertiesPage() {
  const user = await requireOwnerPage();
  const [locations, houses] = await Promise.all([Q.listLocations(user), Q.listHouses(user)]);

  return (
    <>
      <PageHeader title="Locations & buildings" sub={`${locations.length} locations · ${houses.length} buildings`}>
        <Modal trigger="Add location" title="Add location">
          <ActionForm action={addLocationAction}>
            <Field label="Name"><input name="name" required className="input" placeholder="Kazhakuttom" /></Field>
            <Field label="Notes"><input name="notes" className="input" /></Field>
          </ActionForm>
        </Modal>
        <Modal trigger="Add building" title="Add building" variant="primary">
          <ActionForm action={addHouseAction}>
            <Field label="Location">
              <select name="locationId" required className="input">
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Building name"><input name="name" required className="input" placeholder="Green Villa" /></Field>
            <Field label="Address"><input name="address" className="input" /></Field>
          </ActionForm>
        </Modal>
      </PageHeader>

      {locations.map((l: any) => (
        <section key={l.id} className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{l.name}</h2>
            <div className="flex gap-1">
              <Modal trigger="Edit" title="Edit location" small>
                <ActionForm action={updateLocationAction}>
                  <input type="hidden" name="id" value={l.id} />
                  <Field label="Name"><input name="name" required defaultValue={l.name} className="input" /></Field>
                  <Field label="Notes"><input name="notes" defaultValue={l.notes ?? ""} className="input" /></Field>
                </ActionForm>
              </Modal>
              {houses.every((h: any) => h.locationId !== l.id) && (
                <ConfirmAction action={deleteLocationAction} fields={{ id: l.id }} label="Delete" confirm={`Delete ${l.name}?`} />
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {houses.filter((h: any) => h.locationId === l.id).map((h: any) => (
              <div key={h.id} className="card space-y-2">
                <div className="flex items-start justify-between">
                  <p className="text-lg font-semibold">{h.name}</p>
                  <Badge v={h.active ? "ACTIVE" : "ENDED"}>{h.active ? "Active" : "Inactive"}</Badge>
                </div>
                {h.address && <p className="text-sm text-muted">{h.address}</p>}
                <div className="flex flex-wrap gap-1">
                  <Modal trigger="Edit" title={`Edit ${h.name}`} small>
                    <ActionForm action={updateHouseAction}>
                      <input type="hidden" name="id" value={h.id} />
                      <Field label="Location">
                        <select name="locationId" required defaultValue={h.locationId} className="input">
                          {locations.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Building name"><input name="name" required defaultValue={h.name} className="input" /></Field>
                      <Field label="Address"><input name="address" defaultValue={h.address ?? ""} className="input" /></Field>
                      <Field label="Status">
                        <select name="active" defaultValue={h.active ? "true" : "false"} className="input">
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      </Field>
                    </ActionForm>
                  </Modal>
                  <ConfirmAction action={deleteHouseAction} fields={{ id: h.id }} label="Delete" confirm={`Delete ${h.name}?`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
