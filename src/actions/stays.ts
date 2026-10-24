"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireOwner, requireUser } from "@/lib/session";
import { date, id, method, obj, optStr, posInt, str } from "@/lib/validators";
import * as stays from "@/server/services/stays";

export async function checkInStayAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({
      roomId: id, guestName: str, phone: optStr, checkIn: date, checkOut: z.preprocess((x) => (x === "" ? undefined : x), date.optional()).transform((x) => x ?? null),
      dailyRate: z.preprocess((x) => (x === "" ? undefined : x), posInt.optional()), notes: optStr,
    }).parse(obj(fd));
    await stays.checkInStay(u, v);
  });
}
export async function startBookedStayAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    await stays.startBookedStay(u, id.parse(fd.get("id")));
  });
}
export async function checkOutStayAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ id, checkOut: date }).parse(obj(fd));
    await stays.checkOutStay(u, v.id, v.checkOut);
  });
}
export async function cancelStayAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    await stays.cancelStay(u, id.parse(fd.get("id")));
  });
}
export async function recordStayPaymentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({
      stayId: id, amount: posInt, paidOn: date, method, referenceNo: optStr, note: optStr,
    }).parse(obj(fd));
    await stays.recordStayPayment(u, v);
  });
}
export async function deleteStayPaymentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    await stays.deleteStayPayment(u, id.parse(fd.get("id")));
  });
}
