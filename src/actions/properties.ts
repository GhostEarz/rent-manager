"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { setActiveHouseId } from "@/lib/house";
import { run } from "@/lib/action";
import { requireOwner, requireUser } from "@/lib/session";
import { id, obj, optStr, str } from "@/lib/validators";
import * as properties from "@/server/services/properties";

export async function setUserHousesAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const userId = id.parse(fd.get("userId"));
    const houseIds = fd.getAll("houseIds").map((x) => id.parse(x));
    await properties.setUserHouses(u, userId, houseIds);
  });
}

export async function addLocationAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const v = z.object({ name: str, notes: optStr }).parse(obj(fd));
    await properties.addLocation(u, v);
  });
}
export async function updateLocationAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const v = z.object({ id, name: str, notes: optStr }).parse(obj(fd));
    await properties.updateLocation(u, v.id, v);
  });
}
export async function deleteLocationAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    await properties.deleteLocation(u, id.parse(fd.get("id")));
  });
}
export async function addHouseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const v = z.object({ locationId: id, name: str, address: optStr }).parse(obj(fd));
    await properties.addHouse(u, v);
  });
}
export async function updateHouseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const v = z.object({ id, locationId: id, name: str, address: optStr, active: z.coerce.boolean() }).parse(obj(fd));
    await properties.updateHouse(u, v.id, v);
  });
}
export async function deleteHouseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    await properties.deleteHouse(u, id.parse(fd.get("id")));
  });
}

/** Switches the active house for the session and reloads the current page. */
export async function switchHouseAction(fd: FormData) {
  const u = await requireUser();
  const raw = fd.get("houseId");
  const houseId = raw ? id.parse(raw) : null;
  if (houseId && !u.houseIds.includes(houseId)) throw new Error("No access to that building");
  await setActiveHouseId(houseId);
  redirect((fd.get("returnTo") as string) || "/dashboard");
}
