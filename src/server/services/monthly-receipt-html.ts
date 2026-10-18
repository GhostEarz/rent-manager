import { escapeHtml } from "@/lib/html";
import { fmtDate, fmtMonth, rupees } from "@/lib/format";
import type { AppSettings } from "./common";
import type { MonthlyReceiptRow } from "./queries";

function receiptBlock(settings: AppSettings, month: string, row: MonthlyReceiptRow): string {
  const lines: [string, string][] = [
    ["Tenant", row.tenantName],
    ["Room", row.roomNumber],
    ["Rent month", fmtMonth(month)],
    ["Due date", fmtDate(row.dueDate)],
    ["Rent due", rupees(row.amountDue)],
    ["Paid", rupees(row.paid)],
    ["Balance", rupees(row.balance)],
    ["Status", row.status],
  ];
  const paymentRows = row.payments.length
    ? row.payments
        .map(
          (p) =>
            `<tr><td>${escapeHtml(fmtDate(p.paidOn))}</td><td>${escapeHtml(p.method)}</td><td>${escapeHtml(p.referenceNo ?? "—")}</td><td class="num">${escapeHtml(rupees(p.amount))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">No payments recorded for this month.</td></tr>`;

  return `
    <section class="receipt">
      <header>
        <h1>${escapeHtml(settings.propertyName)}</h1>
        ${settings.propertyAddress ? `<p class="muted">${escapeHtml(settings.propertyAddress)}</p>` : ""}
        <p class="title">Monthly rent receipt #${escapeHtml(String(row.chargeId).padStart(5, "0"))}</p>
      </header>
      <dl>
        ${lines.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}
      </dl>
      <table>
        <thead><tr><th>Payment date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead>
        <tbody>${paymentRows}</tbody>
      </table>
    </section>`;
}

export function buildMonthlyReceiptsHtml(
  settings: AppSettings,
  month: string,
  rows: MonthlyReceiptRow[],
  generatedAt: string,
): string {
  const body = rows.length
    ? rows.map((row) => receiptBlock(settings, month, row)).join("\n")
    : `<section class="receipt empty"><p>No rent charges for ${escapeHtml(fmtMonth(month))}.</p></section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Rent receipts — ${escapeHtml(fmtMonth(month))}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #111; background: #f8fafc; }
    .meta { text-align: center; color: #64748b; font-size: 12px; margin-bottom: 24px; }
    .receipt { max-width: 520px; margin: 0 auto 32px; padding: 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
    .receipt.empty { text-align: center; }
    header { text-align: center; margin-bottom: 16px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .title { margin: 12px 0 0; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    .muted { color: #64748b; font-size: 12px; margin: 0; }
    dl { margin: 0 0 16px; font-size: 14px; }
    dl div { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
    dt { color: #64748b; }
    dd { margin: 0; text-align: right; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th.num, td.num { text-align: right; }
    @media print {
      body { background: #fff; padding: 0; }
      .meta { display: none; }
      .receipt { border: none; border-radius: 0; page-break-after: always; margin: 0 auto; box-shadow: none; }
      .receipt:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <p class="meta">Generated ${escapeHtml(fmtDate(generatedAt.slice(0, 10)))} · ${escapeHtml(fmtMonth(month))}</p>
  ${body}
</body>
</html>`;
}
