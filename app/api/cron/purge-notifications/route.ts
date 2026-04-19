import { NextResponse } from "next/server";
import { purgeNotificationsOlderThanRetention } from "@/lib/notifications";

/**
 * Daily retention job (spec 0006 §7). Schedule via your host (e.g. Vercel Cron)
 * GET /api/cron/purge-notifications with header Authorization: Bearer CRON_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { deleted } = await purgeNotificationsOlderThanRetention();
  return NextResponse.json({ ok: true, deleted });
}
