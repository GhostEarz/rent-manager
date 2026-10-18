import { describe, expect, it } from "vitest";
import { addMonths, allocate, chargeAmount, dueDateFor, monthRange, nightsBetween, rentForMonth, stayAmountDue, statusFor } from "./billing-core";

describe("chargeAmount (pro-rating)", () => {
  const base = { rent: 6000, endDate: null, prorate: true };
  it("full month when tenancy starts on the 1st", () => {
    expect(chargeAmount({ ...base, startDate: "2026-04-01", month: "2026-04" })).toBe(6000);
  });
  it("pro-rates first month (check-in on the 11th of a 30-day month → 20 days)", () => {
    expect(chargeAmount({ ...base, startDate: "2026-04-11", month: "2026-04" })).toBe(4000);
  });
  it("charges full rent in first month when pro-rating is off", () => {
    expect(chargeAmount({ ...base, prorate: false, startDate: "2026-04-11", month: "2026-04" })).toBe(6000);
  });
  it("pro-rates last month on move-out", () => {
    expect(chargeAmount({ ...base, startDate: "2026-01-01", endDate: "2026-04-15", month: "2026-04" })).toBe(3000);
  });
  it("returns 0 outside the tenancy", () => {
    expect(chargeAmount({ ...base, startDate: "2026-04-11", month: "2026-03" })).toBe(0);
    expect(chargeAmount({ ...base, startDate: "2026-01-01", endDate: "2026-02-10", month: "2026-03" })).toBe(0);
  });
});

describe("rentForMonth (rent change keeps past intact)", () => {
  const history = [
    { rent: 6500, effectiveFrom: "2026-01-01" },
    { rent: 7000, effectiveFrom: "2026-06-15" },
  ];
  it("uses the old rent before the effective date", () => {
    expect(rentForMonth(history, "2026-05", 0)).toBe(6500);
    expect(rentForMonth(history, "2026-06", 0)).toBe(6500); // mid-month change applies from next month
  });
  it("uses the new rent afterwards", () => {
    expect(rentForMonth(history, "2026-07", 0)).toBe(7000);
  });
  it("falls back when there is no history", () => {
    expect(rentForMonth([], "2026-07", 8000)).toBe(8000);
  });
  it("ignores DAILY history rows left over from a rental-type switch", () => {
    const mixed = [
      { rent: 6500, effectiveFrom: "2026-01-01", rentalType: "MONTHLY" },
      { rent: 600, effectiveFrom: "2026-08-01", rentalType: "DAILY" },
    ];
    expect(rentForMonth(mixed, "2026-09", 0)).toBe(6500);
  });
});

describe("nightsBetween / stayAmountDue", () => {
  it("is 0 nights for a same-day stay", () => {
    expect(nightsBetween("2026-05-01", "2026-05-01")).toBe(0);
  });
  it("counts nights as days between check-in and check-out, excluding checkout day", () => {
    expect(nightsBetween("2026-05-01", "2026-05-03")).toBe(2);
  });
  it("uses asOf for an open stay with no checkout yet", () => {
    expect(nightsBetween("2026-05-01", null, "2026-05-04")).toBe(3);
  });
  it("defaults an open stay with no asOf to 0 nights", () => {
    expect(nightsBetween("2026-05-01", null)).toBe(0);
  });
  it("multiplies rate by nights", () => {
    expect(stayAmountDue(1300, 3)).toBe(3900);
    expect(stayAmountDue(1300, 0)).toBe(0);
  });
});

describe("allocate", () => {
  const charges = [
    { id: 1, month: "2026-01", amountDue: 6500, paid: 0 },
    { id: 2, month: "2026-02", amountDue: 6500, paid: 0 },
    { id: 3, month: "2026-03", amountDue: 6500, paid: 0 },
  ];
  it("partial payment goes to the oldest charge", () => {
    expect(allocate(charges, 2000)).toEqual({ allocations: [{ chargeId: 1, amount: 2000 }], credit: 0 });
  });
  it("spills over to the next charge", () => {
    expect(allocate(charges, 8000).allocations).toEqual([
      { chargeId: 1, amount: 6500 },
      { chargeId: 2, amount: 1500 },
    ]);
  });
  it("targets a specific month first", () => {
    expect(allocate(charges, 6500, 3).allocations).toEqual([{ chargeId: 3, amount: 6500 }]);
  });
  it("keeps the remainder as advance credit", () => {
    const r = allocate(charges, 21000);
    expect(r.allocations.reduce((s, a) => s + a.amount, 0)).toBe(19500);
    expect(r.credit).toBe(1500);
  });
  it("skips already-paid charges", () => {
    const r = allocate([{ ...charges[0], paid: 6500 }, charges[1]], 1000);
    expect(r.allocations).toEqual([{ chargeId: 2, amount: 1000 }]);
  });
});

describe("helpers", () => {
  it("status", () => {
    expect(statusFor(6500, 0)).toBe("UNPAID");
    expect(statusFor(6500, 100)).toBe("PARTIAL");
    expect(statusFor(6500, 6500)).toBe("PAID");
  });
  it("months", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(monthRange("2026-11", "2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(dueDateFor("2026-02", 31)).toBe("2026-02-28");
  });
});
