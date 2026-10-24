import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import bcrypt from "bcryptjs";
import type { EntityManager } from "typeorm";
import { getDb } from "./db/data-source";
import {
  ExpenseCategory, Floor, House, Location, Organization, Room, RoomRentHistory, Setting, User, UserHouse,
  type RentalType,
} from "./entities/core";
import { DEFAULT_CATEGORIES } from "./services/expenses";

// Optional demo data (SEED_DEMO=1): two buildings in two locations, mixing monthly and daily rooms.
const DEMO: { location: string; house: string; rooms: [string, RentalType, number][] }[] = [
  {
    location: "Kazhakuttom", house: "Kazhakuttom Residency",
    rooms: [["101", "MONTHLY", 6500], ["102", "MONTHLY", 6500], ["201", "MONTHLY", 7000], ["202", "DAILY", 1200], ["203", "DAILY", 1200]],
  },
  {
    location: "Kulathoor", house: "Kulathoor Heights",
    rooms: [["101", "MONTHLY", 5500], ["102", "MONTHLY", 5500], ["103", "DAILY", 1000], ["201", "DAILY", 1000], ["202", "DAILY", 1100], ["203", "MONTHLY", 6000], ["204", "MONTHLY", 6000]],
  },
];

async function addDemo(m: EntityManager, orgId: number) {
  const houseIds: number[] = [];
  for (const d of DEMO) {
    let location = await m.getRepository(Location).findOneBy({ orgId, name: d.location });
    if (!location) location = await m.getRepository(Location).save({ orgId, name: d.location, notes: null });
    let house = await m.getRepository(House).findOneBy({ orgId, name: d.house });
    if (!house) house = await m.getRepository(House).save({ orgId, locationId: location.id, name: d.house, address: null, active: true });
    houseIds.push(house.id);
    for (const number of [1, 2]) {
      if (!(await m.getRepository(Floor).countBy({ houseId: house.id, number }))) {
        await m.getRepository(Floor).insert({ houseId: house.id, number, name: `Floor ${number}` });
      }
    }
    const floors = await m.getRepository(Floor).findBy({ houseId: house.id });
    for (const [number, rentalType, rent] of d.rooms) {
      if (await m.getRepository(Room).countBy({ houseId: house.id, number })) continue;
      const floorId = floors.find((f) => f.number === Number(number[0]))!.id;
      const res = await m.getRepository(Room).insert({
        number, floorId, houseId: house.id, rentalType, currentRent: rent, status: "VACANT", notes: null,
      });
      await m.getRepository(RoomRentHistory).insert({ roomId: res.identifiers[0].id, rentalType, rent, effectiveFrom: "2000-01-01" });
    }
  }
  return houseIds;
}

async function main() {
  const db = await getDb();
  const email = (process.env.ADMIN_EMAIL ?? "owner@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  await db.transaction(async (m) => {
    let owner = await m.getRepository(User).findOneBy({ email });
    let orgId: number;
    if (owner) {
      orgId = owner.orgId;
    } else {
      if (!password) throw new Error("Set ADMIN_PASSWORD to create the first owner");
      const org = await m.getRepository(Organization).insert({ name: "My Rentals" });
      orgId = org.identifiers[0].id as number;
      await m.getRepository(User).insert({
        orgId, name: "Owner", email, passwordHash: await bcrypt.hash(password, 10), role: "OWNER", active: true,
      });
      await m.getRepository(ExpenseCategory).insert(DEFAULT_CATEGORIES.map((name) => ({ orgId, name })));
      const defaults = { propertyName: "My Rentals", propertyAddress: "", dueDay: "5", prorate: "true" };
      for (const [key, value] of Object.entries(defaults)) await m.getRepository(Setting).insert({ orgId, key, value });
    }
    if (process.env.SEED_DEMO === "1") {
      const houseIds = await addDemo(m, orgId);
      const managerEmail = "manager@example.com";
      if (!(await m.getRepository(User).countBy({ email: managerEmail }))) {
        const res = await m.getRepository(User).insert({
          orgId, name: "Demo Manager", email: managerEmail, passwordHash: await bcrypt.hash(password ?? "password123", 10), role: "MANAGER", active: true,
        });
        await m.getRepository(UserHouse).insert({ userId: res.identifiers[0].id as number, houseId: houseIds[1] });
      }
    }
  });
  const [{ n }] = await db.query(`SELECT COUNT(*)::int AS n FROM rooms`);
  console.log(`Seed complete — ${n} rooms.`);
  await db.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
