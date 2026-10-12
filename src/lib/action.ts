import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

export type ActionResult = { ok?: true; error?: string };

/** Run a mutation, turning validation / domain errors into a message for the form. */
export async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    const err = e as { code?: string; message?: string };
    if (err.code === "23505") return { error: "That already exists" };
    if (err.code === "23503") return { error: "It is still referenced by other records" };
    return { error: err.message ?? "Something went wrong" };
  }
}
