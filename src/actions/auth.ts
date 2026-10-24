"use server";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { registerOrganization } from "@/server/services/expenses";

export async function loginAction(_: unknown, fd: FormData) {
  try {
    await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Invalid email or password" };
    throw e; // redirect
  }
  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Self-service sign-up: creates a new organization with the caller as its owner, then signs them in. */
export async function registerAction(_: unknown, fd: FormData) {
  const parsed = z
    .object({
      orgName: z.string().trim().min(1, "Enter your business or property-group name"),
      name: z.string().trim().min(1, "Enter your name"),
      email: z.string().trim().email("Enter a valid email"),
      password: z.string().min(8, "Password needs 8+ characters"),
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await registerOrganization(parsed.data);
  } catch (e) {
    return { error: (e as Error).message };
  }
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Account created — please sign in" };
    throw e; // redirect
  }
  return {};
}
