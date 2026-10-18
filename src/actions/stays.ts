"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { actorOf, requireAdmin, requireUser } from "@/lib/session";
import { date, id, method, obj, optStr, posInt, str } from "@/lib/validators";
import * as stays from "@/server/services/stays";

export async function checkInStayAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({
      roomId: id, guestName: str, phone: optStr, checkIn: date, dailyRate: posInt.optional(), notes: optStr,
    }).parse(obj(fd));
    await stays.checkInStay(actorOf(u), v);
  });
}
export async function checkOutStayAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ id, checkOut: date }).parse(obj(fd));
    await stays.checkOutStay(actorOf(u), v.id, v.checkOut);
  });
}
export async function cancelStayAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await stays.cancelStay(actorOf(u), id.parse(fd.get("id")));
  });
}
export async function recordStayPaymentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({
      stayId: id, amount: posInt, paidOn: date, method, referenceNo: optStr, note: optStr,
    }).parse(obj(fd));
    await stays.recordStayPayment(actorOf(u), v);
  });
}
export async function deleteStayPaymentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await stays.deleteStayPayment(actorOf(u), id.parse(fd.get("id")));
  });
}
