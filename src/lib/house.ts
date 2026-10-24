import { cookies } from "next/headers";
import type { Actor } from "@/server/services/common";

const COOKIE = "houseId";

/** Active house for the signed-in user, or null for "all my buildings". Ignores a cookie the user can't access. */
export async function activeHouseId(a: Actor): Promise<number | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  const n = v ? Number(v) : NaN;
  return Number.isInteger(n) && a.houseIds.includes(n) ? n : null;
}

export async function setActiveHouseId(houseId: number | null) {
  const store = await cookies();
  if (houseId == null) store.delete(COOKIE);
  else store.set(COOKIE, String(houseId), { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
}
