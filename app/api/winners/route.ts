import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WinnerPostRow } from "@/lib/db/types";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { winnerSubmissionSchema } from "@/lib/winner-submission-schema";

// NOTE: Clerk auth wiring is Lane B. For now we require an access token header.
function getAccessToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const [type, token] = auth.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function POST(req: Request) {
  try {
    const { ok, retryAfterSec } = rateLimit(clientKey(req), {
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

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = winnerSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient(accessToken);

    const { data, error } = await supabase
      .from("winner_post")
      .insert({
        listing_id: parsed.data.listingId ?? null,
        photo_url: parsed.data.photoUrl ?? null,
        caption: parsed.data.caption ?? null,
        review_status: "submitted",
      })
      .select("*")
      .single<WinnerPostRow>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
