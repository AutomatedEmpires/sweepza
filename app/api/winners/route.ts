import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WinnerPostRow } from "@/lib/db/types";

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
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await req.json()) as {
      listingId?: string;
      photoUrl?: string;
      caption?: string;
    };

    const supabase = createServerSupabaseClient(accessToken);

    const { data, error } = await supabase
      .from("winner_post")
      .insert({
        listing_id: body.listingId ?? null,
        photo_url: body.photoUrl ?? null,
        caption: body.caption ?? null,
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
