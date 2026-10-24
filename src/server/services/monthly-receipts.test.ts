import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../lib/html";
import { buildMonthlyReceiptsHtml } from "./monthly-receipt-html";
import type { MonthlyReceiptRow } from "./queries";

describe("escapeHtml", () => {
  it("escapes characters that would break HTML", () => {
    expect(escapeHtml(`Tom & "Jerry" <script>`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;script&gt;");
  });
});

describe("buildMonthlyReceiptsHtml", () => {
  const settings = { propertyName: "Sunrise PG", propertyAddress: "MG Road", dueDay: 5, prorate: true };
  const row: MonthlyReceiptRow = {
    chargeId: 12,
    tenancyId: 1,
    tenantId: 2,
    tenantName: "Asha",
    phone: null,
    roomNumber: "101",
    houseName: "Main",
    roomId: 3,
    month: "2026-04",
    amountDue: 6000,
    paid: 6000,
    balance: 0,
    status: "PAID",
    dueDate: "2026-04-05",
    payments: [{ paidOn: "2026-04-03", method: "UPI", referenceNo: "TXN1", amount: 6000 }],
  };

  it("includes tenant, room, and payment details for each receipt", () => {
    const html = buildMonthlyReceiptsHtml(settings, "2026-04", [row], "2026-04-10T10:00:00.000Z");
    expect(html).toContain("Sunrise PG");
    expect(html).toContain("Asha");
    expect(html).toContain("101");
    expect(html).toContain("₹6,000");
    expect(html).toContain("TXN1");
  });

  it("shows a friendly message when there are no charges", () => {
    const html = buildMonthlyReceiptsHtml(settings, "2026-04", [], "2026-04-10T10:00:00.000Z");
    expect(html).toContain("No rent charges");
  });
});
