import { redirect } from "next/navigation";
import { createUserAction, saveSettingsAction, updateUserAction } from "@/actions/settings";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { Badge, Field, PageHeader, Row, TableWrap } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  const [s, users, logs] = await Promise.all([getSettings(), Q.usersList(), Q.auditLog(150)]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Property &amp; billing</h2>
          <ActionForm action={saveSettingsAction}>
            <Field label="Property name"><input name="propertyName" required defaultValue={s.propertyName} className="input" /></Field>
            <Field label="Address"><input name="propertyAddress" defaultValue={s.propertyAddress} className="input" /></Field>
            <Field label="Rent due day (1–28)"><input name="dueDay" type="number" min={1} max={28} required defaultValue={s.dueDay} className="input" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="prorate" defaultChecked={s.prorate} /> Pro-rate first and last month</label>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Expense categories are managed from the Expenses page.</p>
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Users</h2>
            <Modal trigger="Add user" title="Add user" small variant="primary">
              <ActionForm action={createUserAction}>
                <Field label="Name"><input name="name" required className="input" /></Field>
                <Field label="Email"><input name="email" type="email" required className="input" /></Field>
                <Row>
                  <Field label="Password"><input name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></Field>
                  <Field label="Role"><select name="role" className="input"><option>STAFF</option><option>ADMIN</option></select></Field>
                </Row>
                <p className="text-xs text-muted">Staff can record payments and expenses, but cannot delete records or manage settings.</p>
              </ActionForm>
            </Modal>
          </div>
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <div><p className="font-medium">{u.name} {!u.active && <span className="text-xs text-muted">(inactive)</span>}</p><p className="text-xs text-muted">{u.email}</p></div>
                <div className="flex items-center gap-2">
                  <Badge v={u.role} />
                  <Modal trigger="Edit" title={`Edit ${u.name}`} small>
                    <ActionForm action={updateUserAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <Field label="Role"><select name="role" defaultValue={u.role} className="input"><option>STAFF</option><option>ADMIN</option></select></Field>
                      <Field label="New password (leave blank to keep)"><input name="password" type="password" autoComplete="new-password" className="input" /></Field>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> Active</label>
                    </ActionForm>
                  </Modal>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Audit log</h2>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{new Date(l.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td>{l.userName ?? "system"}</td>
                <td>{l.action}</td>
                <td>{l.entity}{l.entityId && ` #${l.entityId}`}</td>
                <td className="max-w-xs">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted">view</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify({ before: l.before, after: l.after }, null, 1)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
