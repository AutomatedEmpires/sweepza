import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getWinnerPostById } from "@/lib/db/winner-moderation";
import { winnerModerationSchema } from "@/lib/winner-moderation-schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

  if (!authUser.appUser.is_admin && !authUser.appUser.is_owner) {
    return NextResponse.json(
      { error: "Admin or owner access required." },
      { status: 403 },
    );
  }

  const parsed = winnerModerationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { winnerPostId, action } = parsed.data;

  const post = await getWinnerPostById(winnerPostId);
  if (!post) {
    return NextResponse.json({ error: "Winner post not found." }, { status: 404 });
  }

  const reviewStatus =
    action === "approve"
      ? "published"
      : action === "reject"
        ? "rejected"
        : "hidden";

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("winner_post")
    .update({ review_status: reviewStatus })
    .eq("id", winnerPostId)
    .select("id, review_status")
    .single<{ id: string; review_status: string }>();

  if (error) {
    return NextResponse.json(
      { error: `Winner moderation update failed: ${error.message}` },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, action, winnerPost: data });
}
