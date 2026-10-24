// Integration tests against a real Postgres (migrated). Skipped unless TEST_DATABASE_URL is set:
//   TEST_DATABASE_URL=postgres://… pnpm migration:run   (with DATABASE_URL pointing at the same DB)
//   TEST_DATABASE_URL=postgres://… pnpm test
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("multi-tenancy and building scoping", () => {
  let S: typeof import("./properties");
  let R: typeof import("./rooms");
  let St: typeof import("./stays");
  let E: typeof import("./expenses");
  let Q: typeof import("./queries");
  let An: typeof import("./analytics");
  let T: typeof import("./tenants");
  let B: typeof import("./billing");
  let Cm: typeof import("./common");
  let db: import("typeorm").DataSource;

  const run = Math.random().toString(36).slice(2, 8);
  let alice: import("./common").Actor; // owner of org A
  let bob: import("./common").Actor; // owner of org B
  let mgr: import("./common").Actor; // manager of org A, assigned only to house A1
  let a1: number, a2: number, b1: number;
  let dailyA1: number, monthlyA2: number, roomB1: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    [S, R, St, E, Q, An, T, B, Cm] = await Promise.all([
      import("./properties"), import("./rooms"), import("./stays"), import("./expenses"),
      import("./queries"), import("./analytics"), import("./tenants"), import("./billing"), import("./common"),
    ]);
    db = await (await import("../db/data-source")).getDb();

    await E.registerOrganization({ orgName: `A-${run}`, name: "Alice", email: `alice-${run}@t.dev`, password: "password123" });
    await E.registerOrganization({ orgName: `B-${run}`, name: "Bob", email: `bob-${run}@t.dev`, password: "password123" });
    const owner = async (email: string, role: "OWNER" | "MANAGER" = "OWNER"): Promise<import("./common").Actor> => {
      const [u] = await db.query(`SELECT id, name, "orgId", role FROM users WHERE email = $1`, [email]);
      return { id: u.id, name: u.name, orgId: u.orgId, role, houseIds: [] };
    };
    alice = await owner(`alice-${run}@t.dev`);
    bob = await owner(`bob-${run}@t.dev`);
    const refresh = async (a: import("./common").Actor) => {
      const rows = await db.query(`SELECT id FROM houses WHERE "orgId" = $1`, [a.orgId]);
      a.houseIds = rows.map((r: { id: number }) => r.id);
    };

    const mkHouse = async (a: import("./common").Actor, loc: string, name: string) => {
      await S.addLocation(a, { name: loc });
      const [l] = await db.query(`SELECT id FROM locations WHERE "orgId" = $1 AND name = $2`, [a.orgId, loc]);
      await S.addHouse(a, { locationId: l.id, name });
      await refresh(a);
      return a.houseIds[a.houseIds.length - 1];
    };
    a1 = await mkHouse(alice, "Kazhakuttom", "A1");
    a2 = await mkHouse(alice, "Kulathoor", "A2");
    b1 = await mkHouse(bob, "Elsewhere", "B1");

    const mkRoom = async (a: import("./common").Actor, houseId: number, number: string, rentalType: "DAILY" | "MONTHLY", rent: number) => {
      await R.addFloor(a, { houseId, number: 1, name: "Floor 1" });
      const [f] = await db.query(`SELECT id FROM floors WHERE "houseId" = $1`, [houseId]);
      await R.addRoom(a, { number, floorId: f.id, rentalType, rent });
      const [r] = await db.query(`SELECT id FROM rooms WHERE "houseId" = $1 AND number = $2`, [houseId, number]);
      return r.id as number;
    };
    dailyA1 = await mkRoom(alice, a1, "D1", "DAILY", 1000);
    monthlyA2 = await mkRoom(alice, a2, "M1", "MONTHLY", 5000);
    roomB1 = await mkRoom(bob, b1, "X1", "DAILY", 900);

    const [m] = await db.query(`SELECT id, name, "orgId" FROM users WHERE email = $1`, [`alice-${run}@t.dev`]);
    await E.createUser(alice, { name: "Manu", email: `mgr-${run}@t.dev`, password: "password123", role: "MANAGER", houseIds: [a1] });
    const [mu] = await db.query(`SELECT id FROM users WHERE email = $1`, [`mgr-${run}@t.dev`]);
    mgr = { id: mu.id, name: "Manu", orgId: m.orgId, role: "MANAGER", houseIds: [a1] };
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("owners only see their own organization's buildings", async () => {
    expect((await Q.listHouses(alice)).map((h: { id: number }) => h.id).sort()).toEqual([a1, a2].sort());
    expect((await Q.listHouses(bob)).map((h: { id: number }) => h.id)).toEqual([b1]);
    expect((await Q.listRooms(alice)).some((r) => r.id === roomB1)).toBe(false);
  });

  it("another organization's ids behave as not found", async () => {
    await expect(St.checkInStay(alice, { roomId: roomB1, guestName: "Eve", checkIn: "2026-01-01", checkOut: "2026-01-03" })).rejects.toThrow(/not found/);
    await expect(R.updateRoom(alice, roomB1, { number: "hack", floorId: 1 })).rejects.toThrow(/not found/);
    await expect(E.saveExpense(alice, null, { houseId: b1, categoryId: 1, amount: 1, date: "2026-01-01", billMonth: "2026-01" })).rejects.toThrow(/not found/);
    expect(await Q.roomCalendar(alice, roomB1, "2026-01")).toBeNull();
  });

  it("managers only see their assigned buildings", async () => {
    expect((await Q.listHouses(mgr)).map((h: { id: number }) => h.id)).toEqual([a1]);
    const rooms = await Q.listRooms(mgr);
    expect(rooms.every((r) => r.houseId === a1)).toBe(true);
    await expect(R.addFloor(mgr, { houseId: a2, number: 9, name: "nope" })).rejects.toThrow(/not found/);
    expect(await Q.roomCalendar(mgr, monthlyA2, "2026-01")).toBeNull();
    const k = await Q.kpis(mgr, "2026-01", a2); // asking for a house they can't see yields nothing
    expect(k.totalRooms).toBe(0);
  });

  it("assigning buildings is limited to the owner's own", async () => {
    await expect(S.setUserHouses(alice, mgr.id!, [b1])).rejects.toThrow(/not found/);
    await S.setUserHouses(alice, mgr.id!, [a1, a2]);
    await S.setUserHouses(alice, mgr.id!, [a1]);
    await expect(S.setUserHouses(bob, mgr.id!, [b1])).rejects.toThrow(/User not found/);
  });

  it("daily bookings cannot overlap; check-out day is free", async () => {
    await St.checkInStay(alice, { roomId: dailyA1, guestName: "G1", checkIn: "2030-03-10", checkOut: "2030-03-13" });
    await expect(St.checkInStay(alice, { roomId: dailyA1, guestName: "G2", checkIn: "2030-03-12", checkOut: "2030-03-14" })).rejects.toThrow(/overlap/);
    await expect(St.checkInStay(alice, { roomId: dailyA1, guestName: "G2", checkIn: "2030-03-09", checkOut: "2030-03-11" })).rejects.toThrow(/overlap/);
    await St.checkInStay(alice, { roomId: dailyA1, guestName: "G3", checkIn: "2030-03-13", checkOut: "2030-03-15" }); // arrives on G1's check-out day
    await expect(St.checkInStay(alice, { roomId: dailyA1, guestName: "G4", checkIn: "2030-04-01" })).rejects.toThrow(/check-out date/);
  });

  it("past-dated stays are history and don't occupy the room", async () => {
    const id = await St.checkInStay(alice, { roomId: dailyA1, guestName: "Old", checkIn: "2020-01-01", checkOut: "2020-01-04" });
    const [row] = await db.query(`SELECT status FROM stays WHERE id = $1`, [id]);
    expect(row.status).toBe("ENDED");
    const [room] = await db.query(`SELECT status FROM rooms WHERE id = $1`, [dailyA1]);
    expect(room.status).toBe("VACANT");
    const future = await St.checkInStay(alice, { roomId: dailyA1, guestName: "Soon", checkIn: "2031-01-01", checkOut: "2031-01-03" });
    const [f] = await db.query(`SELECT status FROM stays WHERE id = $1`, [future]);
    expect(f.status).toBe("BOOKED");
  });

  it("calendar counts occupied and vacant nights", async () => {
    const cal = await Q.roomCalendar(alice, dailyA1, "2030-03");
    expect(cal!.days).toBe(31);
    expect(cal!.occupied).toBe(5); // 10,11,12 + 13,14
    expect(cal!.vacant).toBe(26);
  });

  it("expenses are per building and roll up per building", async () => {
    const [cat] = await Q.listCategories(alice);
    await E.saveExpense(alice, null, { houseId: a1, categoryId: cat.id, amount: 700, date: "2030-03-05", billMonth: "2030-03" });
    await E.saveExpense(alice, null, { houseId: a2, categoryId: cat.id, amount: 300, date: "2030-03-06", billMonth: "2030-03" });
    const f = An.monthFilter("2030-03");
    expect((await An.analyticsSummary(alice, f)).expenses).toBe(1000);
    expect((await An.analyticsSummary(alice, { ...f, houseId: a1 })).expenses).toBe(700);
    expect((await An.analyticsSummary(mgr, f)).expenses).toBe(700); // manager sees only A1
    expect((await An.analyticsSummary(bob, f)).expenses).toBe(0);
    const [catB] = await Q.listCategories(bob);
    await expect(E.saveExpense(alice, null, { houseId: a1, categoryId: catB.id, amount: 5, date: "2030-03-05", billMonth: "2030-03" })).rejects.toThrow(/Category not found/);
  });

  it("monthly rent and payments stay inside the organization", async () => {
    await T.createTenant(alice, { houseId: a2, name: "Tess" });
    const [tenant] = await db.query(`SELECT id FROM tenants WHERE "houseId" = $1`, [a2]);
    await T.checkIn(alice, { tenantId: tenant.id, roomId: monthlyA2, startDate: "2030-03-01", securityDeposit: 0 });
    const [y] = await db.query(`SELECT id FROM tenancies WHERE "roomId" = $1`, [monthlyA2]);
    await expect(B.recordPayment(bob, { tenancyId: y.id, amount: 100, paidOn: "2030-03-02", method: "CASH" })).rejects.toThrow(/not found/);
    await expect(B.recordPayment(mgr, { tenancyId: y.id, amount: 100, paidOn: "2030-03-02", method: "CASH" })).rejects.toThrow(/not found/);
    await B.recordPayment(alice, { tenancyId: y.id, amount: 100, paidOn: "2030-03-02", method: "CASH" });
    expect((await Q.paymentsLedger(bob, {})).length).toBe(0);
    expect((await Q.paymentsLedger(mgr, {})).length).toBe(0);
    expect((await Q.paymentsLedger(alice, {})).length).toBe(1);
    expect(await Q.tenantDetail(bob, tenant.id)).toBeNull();
    expect((await Q.tenantsList(mgr)).length).toBe(0);
  });

  it("analytics queries run for every filter combination", async () => {
    const f = An.monthFilter("2030-03", { houseId: a1 });
    const o = await An.occupancyStats(alice, f);
    expect(o.dailyRoomNightsAvailable).toBe(31); // one daily room in A1
    expect(o.monthlyTotal).toBe(0);
    expect(o.dailyRoomNightsSold).toBe(5); // G1 (10–12) + G3 (13–14); rooms/dates without stays count as unsold
    expect((await An.occupancyStats(alice, An.monthFilter("2030-03", { rentalType: "MONTHLY" }))).monthlyTotal).toBe(1);
    await An.roomPerformance(alice, f); await An.revenueByHouse(alice, f); await An.unpaidStays(alice, f);
    await An.defaultersScoped(alice, f); await An.expensesByCategoryScoped(alice, f); await An.revenueTrendMonths(alice, f, 12);
  });

  it("charge generation is per organization", async () => {
    const created = await B.ensureCharges(bob.orgId);
    expect(created).toBe(0);
    expect(Cm.isOwner(mgr)).toBe(false);
  });
});
