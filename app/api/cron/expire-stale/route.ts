import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { revalidatePublicListings } from "@/lib/db/listings-cache";
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

  const { data, error } = await supabase.rpc("expire_stale_listings", {
    p_today: today,
  });
  if (error) {
    Sentry.captureException(new Error(`expire-stale transaction: ${error.message}`));
    return NextResponse.json(
      { error: "Listing expiration could not be completed." },
      { status: 500 },
    );
  }
  const expired = ((data ?? []) as Array<{ slug?: unknown }>)
    .map((row) => row.slug)
    .filter((slug): slug is string => typeof slug === "string");

  // Expired listings drop out of the active/public feed; only bust the cache
  // when at least one actually transitioned.
  if (expired.length > 0) {
    revalidatePublicListings();
  }

  return NextResponse.json({
    ok: true,
    checked: expired.length,
    expired,
    failed: [],
  });
}
