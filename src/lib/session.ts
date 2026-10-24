import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getDb } from "@/server/db/data-source";
import { User } from "@/server/entities/core";
import type { Actor } from "@/server/services/common";

/**
 * The signed-in user, re-read from the database on every request (once per request via cache()):
 * a deactivated user or a revoked building assignment takes effect immediately, not at JWT expiry.
 * Owners see every house in their organization; managers only the ones in user_houses.
 */
export const requireUser = cache(async (): Promise<Actor> => {
  const session = await auth();
  const uid = Number(session?.user?.id);
  if (!uid) redirect("/login");
  const db = await getDb();
  const user = await db.getRepository(User).findOneBy({ id: uid });
  if (!user || !user.active) redirect("/login");
  const rows: { id: number }[] =
    user.role === "OWNER"
      ? await db.query(`SELECT id FROM houses WHERE "orgId" = $1 ORDER BY id`, [user.orgId])
      : await db.query(
          `SELECT h.id FROM houses h JOIN user_houses uh ON uh."houseId" = h.id
            WHERE uh."userId" = $1 AND h."orgId" = $2 ORDER BY h.id`,
          [user.id, user.orgId],
        );
  return { id: user.id, name: user.name, orgId: user.orgId, role: user.role, houseIds: rows.map((r) => r.id) };
});

export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("Only the owner can do this");
  return user;
}

/** For owner-only pages: managers are sent back to the dashboard instead of seeing an error. */
export async function requireOwnerPage() {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/dashboard");
  return user;
}
