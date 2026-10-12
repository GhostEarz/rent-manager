import { redirect } from "next/navigation";
import { auth } from "./auth";
import type { Actor } from "@/server/services/common";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Only an admin can do this");
  return user;
}

export const actorOf = (u: { id: string; name?: string | null }): Actor => ({ id: Number(u.id), name: u.name ?? "?" });
