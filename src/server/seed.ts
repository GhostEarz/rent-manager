import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import bcrypt from "bcryptjs";
import { getDb } from "./db/data-source";
import { ExpenseCategory, Floor, House, Location, Room, RoomRentHistory, Setting, User } from "./entities/core";

// Placeholder split of the rent tiers: 6 × 6500, 5 × 7000, 2 × 8000. Re-assign in the Rooms page.
const ROOMS: [string, number, number][] = [
  ["101", 1, 6500], ["102", 1, 6500], ["103", 1, 6500], ["104", 1, 6500], ["105", 1, 6500], ["106", 1, 6500],
  ["107", 1, 7000],
  ["201", 2, 7000], ["202", 2, 7000], ["203", 2, 7000], ["204", 2, 7000],
  ["205", 2, 8000], ["206", 2, 8000],
];
const CATEGORIES = ["KSEB (Electricity)", "WiFi", "Water", "Maintenance", "Cleaning", "Property Tax", "Other"];

async function main() {
  const db = await getDb();
  await db.transaction(async (m) => {
    let location = await m.getRepository(Location).findOneBy({ name: "My Building" });
    if (!location) {
      const res = await m.getRepository(Location).insert({ name: "My Building", notes: null });
      location = { id: res.identifiers[0].id as number, name: "My Building", notes: null };
    }
    let house = await m.getRepository(House).findOneBy({ locationId: location.id });
    if (!house) {
      const res = await m.getRepository(House).insert({ locationId: location.id, name: "My Building", address: null, active: true });
      house = { id: res.identifiers[0].id as number, locationId: location.id, name: "My Building", address: null, active: true } as House;
    }
    const houseId = house.id;

    for (const [number, name] of [[1, "Floor 1"], [2, "Floor 2"]] as const) {
      if (!(await m.getRepository(Floor).countBy({ houseId, number }))) await m.getRepository(Floor).insert({ houseId, number, name });
    }
    const floors = await m.getRepository(Floor).findBy({ houseId });
    for (const [number, fl, rent] of ROOMS) {
      if (await m.getRepository(Room).countBy({ houseId, number })) continue;
      const floorId = floors.find((f) => f.number === fl)!.id;
      const res = await m.getRepository(Room).insert({
        number, floorId, houseId, rentalType: "MONTHLY", currentRent: rent, status: "VACANT", notes: null,
      });
      await m.getRepository(RoomRentHistory).insert({
        roomId: res.identifiers[0].id, rentalType: "MONTHLY", rent, effectiveFrom: "2000-01-01",
      });
    }
    for (const name of CATEGORIES) {
      if (!(await m.getRepository(ExpenseCategory).countBy({ name }))) await m.getRepository(ExpenseCategory).insert({ name });
    }
    const defaults = { propertyName: "My Building", propertyAddress: "", dueDay: "5", prorate: "true" };
    for (const [key, value] of Object.entries(defaults)) {
      if (!(await m.getRepository(Setting).countBy({ key }))) await m.getRepository(Setting).insert({ key, value });
    }
    const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
    if (!(await m.getRepository(User).countBy({ email }))) {
      const password = process.env.ADMIN_PASSWORD;
      if (!password) throw new Error("Set ADMIN_PASSWORD to create the first admin");
      await m.getRepository(User).insert({
        name: "Admin", email, passwordHash: await bcrypt.hash(password, 10), role: "ADMIN", active: true,
      });
    }
  });
  const [{ n }] = await db.query(`SELECT COUNT(*)::int AS n FROM rooms`);
  console.log(`Seed complete — ${n} rooms.`);
  await db.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
