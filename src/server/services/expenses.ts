import bcrypt from "bcryptjs";
import { getDb } from "../db/data-source";
import { Expense, ExpenseCategory, User, type PayMethod, type Role } from "../entities/core";
import { audit, type Actor } from "./common";

export interface ExpenseInput {
  categoryId: number;
  amount: number;
  date: string;
  billMonth: string;
  vendor?: string | null;
  billNo?: string | null;
  paymentMethod?: PayMethod | null;
  roomId?: number | null;
  attachmentUrl?: string | null;
  note?: string | null;
}

export async function saveExpense(actor: Actor, id: number | null, input: ExpenseInput) {
  const db = await getDb();
  await db.transaction(async (m) => {
    if (id) {
      const before = await m.getRepository(Expense).findOneByOrFail({ id });
      await m.getRepository(Expense).update(id, input);
      await audit(m, actor, "UPDATE", "Expense", id, before, input);
    } else {
      const res = await m.getRepository(Expense).insert(input);
      await audit(m, actor, "CREATE", "Expense", res.identifiers[0].id, null, input);
    }
  });
}

export async function deleteExpense(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await m.getRepository(Expense).findOneByOrFail({ id });
    await m.getRepository(Expense).delete(id);
    await audit(m, actor, "DELETE", "Expense", id, before, null);
  });
}

export async function addCategory(actor: Actor, name: string) {
  const db = await getDb();
  await db.transaction(async (m) => {
    await m.getRepository(ExpenseCategory).insert({ name });
    await audit(m, actor, "CREATE", "ExpenseCategory", null, null, { name });
  });
}

export async function deleteCategory(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const used = await m.getRepository(Expense).countBy({ categoryId: id });
    if (used) throw new Error(`Category is used by ${used} expense(s)`);
    const before = await m.getRepository(ExpenseCategory).findOneByOrFail({ id });
    await m.getRepository(ExpenseCategory).delete(id);
    await audit(m, actor, "DELETE", "ExpenseCategory", id, before, null);
  });
}

// ---- users ----------------------------------------------------------------

export async function createUser(
  actor: Actor,
  input: { name: string; email: string; password: string; role: Role },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const email = input.email.toLowerCase();
    if (await m.getRepository(User).countBy({ email })) throw new Error("Email already in use");
    const passwordHash = await bcrypt.hash(input.password, 10);
    const res = await m.getRepository(User).insert({ name: input.name, email, passwordHash, role: input.role, active: true });
    await audit(m, actor, "CREATE", "User", res.identifiers[0].id, null, { name: input.name, email, role: input.role });
  });
}

export async function updateUser(
  actor: Actor,
  id: number,
  input: { role: Role; active: boolean; password?: string | null },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await m.getRepository(User).findOneByOrFail({ id });
    if (id === actor.id && (!input.active || input.role !== "ADMIN"))
      throw new Error("You cannot deactivate or demote yourself");
    const patch: Partial<User> = { role: input.role, active: input.active };
    if (input.password) patch.passwordHash = await bcrypt.hash(input.password, 10);
    await m.getRepository(User).update(id, patch);
    await audit(m, actor, "UPDATE", "User", id, { role: before.role, active: before.active }, {
      role: input.role,
      active: input.active,
      passwordChanged: !!input.password,
    });
  });
}
