import { get, put } from "@vercel/blob";
import { getDb } from "../db/data-source";
import { Setting } from "../entities/core";
import type { AppSettings } from "./common";
import { buildMonthlyReceiptsHtml } from "./monthly-receipt-html";
import type { MonthlyReceiptRow } from "./queries";

const SETTING_PREFIX = "monthlyReceiptBlob:";

export interface MonthlyReceiptArchive {
  url: string;
  pathname: string;
  generatedAt: string;
}

export function monthlyReceiptSettingKey(month: string) {
  return `${SETTING_PREFIX}${month}`;
}

export function blobStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function getMonthlyReceiptArchive(month: string): Promise<MonthlyReceiptArchive | null> {
  const db = await getDb();
  const row = await db.getRepository(Setting).findOneBy({ key: monthlyReceiptSettingKey(month) });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as MonthlyReceiptArchive;
  } catch {
    return null;
  }
}

async function saveMonthlyReceiptArchive(month: string, archive: MonthlyReceiptArchive) {
  const db = await getDb();
  await db.getRepository(Setting).save({ key: monthlyReceiptSettingKey(month), value: JSON.stringify(archive) });
}

export async function uploadMonthlyReceiptsHtml(month: string, html: string): Promise<MonthlyReceiptArchive> {
  if (!blobStorageConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const pathname = `rent-receipts/${month}.html`;
  const blob = await put(pathname, html, {
    access: "private",
    contentType: "text/html; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  const archive: MonthlyReceiptArchive = {
    url: blob.url,
    pathname: blob.pathname,
    generatedAt: new Date().toISOString(),
  };
  await saveMonthlyReceiptArchive(month, archive);
  return archive;
}

export async function fetchMonthlyReceiptHtml(archive: MonthlyReceiptArchive): Promise<string | null> {
  const result = await get(archive.url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}

export async function ensureMonthlyReceiptArchive(
  month: string,
  settings: AppSettings,
  rows: MonthlyReceiptRow[],
  refresh = false,
): Promise<{ html: string; archive: MonthlyReceiptArchive }> {
  if (!refresh) {
    const existing = await getMonthlyReceiptArchive(month);
    if (existing) {
      const html = await fetchMonthlyReceiptHtml(existing);
      if (html) return { html, archive: existing };
    }
  }
  const generatedAt = new Date().toISOString();
  const html = buildMonthlyReceiptsHtml(settings, month, rows, generatedAt);
  const archive = await uploadMonthlyReceiptsHtml(month, html);
  return { html, archive };
}
