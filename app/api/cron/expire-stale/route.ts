import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Inventory freshness cron: transitions active listings whose end_date has
// passed to lifecycle_status 'expired' so they leave live inventory and free
// host slots. Scheduled by vercel.json crons; Vercel calls with
// `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is configured.
// Mirrors scripts/expire-stale-listings.mjs for manual/local runs.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: stale, error: findError } = await supabase
    .from("listing")
    .select("id, slug, end_date")
    .eq("lifecycle_status", "active")
    .lt("end_date", today);

  if (findError) {
    Sentry.captureException(new Error(`expire-stale lookup: ${findError.message}`));
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const expired: string[] = [];
  const failed: string[] = [];
  for (const row of stale ?? []) {
    const { error } = await supabase
      .from("listing")
      .update({ lifecycle_status: "expired" })
      .eq("id", row.id);
    if (error) {
      failed.push(row.slug);
      Sentry.captureException(
        new Error(`expire-stale update ${row.slug}: ${error.message}`),
      );
    } else {
      expired.push(row.slug);
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    checked: stale?.length ?? 0,
    expired,
    failed,
  });
}
