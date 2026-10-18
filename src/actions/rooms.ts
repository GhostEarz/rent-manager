"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { actorOf, requireAdmin, requireUser } from "@/lib/session";
import { date, id, int, obj, optStr, posInt, str } from "@/lib/validators";
import * as rooms from "@/server/services/rooms";

export async function addFloorAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({ houseId: id, number: int, name: str }).parse(obj(fd));
    await rooms.addFloor(actorOf(u), v);
  });
}
export async function updateFloorAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({ id, number: int, name: str }).parse(obj(fd));
    await rooms.updateFloor(actorOf(u), v.id, { number: v.number, name: v.name });
  });
}
export async function deleteFloorAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await rooms.deleteFloor(actorOf(u), id.parse(fd.get("id")));
  });
}
export async function addRoomAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({
      number: str, floorId: id, rentalType: z.enum(["MONTHLY", "DAILY"]).default("MONTHLY"), rent: posInt, notes: optStr,
    }).parse(obj(fd));
    await rooms.addRoom(actorOf(u), v);
  });
}
export async function updateRoomAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ id, number: str, floorId: id, notes: optStr, status: z.enum(["VACANT", "MAINTENANCE", "OCCUPIED"]) }).parse(obj(fd));
    await rooms.updateRoom(actorOf(u), v.id, v);
  });
}
export async function deleteRoomAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await rooms.deleteRoom(actorOf(u), id.parse(fd.get("id")));
  });
}
export async function changeRentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({ id, rent: posInt, effectiveFrom: date }).parse(obj(fd));
    await rooms.changeRoomRent(actorOf(u), v.id, v.rent, v.effectiveFrom);
  });
}
export async function changeRentalTypeAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    const v = z.object({
      id, rentalType: z.enum(["MONTHLY", "DAILY"]), rent: posInt, effectiveFrom: date,
    }).parse(obj(fd));
    await rooms.changeRentalType(actorOf(u), v.id, v);
  });
}
