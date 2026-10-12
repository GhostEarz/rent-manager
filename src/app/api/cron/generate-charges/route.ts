import { ensureCharges } from "@/server/services/billing";

export const dynamic = "force-dynamic";

// Called by Vercel Cron (GET + Bearer CRON_SECRET) or any scheduler (POST + same header).
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const created = await ensureCharges();
  return Response.json({ created });
}
export const GET = handle;
export const POST = handle;
