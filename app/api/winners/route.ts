import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { updateSeekerState } from "@/lib/db/seeker-state";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { winnerSubmissionSchema } from "@/lib/winner-submission-schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Clerk is not configured for this environment." },
      { status: 503 },
    );
  }

  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = winnerSubmissionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("winner_post")
    .insert({
      app_user_id: authUser.appUserId,
      listing_id: input.listingId ?? null,
      caption: input.caption,
      photo_url: input.photoUrl ?? null,
      verified_win: false,
      review_status: "submitted",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return NextResponse.json(
      { error: `Winner post insert failed: ${error.message}` },
      { status: 500 },
    );
  }

  if (input.listingId) {
    await updateSeekerState({
      appUserId: authUser.appUserId,
      listingId: input.listingId,
      primaryUiState: "won",
      saved: true,
    });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
