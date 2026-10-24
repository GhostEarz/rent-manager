import type { EntityManager } from "typeorm";
import { getDb } from "../db/data-source";
import { AuditLog, Setting, type Role } from "../entities/core";

/**
 * The signed-in user as services see them. `houseIds` is the complete set of houses this user may
 * touch — every house in the organization for an OWNER, only the assigned ones for a MANAGER.
 * Every read and write goes through it, so tenant (org) isolation and manager scoping live in one place.
 */
export interface Actor {
  id: number | null;
  name: string;
  orgId: number;
  role: Role;
  houseIds: number[];
}

export const isOwner = (a: Actor) => a.role === "OWNER";

export function assertHouse(a: Actor, houseId: number) {
  if (!a.houseIds.includes(houseId)) throw new Error("You don't have access to that building");
}

/** House ids a query may touch: the actor's, optionally narrowed to one house they can see. */
export function scopeHouses(a: Actor, houseId?: number | null): number[] {
  if (!houseId) return a.houseIds;
  return a.houseIds.includes(houseId) ? [houseId] : [];
}

/** Today's date in India (the property's timezone), as YYYY-MM-DD. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
export const currentMonth = () => today().slice(0, 7);

export async function audit(
  m: EntityManager,
  actor: Actor,
  action: string,
  entity: string,
  entityId: number | string | null,
  before: unknown,
  after: unknown,
) {
  await m.getRepository(AuditLog).insert({
    orgId: actor.orgId,
    userId: actor.id,
    userName: actor.name,
    action,
    entity,
    entityId: entityId == null ? null : String(entityId),
    before: (before ?? null) as never,
    after: (after ?? null) as never,
  });
}

export interface AppSettings {
  propertyName: string;
  propertyAddress: string;
  dueDay: number;
  prorate: boolean;
}

const DEFAULTS: AppSettings = { propertyName: "My Building", propertyAddress: "", dueDay: 5, prorate: true };

export async function getSettings(orgId: number): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getRepository(Setting).findBy({ orgId });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    propertyName: map.propertyName ?? DEFAULTS.propertyName,
    propertyAddress: map.propertyAddress ?? DEFAULTS.propertyAddress,
    dueDay: map.dueDay ? Number(map.dueDay) : DEFAULTS.dueDay,
    prorate: map.prorate ? map.prorate === "true" : DEFAULTS.prorate,
  };
}

export async function saveSettings(actor: Actor, s: AppSettings) {
  const db = await getDb();
  await db.transaction(async (m) => {
    const before = await getSettings(actor.orgId);
    for (const [key, value] of Object.entries(s)) {
      await m.getRepository(Setting).save({ orgId: actor.orgId, key, value: String(value) });
    }
    await audit(m, actor, "UPDATE", "Settings", null, before, s);
  });
}
