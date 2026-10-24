"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireOwner, requireUser } from "@/lib/session";
import { date, id, int, obj, optInt, optStr, str } from "@/lib/validators";
import * as tenants from "@/server/services/tenants";

const tenantShape = {
  name: str, phone: optStr, email: optStr, idProofType: optStr, idProofNumber: optStr,
  address: optStr, emergencyContact: optStr, docUrl: optStr, notes: optStr,
};

export async function createTenantAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    await tenants.createTenant(u, z.object({ ...tenantShape, houseId: id }).parse(obj(fd)));
  });
}
export async function updateTenantAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ id, ...tenantShape }).parse(obj(fd));
    const { id: tid, ...rest } = v;
    await tenants.updateTenant(u, tid, rest);
  });
}
export async function deleteTenantAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    await tenants.deleteTenant(u, id.parse(fd.get("id")));
  });
}
export async function checkInAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ tenantId: id, roomId: id, startDate: date, rent: optInt, securityDeposit: int }).parse(obj(fd));
    await tenants.checkIn(u, v);
  });
}
export async function moveOutAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ tenancyId: id, endDate: date, depositReturned: int }).parse(obj(fd));
    await tenants.moveOut(u, v.tenancyId, v.endDate, v.depositReturned);
  });
}
export async function transferAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireUser();
    const v = z.object({ tenancyId: id, roomId: id, date, rent: optInt }).parse(obj(fd));
    await tenants.transferRoom(u, v.tenancyId, v.roomId, v.date, v.rent);
  });
}
export async function updateTenancyAction(_: unknown, fd: FormData) {
  return run(async () => {
    const u = await requireOwner();
    const v = z.object({ id, monthlyRent: int, securityDeposit: int }).parse(obj(fd));
    await tenants.updateTenancy(u, v.id, {
      monthlyRent: v.monthlyRent, securityDeposit: v.securityDeposit, rentOverride: fd.get("rentOverride") === "on",
    });
  });
}
