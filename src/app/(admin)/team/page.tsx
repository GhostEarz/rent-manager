import { setUserHousesAction } from "@/actions/properties";
import { createUserAction, updateUserAction } from "@/actions/settings";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { Badge, Empty, Field, PageHeader, Row } from "@/components/ui";
import { requireOwnerPage } from "@/lib/session";
import * as Q from "@/server/services/queries";

function BuildingPicker({ houses, selected = [] }: { houses: { id: number; name: string; locationName: string }[]; selected?: number[] }) {
  return (
    <fieldset className="space-y-1">
      <legend className="label">Buildings this manager can access</legend>
      {houses.length === 0 && <p className="text-xs text-muted">Add a building first.</p>}
      {houses.map((h) => (
        <label key={h.id} className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="houseIds" value={h.id} defaultChecked={selected.includes(h.id)} />
          {h.locationName} — {h.name}
        </label>
      ))}
    </fieldset>
  );
}

export default async function TeamPage() {
  const user = await requireOwnerPage();
  const [users, houses] = await Promise.all([Q.usersList(user), Q.listHouses(user)]);
  const houseName = new Map(houses.map((h: any) => [h.id as number, `${h.locationName} — ${h.name}`]));

  return (
    <>
      <PageHeader title="Team" sub="Owners see everything. Managers only see the buildings you assign.">
        <Modal trigger="Add team member" title="Add team member" variant="primary">
          <ActionForm action={createUserAction}>
            <Field label="Name"><input name="name" required className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Row>
              <Field label="Password"><input name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></Field>
              <Field label="Role"><select name="role" defaultValue="MANAGER" className="input"><option value="MANAGER">Manager</option><option value="OWNER">Owner</option></select></Field>
            </Row>
            <BuildingPicker houses={houses} />
            <p className="text-xs text-muted">Managers can record bookings, rent, payments and expenses in their buildings. They can&apos;t delete records, change rents, or see other buildings. Building access is ignored for owners.</p>
          </ActionForm>
        </Modal>
      </PageHeader>

      {users.length === 0 ? <Empty>No team members yet.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {users.map((u: any) => (
            <div key={u.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.name} {!u.active && <span className="text-xs font-normal text-muted">(inactive)</span>}</p>
                  <p className="truncate text-xs text-muted">{u.email}</p>
                </div>
                <Badge v={u.role === "OWNER" ? "ACTIVE" : "VACANT"}>{u.role === "OWNER" ? "Owner" : "Manager"}</Badge>
              </div>
              <p className="text-sm">
                {u.role === "OWNER" ? <span className="text-muted">All buildings</span> :
                  u.houseIds.length === 0 ? <span className="text-red-600">No buildings assigned</span> :
                  u.houseIds.map((id: number) => houseName.get(id) ?? `#${id}`).join(", ")}
              </p>
              <div className="flex flex-wrap gap-1">
                {u.role === "MANAGER" && (
                  <Modal trigger="Buildings" title={`Buildings — ${u.name}`} small>
                    <ActionForm action={setUserHousesAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <BuildingPicker houses={houses} selected={u.houseIds} />
                    </ActionForm>
                  </Modal>
                )}
                <Modal trigger="Edit" title={`Edit ${u.name}`} small>
                  <ActionForm action={updateUserAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <Field label="Role"><select name="role" defaultValue={u.role} className="input"><option value="MANAGER">Manager</option><option value="OWNER">Owner</option></select></Field>
                    <Field label="New password (leave blank to keep)"><input name="password" type="password" autoComplete="new-password" className="input" /></Field>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> Active</label>
                  </ActionForm>
                </Modal>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
