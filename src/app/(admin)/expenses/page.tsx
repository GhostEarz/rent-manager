import Link from "next/link";
import { addCategoryAction, deleteCategoryAction, deleteExpenseAction } from "@/actions/expenses";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { ExpenseDialog } from "@/components/forms";
import { Modal } from "@/components/Modal";
import { MonthPicker } from "@/components/MonthPicker";
import { Empty, Field, PageHeader, Stat, TableWrap } from "@/components/ui";
import { activeHouseId } from "@/lib/house";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { currentMonth } from "@/server/services/common";
import * as Q from "@/server/services/queries";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; categoryId?: string; all?: string }> }) {
  const user = await requireUser();
  const admin = user.role === "OWNER";
  const houseId = await activeHouseId(user);
  const sp = await searchParams;
  const all = sp.all === "1";
  const month = sp.month?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const categoryId = sp.categoryId ? Number(sp.categoryId) : undefined;
  const [rows, categories, houses] = await Promise.all([
    Q.expensesList(user, { month: all ? undefined : month, categoryId, houseId }), Q.listCategories(user), Q.houseOptions(user),
  ]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[r.category] = (m[r.category] ?? 0) + r.amount), m), {}));
  const qs = new URLSearchParams({ ...(all ? {} : { month }), ...(categoryId ? { categoryId: String(categoryId) } : {}) }).toString();

  return (
    <>
      <PageHeader title="Expenses" sub={all ? "All time" : fmtMonth(month)}>
        {!all && <MonthPicker value={month} />}
        <Link className="btn" href={all ? `/expenses?month=${month}` : "/expenses?all=1"}>{all ? "This month" : "All time"}</Link>
        <a className="btn" href={`/api/export/expenses?${qs}`}>Export CSV</a>
        {admin && (
          <Modal trigger="Categories" title="Expense categories">
            <ul className="mb-3 space-y-1">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">{c.name}
                  <ConfirmAction action={deleteCategoryAction} fields={{ id: c.id }} label="Delete" confirm={`Delete category ${c.name}?`} />
                </li>
              ))}
            </ul>
            <ActionForm action={addCategoryAction} submit="Add category">
              <Field label="New category"><input name="name" required className="input" /></Field>
            </ActionForm>
          </Modal>
        )}
        <ExpenseDialog label="Add expense" categories={categories} houses={houses as never} defaultHouseId={houseId} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total" value={rupees(total)} tone="bad" />
        {byCat.slice(0, 3).map(([name, v]) => <Stat key={name} label={name} value={rupees(v)} />)}
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        <Link href={`/expenses?${all ? "all=1" : `month=${month}`}`} className={`btn btn-sm ${!categoryId ? "btn-primary" : ""}`}>All</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/expenses?${all ? "all=1" : `month=${month}`}&categoryId=${c.id}`} className={`btn btn-sm ${categoryId === c.id ? "btn-primary" : ""}`}>{c.name}</Link>
        ))}
      </div>
      <TableWrap>
        {rows.length === 0 ? <Empty>No expenses recorded.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Category</th><th>Vendor / note</th><th>Building</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDate(e.date)}<div className="text-xs text-muted">bill {fmtMonth(e.billMonth)}</div></td>
                  <td>{e.category}</td>
                  <td>{e.vendor ?? ""}{e.billNo && <span className="text-xs text-muted"> #{e.billNo}</span>}<div className="text-xs text-muted">{e.note}</div></td>
                  <td>{e.houseName}</td>
                  <td className="text-right font-medium">{rupees(e.amount)}</td>
                  <td className="space-x-1 whitespace-nowrap text-right">
                    {e.attachmentUrl && <a className="btn btn-sm" href={e.attachmentUrl} target="_blank" rel="noreferrer">Bill</a>}
                    <ExpenseDialog label="Edit" expense={e} categories={categories} houses={houses as never} small />
                    {admin && <ConfirmAction action={deleteExpenseAction} fields={{ id: e.id }} label="Delete" confirm="Delete this expense?" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>
    </>
  );
}
