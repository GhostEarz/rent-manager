import { cookies } from "next/headers";

const COOKIE = "houseId";

/** Active house for the signed-in user, or null for "all houses" / not yet chosen. */
export async function activeHouseId(): Promise<number | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  const n = v ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function setActiveHouseId(houseId: number | null) {
  const store = await cookies();
  if (houseId == null) store.delete(COOKIE);
  else store.set(COOKIE, String(houseId), { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
}
