import { requireUser } from "@/lib/session";
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
  // The archive is one org-wide file, so only the owner (who sees every building) may fetch it.
  const user = await requireUser();
  if (user.role !== "OWNER") return new Response("Only the owner can download the receipt archive", { status: 403 });
  if (!blobStorageConfigured()) {
    return new Response("Blob storage is not configured (set BLOB_READ_WRITE_TOKEN).", { status: 503 });
  }

  const sp = new URL(req.url).searchParams;
  const month = parseMonth(sp.get("month")) ?? currentMonth();
  const refresh = sp.get("refresh") === "1";

  const [settings, rows] = await Promise.all([getSettings(user.orgId), Q.monthlyReceiptRows(user, month)]);
  try {
    const { html } = await ensureMonthlyReceiptArchive(user.orgId, month, settings, rows, refresh);
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
