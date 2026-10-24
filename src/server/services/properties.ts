import { getDb } from "../db/data-source";
import { Floor, House, Location, User, UserHouse } from "../entities/core";
import { houseFor } from "./access";
import { audit, type Actor } from "./common";

// Locations / houses are owner-only (the action layer enforces the role); these checks keep
// every id inside the owner's organization.

async function locationFor(m: import("typeorm").EntityManager, a: Actor, id: number) {
  const l = await m.getRepository(Location).findOneBy({ id });
  if (!l || l.orgId !== a.orgId) throw new Error("Location not found");
  return l;
}

export async function addLocation(actor: Actor, input: { name: string; notes?: string | null }) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const res = await m.getRepository(Location).insert({ orgId: actor.orgId, name: input.name, notes: input.notes ?? null });
    await audit(m, actor, "CREATE", "Location", res.identifiers[0].id, null, input);
  });
}

export async function updateLocation(actor: Actor, id: number, input: { name: string; notes?: string | null }) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await locationFor(m, actor, id);
    await m.getRepository(Location).update(id, { name: input.name, notes: input.notes ?? null });
    await audit(m, actor, "UPDATE", "Location", id, before, input);
  });
}

export async function deleteLocation(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await locationFor(m, actor, id);
    const n = await m.getRepository(House).countBy({ locationId: id });
    if (n) throw new Error("Location still has buildings — move or delete them first");
    await m.getRepository(Location).delete(id);
    await audit(m, actor, "DELETE", "Location", id, before, null);
  });
}

export async function addHouse(
  actor: Actor,
  input: { locationId: number; name: string; address?: string | null },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    await locationFor(m, actor, input.locationId);
    const res = await m.getRepository(House).insert({
      orgId: actor.orgId,
      locationId: input.locationId,
      name: input.name,
      address: input.address ?? null,
      active: true,
    });
    await audit(m, actor, "CREATE", "House", res.identifiers[0].id, null, input);
  });
}

export async function updateHouse(
  actor: Actor,
  id: number,
  input: { locationId: number; name: string; address?: string | null; active: boolean },
) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await houseFor(m, actor, id);
    await locationFor(m, actor, input.locationId);
    await m.getRepository(House).update(id, {
      locationId: input.locationId,
      name: input.name,
      address: input.address ?? null,
      active: input.active,
    });
    await audit(m, actor, "UPDATE", "House", id, before, input);
  });
}

export async function deleteHouse(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await houseFor(m, actor, id);
    const n = await m.getRepository(Floor).countBy({ houseId: id });
    if (n) throw new Error("Building still has floors — move or delete them first");
    await m.getRepository(House).delete(id);
    await audit(m, actor, "DELETE", "House", id, before, null);
  });
}

/** Replace the set of buildings a manager can access. Owners may only assign their own buildings. */
export async function setUserHouses(actor: Actor, userId: number, houseIds: number[]) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const user = await m.getRepository(User).findOneBy({ id: userId });
    if (!user || user.orgId !== actor.orgId) throw new Error("User not found");
    if (user.role === "OWNER") throw new Error("Owners already have access to every building");
    const ids = [...new Set(houseIds)];
    for (const h of ids) await houseFor(m, actor, h);
    await m.getRepository(UserHouse).delete({ userId });
    if (ids.length) await m.getRepository(UserHouse).insert(ids.map((houseId) => ({ userId, houseId })));
    await audit(m, actor, "ASSIGN_HOUSES", "User", userId, null, { houseIds: ids });
  });
}
