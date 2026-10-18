import { getDb } from "../db/data-source";
import { Floor, House, Location } from "../entities/core";
import { audit, type Actor } from "./common";

export async function addLocation(actor: Actor, input: { name: string; notes?: string | null }) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const res = await m.getRepository(Location).insert({ name: input.name, notes: input.notes ?? null });
    await audit(m, actor, "CREATE", "Location", res.identifiers[0].id, null, input);
  });
}

export async function updateLocation(actor: Actor, id: number, input: { name: string; notes?: string | null }) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await m.getRepository(Location).findOneByOrFail({ id });
    await m.getRepository(Location).update(id, { name: input.name, notes: input.notes ?? null });
    await audit(m, actor, "UPDATE", "Location", id, before, input);
  });
}

export async function deleteLocation(actor: Actor, id: number) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const n = await m.getRepository(House).countBy({ locationId: id });
    if (n) throw new Error("Location still has houses — move or delete them first");
    const before = await m.getRepository(Location).findOneByOrFail({ id });
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
    const res = await m.getRepository(House).insert({
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
    const before = await m.getRepository(House).findOneByOrFail({ id });
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
    const n = await m.getRepository(Floor).countBy({ houseId: id });
    if (n) throw new Error("House still has floors — move or delete them first");
    const before = await m.getRepository(House).findOneByOrFail({ id });
    await m.getRepository(House).delete(id);
    await audit(m, actor, "DELETE", "House", id, before, null);
  });
}
