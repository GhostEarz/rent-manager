"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { actorOf, requireAdmin, requireUser } from "@/lib/session";
import { date, id, method, obj, optInt, optStr, posInt } from "@/lib/validators";
import { deletePayment, recordPayment } from "@/server/services/billing";

export async function recordPaymentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z
      .object({
        tenancyId: id, amount: posInt, paidOn: date, method, chargeId: optInt,
        referenceNo: optStr, receivedIntoAccount: optStr, note: optStr,
      })
      .parse(obj(fd));
    await recordPayment(actorOf(u), v);
  });
}
export async function deletePaymentAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireAdmin();
    await deletePayment(actorOf(u), id.parse(fd.get("id")));
  });
}
