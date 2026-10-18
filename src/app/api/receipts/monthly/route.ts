import { auth } from "@/lib/auth";
import { currentMonth, getSettings } from "@/server/services/common";
import {
  blobStorageConfigured,
  ensureMonthlyReceiptArchive,
} from "@/server/services/monthly-receipts";
import * as Q from "@/server/services/queries";

export const dynamic = "force-dynamic";

function parseMonth(raw: string | null): string | null {
  return raw?.match(/^\d{4}-\d{2}$/)?.[0] ?? null;
}

export async function GET(req: Request) {
  if (!(await auth())?.user) return new Response("Unauthorized", { status: 401 });
  if (!blobStorageConfigured()) {
    return new Response("Blob storage is not configured (set BLOB_READ_WRITE_TOKEN).", { status: 503 });
  }

  const sp = new URL(req.url).searchParams;
  const month = parseMonth(sp.get("month")) ?? currentMonth();
  const refresh = sp.get("refresh") === "1";

  const [settings, rows] = await Promise.all([getSettings(), Q.monthlyReceiptRows(month)]);
  try {
    const { html } = await ensureMonthlyReceiptArchive(month, settings, rows, refresh);
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="rent-receipts-${month}.html"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate receipts";
    return new Response(message, { status: 500 });
  }
}
