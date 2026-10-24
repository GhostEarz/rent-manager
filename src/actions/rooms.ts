"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireOwner, requireUser } from "@/lib/session";
import { date, id, int, obj, optStr, posInt, str } from "@/lib/validators";
import * as rooms from "@/server/services/rooms";

export async function addFloorAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ houseId: id, number: int, name: str }).parse(obj(fd));
    await rooms.addFloor(u, v);
  });
}
export async function updateFloorAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ id, number: int, name: str }).parse(obj(fd));
    await rooms.updateFloor(u, v.id, { number: v.number, name: v.name });
  });
}
export async function deleteFloorAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    await rooms.deleteFloor(u, id.parse(fd.get("id")));
  });
}
export async function addRoomAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({
      number: str, floorId: id, rentalType: z.enum(["MONTHLY", "DAILY"]).default("MONTHLY"), rent: posInt, notes: optStr,
    }).parse(obj(fd));
    await rooms.addRoom(u, v);
  });
}
export async function updateRoomAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ id, number: str, floorId: id, notes: optStr, status: z.enum(["VACANT", "MAINTENANCE", "OCCUPIED"]) }).parse(obj(fd));
    await rooms.updateRoom(u, v.id, v);
  });
}
/** One-dialog edit: details always; rent / rental type too when the caller is an owner and they changed. */
export async function saveRoomAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ id, number: str, floorId: id, notes: optStr, status: z.enum(["VACANT", "MAINTENANCE", "OCCUPIED"]) }).parse(obj(fd));
    await rooms.updateRoom(u, v.id, v);
    if (u.role !== "OWNER" || !fd.get("rent")) return;
    const p = z.object({
      rent: posInt, effectiveFrom: date, rentalType: z.enum(["MONTHLY", "DAILY"]), currentRent: int, currentType: z.enum(["MONTHLY", "DAILY"]),
    }).parse(obj(fd));
    if (p.rentalType !== p.currentType) await rooms.changeRentalType(u, v.id, { rentalType: p.rentalType, rent: p.rent, effectiveFrom: p.effectiveFrom });
    else if (p.rent !== p.currentRent) await rooms.changeRoomRent(u, v.id, p.rent, p.effectiveFrom);
  });
}
export async function deleteRoomAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    await rooms.deleteRoom(u, id.parse(fd.get("id")));
  });
}
/** Delete from the room's own page, then leave it (the page would 404 otherwise). */
export async function deleteRoomAndLeaveAction(_: unknown, fd: FormData) {
  const res = await deleteRoomAction(_, fd);
  if (res.error) return res;
  redirect(`/buildings/${id.parse(fd.get("houseId"))}`);
}
export async function changeRentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const v = z.object({ id, rent: posInt, effectiveFrom: date }).parse(obj(fd));
    await rooms.changeRoomRent(u, v.id, v.rent, v.effectiveFrom);
  });
}
export async function changeRentalTypeAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const v = z.object({
      id, rentalType: z.enum(["MONTHLY", "DAILY"]), rent: posInt, effectiveFrom: date,
    }).parse(obj(fd));
    await rooms.changeRentalType(u, v.id, v);
  });
}
