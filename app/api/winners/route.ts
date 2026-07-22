import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { WinnerPostRow } from "@/lib/db/types";
import { clientKey, rateLimitShared } from "@/lib/rate-limit";
import { winnerSubmissionSchema } from "@/lib/winner-submission-schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { ok, retryAfterSec } = await rateLimitShared(clientKey(req), {
      namespace: "winners",
      limit: 3,
      windowMs: 60_000,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
      );
    }

    if (!isClerkConfigured()) {
      return NextResponse.json(
        { error: "Winner submissions are unavailable in this environment." },
        { status: 503 },
      );
    }

    const authUser = await ensureCurrentAppUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = winnerSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    const { data: seekerState, error: seekerError } = await supabase
      .from("listing_seeker_state")
      .select("listing_id, entered_at, won_at")
      .eq("app_user_id", authUser.appUserId)
      .eq("listing_id", parsed.data.listingId)
      .maybeSingle<{
        listing_id: string;
        entered_at: string | null;
        won_at: string | null;
      }>();

    if (seekerError) {
      throw new Error(`winner eligibility lookup failed: ${seekerError.message}`);
    }
    if (!seekerState?.entered_at) {
      return NextResponse.json(
        { error: "Mark this sweepstakes as entered before sharing a win." },
        { status: 422 },
      );
    }

    const { data: listing, error: listingError } = await supabase
      .from("listing")
      .select("id, listing_verification_status")
      .eq("id", parsed.data.listingId)
      .maybeSingle<{ id: string; listing_verification_status: string }>();

    if (listingError) {
      throw new Error(`winner listing lookup failed: ${listingError.message}`);
    }
    if (
      !listing ||
      !["reviewed", "verified"].includes(listing.listing_verification_status)
    ) {
      return NextResponse.json(
        { error: "That listing is not eligible for the Winner Wall." },
        { status: 422 },
      );
    }

    const { data: existing, error: duplicateError } = await supabase
      .from("winner_post")
      .select("id")
      .eq("app_user_id", authUser.appUserId)
      .eq("listing_id", parsed.data.listingId)
      .in("review_status", ["submitted", "pending_review", "published"])
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (duplicateError) {
      throw new Error(`winner duplicate lookup failed: ${duplicateError.message}`);
    }
    if (existing) {
      return NextResponse.json(
        { error: "You already have a Winner Wall post for this sweepstakes." },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("winner_post")
      .insert({
        app_user_id: authUser.appUserId,
        listing_id: parsed.data.listingId,
        // Remote user-controlled images are intentionally disabled until a
        // first-party upload path can validate bytes, MIME, dimensions, and
        // storage ownership without leaking viewer IPs to third parties.
        photo_url: null,
        caption: parsed.data.caption,
        review_status: "submitted",
        verified_win: false,
      })
      .select("*")
      .single<WinnerPostRow>();

    if (error) {
      throw new Error(`winner submission insert failed: ${error.message}`);
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      { error: "We could not submit your win. Please try again." },
      { status: 500 },
    );
  }
}
