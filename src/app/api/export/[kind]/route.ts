import { requireUser } from "@/lib/session";
import { toCsv } from "@/lib/csv";
import * as A from "@/server/services/analytics";
import * as Q from "@/server/services/queries";
import { currentMonth, today } from "@/server/services/common";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await requireUser();
  const { kind } = await params;
  const sp = new URL(req.url).searchParams;
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const year = num("year") ?? Number(today().slice(0, 4));
  let rows: Record<string, unknown>[];
  switch (kind) {
    case "payments":
      rows = (await Q.paymentsLedger(user, {
        from: sp.get("from") || undefined, to: sp.get("to") || undefined, method: sp.get("method") || undefined,
        tenantId: num("tenantId"), roomId: num("roomId"),
      })).map((p) => ({ date: p.paidOn, room: p.roomNumber, tenant: p.tenantName, method: p.method, amount: p.amount, reference: p.referenceNo, months: p.months, note: p.note }));
      break;
    case "expenses":
      rows = (await Q.expensesList(user, { month: sp.get("month") || undefined, categoryId: num("categoryId") }))
        .map((e) => ({ date: e.date, billMonth: e.billMonth, category: e.category, vendor: e.vendor, billNo: e.billNo, amount: e.amount, method: e.paymentMethod, building: e.houseName, room: e.roomNumber, note: e.note }));
      break;
    case "pnl": rows = await Q.pnlByMonth(user, year); break;
    case "roomwise": rows = await Q.roomWise(user, year); break;
    case "defaulters":
      rows = (await Q.defaulters(user)).map((r) => ({ room: r.roomNumber, tenant: r.name, phone: r.phone, owed: r.owed, oldestDue: r.oldestDue, daysOverdue: r.daysOverdue }));
      break;
    case "analytics-summary": {
      const f = analyticsFilterFrom(sp);
      const s = await A.analyticsSummary(user, f);
      rows = [{ from: f.from, to: f.to, ...s }];
      break;
    }
    case "revenue-by-house":
      rows = await A.revenueByHouse(user, analyticsFilterFrom(sp));
      break;
    case "room-performance":
      rows = await A.roomPerformance(user, analyticsFilterFrom(sp)) as unknown as Record<string, unknown>[];
      break;
    default: return new Response("Not found", { status: 404 });
  }
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-${today()}.csv"` },
  });
}

function analyticsFilterFrom(sp: URLSearchParams): A.AnalyticsFilter {
  const month = sp.get("month")?.match(/^\d{4}-\d{2}$/)?.[0] ?? currentMonth();
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const rentalType = sp.get("rentalType");
  return A.monthFilter(month, {
    locationId: num("locationId"),
    houseId: num("houseId"),
    rentalType: rentalType === "MONTHLY" || rentalType === "DAILY" ? rentalType : undefined,
  });
}
