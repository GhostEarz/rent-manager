"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { setActiveHouseId } from "@/lib/house";
import { run } from "@/lib/action";
import { actorOf, requireAdmin, requireUser } from "@/lib/session";
import { id, obj, optStr, str } from "@/lib/validators";
import * as properties from "@/server/services/properties";

export async function addLocationAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({ name: str, notes: optStr }).parse(obj(fd));
    await properties.addLocation(actorOf(u), v);
  });
}
export async function updateLocationAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({ id, name: str, notes: optStr }).parse(obj(fd));
    await properties.updateLocation(actorOf(u), v.id, v);
  });
}
export async function deleteLocationAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await properties.deleteLocation(actorOf(u), id.parse(fd.get("id")));
  });
}
export async function addHouseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({ locationId: id, name: str, address: optStr }).parse(obj(fd));
    await properties.addHouse(actorOf(u), v);
  });
}
export async function updateHouseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({ id, locationId: id, name: str, address: optStr, active: z.coerce.boolean() }).parse(obj(fd));
    await properties.updateHouse(actorOf(u), v.id, v);
  });
}
export async function deleteHouseAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await properties.deleteHouse(actorOf(u), id.parse(fd.get("id")));
  });
}

/** Switches the active house for the session and reloads the current page. */
export async function switchHouseAction(fd: FormData) {
  await requireUser();
  const raw = fd.get("houseId");
  await setActiveHouseId(raw ? id.parse(raw) : null);
  redirect((fd.get("returnTo") as string) || "/dashboard");
}
