import { saveSettingsAction } from "@/actions/settings";
import { ActionForm } from "@/components/ActionForm";
import { Field, PageHeader, TableWrap } from "@/components/ui";
import { requireOwnerPage } from "@/lib/session";
import { getSettings } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function SettingsPage() {
  const user = await requireOwnerPage();
  const [s, logs] = await Promise.all([getSettings(user.orgId), Q.auditLog(user, 150)]);
  return (
    <>
      <PageHeader title="Settings" />
      <section className="card max-w-xl">
        <h2 className="mb-3 text-sm font-semibold">Business &amp; billing</h2>
        <ActionForm action={saveSettingsAction}>
          <Field label="Business name"><input name="propertyName" required defaultValue={s.propertyName} className="input" /></Field>
          <Field label="Address (shown on receipts)"><input name="propertyAddress" defaultValue={s.propertyAddress} className="input" /></Field>
          <Field label="Monthly rent due day (1–28)"><input name="dueDay" type="number" min={1} max={28} required defaultValue={s.dueDay} className="input" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="prorate" defaultChecked={s.prorate} /> Pro-rate first and last month</label>
        </ActionForm>
        <p className="mt-3 text-xs text-muted">Expense categories are managed from the Expenses page. Team members are managed under Team.</p>
      </section>

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
