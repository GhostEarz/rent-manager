"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { actorOf, requireAdmin, requireUser } from "@/lib/session";
import { date, id, method, month, obj, optInt, optStr, posInt, str } from "@/lib/validators";
import * as ex from "@/server/services/expenses";

export async function saveExpenseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z
      .object({
        id: optInt, categoryId: id, amount: posInt, date, billMonth: month, vendor: optStr, billNo: optStr,
        paymentMethod: z.preprocess((x) => (x === "" ? undefined : x), method.optional()).transform((x) => x ?? null),
        roomId: optInt, attachmentUrl: optStr, note: optStr,
      })
      .parse(obj(fd));
    const { id: eid, ...rest } = v;
    await ex.saveExpense(actorOf(u), eid, rest);
  });
}
export async function deleteExpenseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await ex.deleteExpense(actorOf(u), id.parse(fd.get("id")));
  });
}
export async function addCategoryAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await ex.addCategory(actorOf(u), str.parse(fd.get("name")));
  });
}
export async function deleteCategoryAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await ex.deleteCategory(actorOf(u), id.parse(fd.get("id")));
  });
}
