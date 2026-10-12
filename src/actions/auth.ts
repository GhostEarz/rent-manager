"use server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";

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
