import bcrypt from "bcryptjs";
import { getDb } from "../db/data-source";
import { Expense, ExpenseCategory, Organization, User, UserHouse, type PayMethod, type Role } from "../entities/core";
import { expenseFor, houseFor, roomFor } from "./access";
import { audit, type Actor } from "./common";

export interface ExpenseInput {
  /** Every expense belongs to exactly one building. */
  houseId: number;
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
    await houseFor(m, actor, input.houseId);
    const cat = await m.getRepository(ExpenseCategory).findOneBy({ id: input.categoryId });
    if (!cat || cat.orgId !== actor.orgId) throw new Error("Category not found");
    if (input.roomId) {
      const room = await roomFor(m, actor, input.roomId);
      if (room.houseId !== input.houseId) throw new Error("That room is not in the selected building");
    }
    if (id) {
      const before = await expenseFor(m, actor, id);
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
    const before = await expenseFor(m, actor, id);
    await m.getRepository(Expense).delete(id);
    await audit(m, actor, "DELETE", "Expense", id, before, null);
  });
}

export async function addCategory(actor: Actor, name: string) {
  const db = await getDb();
  await db.transaction(async (m) => {
    await m.getRepository(ExpenseCategory).insert({ orgId: actor.orgId, name });
    await audit(m, actor, "CREATE", "ExpenseCategory", null, null, { name });
  });
}

export async function deleteCategory(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await m.getRepository(ExpenseCategory).findOneBy({ id });
    if (!before || before.orgId !== actor.orgId) throw new Error("Category not found");
    const used = await m.getRepository(Expense).countBy({ categoryId: id });
    if (used) throw new Error(`Category is used by ${used} expense(s)`);
    await m.getRepository(ExpenseCategory).delete(id);
    await audit(m, actor, "DELETE", "ExpenseCategory", id, before, null);
  });
}

// ---- users ----------------------------------------------------------------

export async function createUser(
  actor: Actor,
  input: { name: string; email: string; password: string; role: Role; houseIds?: number[] },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const email = input.email.toLowerCase();
    if (await m.getRepository(User).countBy({ email })) throw new Error("Email already in use");
    const houseIds = input.role === "MANAGER" ? [...new Set(input.houseIds ?? [])] : [];
    for (const h of houseIds) await houseFor(m, actor, h);
    const passwordHash = await bcrypt.hash(input.password, 10);
    const res = await m.getRepository(User).insert({
      orgId: actor.orgId, name: input.name, email, passwordHash, role: input.role, active: true,
    });
    const userId = res.identifiers[0].id as number;
    if (houseIds.length) await m.getRepository(UserHouse).insert(houseIds.map((houseId) => ({ userId, houseId })));
    await audit(m, actor, "CREATE", "User", userId, null, { name: input.name, email, role: input.role, houseIds });
  });
}

export async function updateUser(
  actor: Actor,
  id: number,
  input: { role: Role; active: boolean; password?: string | null },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await m.getRepository(User).findOneBy({ id });
    if (!before || before.orgId !== actor.orgId) throw new Error("User not found");
    if (id === actor.id && (!input.active || input.role !== "OWNER"))
      throw new Error("You cannot deactivate or demote yourself");
    const patch: Partial<User> = { role: input.role, active: input.active };
    if (input.password) patch.passwordHash = await bcrypt.hash(input.password, 10);
    await m.getRepository(User).update(id, patch);
    if (input.role === "OWNER") await m.getRepository(UserHouse).delete({ userId: id });
    await audit(m, actor, "UPDATE", "User", id, { role: before.role, active: before.active }, {
      role: input.role,
      active: input.active,
      passwordChanged: !!input.password,
    });
  });
}

/** Self-service sign-up: a new organization with its first owner and default expense categories. */
export async function registerOrganization(input: { orgName: string; name: string; email: string; password: string }) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const email = input.email.toLowerCase();
    if (await m.getRepository(User).countBy({ email })) throw new Error("Email already in use");
    const org = await m.getRepository(Organization).insert({ name: input.orgName });
    const orgId = org.identifiers[0].id as number;
    const passwordHash = await bcrypt.hash(input.password, 10);
    await m.getRepository(User).insert({ orgId, name: input.name, email, passwordHash, role: "OWNER", active: true });
    await m.getRepository(ExpenseCategory).insert(DEFAULT_CATEGORIES.map((name) => ({ orgId, name })));
  });
}

export const DEFAULT_CATEGORIES = ["Electricity", "Water", "WiFi", "Maintenance", "Cleaning", "Salary", "Property Tax", "Other"];
