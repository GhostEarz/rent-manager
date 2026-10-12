import { auth } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import * as Q from "@/server/services/queries";
import { today } from "@/server/services/common";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await auth())?.user) return new Response("Unauthorized", { status: 401 });
  const { kind } = await params;
  const sp = new URL(req.url).searchParams;
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const year = num("year") ?? Number(today().slice(0, 4));
  let rows: Record<string, unknown>[];
  switch (kind) {
    case "payments":
      rows = (await Q.paymentsLedger({
        from: sp.get("from") || undefined, to: sp.get("to") || undefined, method: sp.get("method") || undefined,
        tenantId: num("tenantId"), roomId: num("roomId"),
      })).map((p) => ({ date: p.paidOn, room: p.roomNumber, tenant: p.tenantName, method: p.method, amount: p.amount, reference: p.referenceNo, months: p.months, note: p.note }));
      break;
    case "expenses":
      rows = (await Q.expensesList({ month: sp.get("month") || undefined, categoryId: num("categoryId") }))
        .map((e) => ({ date: e.date, billMonth: e.billMonth, category: e.category, vendor: e.vendor, billNo: e.billNo, amount: e.amount, method: e.paymentMethod, room: e.roomNumber, note: e.note }));
      break;
    case "pnl": rows = await Q.pnlByMonth(year); break;
    case "roomwise": rows = await Q.roomWise(year); break;
    case "defaulters":
      rows = (await Q.defaulters()).map((r) => ({ room: r.roomNumber, tenant: r.name, phone: r.phone, owed: r.owed, oldestDue: r.oldestDue, daysOverdue: r.daysOverdue }));
      break;
    default: return new Response("Not found", { status: 404 });
  }
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-${today()}.csv"` },
  });
}
