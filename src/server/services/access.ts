// Scoped loaders: fetch a row by id and prove the actor may touch its house.
// Services call these instead of findOneByOrFail({ id }) so an id from another
// organization (or another manager's building) is indistinguishable from "not found".
import type { EntityManager } from "typeorm";
import { Expense, Floor, House, Payment, Room, Stay, StayPayment, Tenancy, Tenant } from "../entities/core";
import { assertHouse, type Actor } from "./common";

const notFound = (what: string) => new Error(`${what} not found`);

export async function houseFor(m: EntityManager, a: Actor, id: number) {
  if (!a.houseIds.includes(id)) throw notFound("Building");
  return m.getRepository(House).findOneByOrFail({ id });
}

export async function floorFor(m: EntityManager, a: Actor, id: number) {
  const f = await m.getRepository(Floor).findOneBy({ id });
  if (!f || !a.houseIds.includes(f.houseId)) throw notFound("Floor");
  return f;
}

export async function roomFor(m: EntityManager, a: Actor, id: number) {
  const r = await m.getRepository(Room).findOneBy({ id });
  if (!r || !a.houseIds.includes(r.houseId)) throw notFound("Room");
  return r;
}

export async function tenantFor(m: EntityManager, a: Actor, id: number) {
  const t = await m.getRepository(Tenant).findOneBy({ id });
  if (!t || t.orgId !== a.orgId || !a.houseIds.includes(t.houseId)) throw notFound("Tenant");
  return t;
}

export async function tenancyFor(m: EntityManager, a: Actor, id: number) {
  const t = await m.getRepository(Tenancy).findOneBy({ id });
  if (!t) throw notFound("Tenancy");
  await roomFor(m, a, t.roomId).catch(() => { throw notFound("Tenancy"); });
  return t;
}

export async function paymentFor(m: EntityManager, a: Actor, id: number) {
  const p = await m.getRepository(Payment).findOneBy({ id });
  if (!p) throw notFound("Payment");
  await tenancyFor(m, a, p.tenancyId).catch(() => { throw notFound("Payment"); });
  return p;
}

export async function stayFor(m: EntityManager, a: Actor, id: number) {
  const s = await m.getRepository(Stay).findOneBy({ id });
  if (!s) throw notFound("Stay");
  await roomFor(m, a, s.roomId).catch(() => { throw notFound("Stay"); });
  return s;
}

export async function stayPaymentFor(m: EntityManager, a: Actor, id: number) {
  const p = await m.getRepository(StayPayment).findOneBy({ id });
  if (!p) throw notFound("Payment");
  await stayFor(m, a, p.stayId).catch(() => { throw notFound("Payment"); });
  return p;
}

export async function expenseFor(m: EntityManager, a: Actor, id: number) {
  const e = await m.getRepository(Expense).findOneBy({ id });
  if (!e || !a.houseIds.includes(e.houseId)) throw notFound("Expense");
  return e;
}

export { assertHouse };
