"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { actorOf, requireAdmin } from "@/lib/session";
import { id, obj, optStr, str } from "@/lib/validators";
import { saveSettings } from "@/server/services/common";
import { createUser, updateUser } from "@/server/services/expenses";

export async function saveSettingsAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z
      .object({ propertyName: str, propertyAddress: optStr, dueDay: z.coerce.number().int().min(1).max(28) })
      .parse(obj(fd));
    await saveSettings(actorOf(u), {
      propertyName: v.propertyName, propertyAddress: v.propertyAddress ?? "", dueDay: v.dueDay, prorate: fd.get("prorate") === "on",
    });
  });
}
export async function createUserAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z
      .object({ name: str, email: z.string().email(), password: z.string().min(8, "Password needs 8+ characters"), role: z.enum(["ADMIN", "STAFF"]) })
      .parse(obj(fd));
    await createUser(actorOf(u), v);
  });
}
export async function updateUserAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z
      .object({ id, role: z.enum(["ADMIN", "STAFF"]), password: z.preprocess((x) => (x === "" ? undefined : x), z.string().min(8, "Password needs 8+ characters").optional()) })
      .parse(obj(fd));
    await updateUser(actorOf(u), v.id, { role: v.role, active: fd.get("active") === "on", password: v.password ?? null });
  });
}
