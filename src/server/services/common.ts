import type { EntityManager } from "typeorm";
import { getDb } from "../db/data-source";
import { AuditLog, Setting } from "../entities/core";

export interface Actor {
  id: number | null;
  name: string;
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

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getRepository(Setting).find();
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
    const before = await getSettings();
    for (const [key, value] of Object.entries(s)) {
      await m.getRepository(Setting).save({ key, value: String(value) });
    }
    await audit(m, actor, "UPDATE", "Settings", null, before, s);
  });
}
