import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { sendWinnerNotification } from "@/lib/email/notifications";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const winnerModerationSchema = z.object({
  winnerPostId: z.string().uuid("A valid winner post id is required."),
  action: z.enum(["publish", "hide", "reject"]),
});

const REVIEW_STATUS_BY_ACTION = {
  publish: "published",
  hide: "hidden",
  reject: "rejected",
} as const;

function winnersUrl(): string {
  const base = env.NEXT_PUBLIC_APP_URL ?? "https://sweepza.com";
  return `${base.replace(/\/$/, "")}/winners`;
}

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
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("winner_post")
    .update({ review_status: REVIEW_STATUS_BY_ACTION[action] })
    .eq("id", winnerPostId)
    .select("id, app_user_id, listing_id, review_status")
    .single<{
      id: string;
      app_user_id: string;
      listing_id: string | null;
      review_status: string;
    }>();

  if (error) {
    return NextResponse.json(
      { error: `Winner moderation update failed: ${error.message}` },
      { status: 422 },
    );
  }

  // Only a publish triggers the celebratory email; failures never block.
  if (action === "publish") {
    try {
      let listingTitle = "";
      if (data.listing_id) {
        const { data: listing } = await supabase
          .from("listing")
          .select("title")
          .eq("id", data.listing_id)
          .maybeSingle<{ title: string | null }>();
        listingTitle = listing?.title ?? "";
      }

      let displayName = "there";
      const { data: appUser } = await supabase
        .from("app_user")
        .select("display_name")
        .eq("id", data.app_user_id)
        .maybeSingle<{ display_name: string | null }>();
      if (appUser?.display_name) {
        displayName = appUser.display_name;
      }

      await sendWinnerNotification({
        appUserId: data.app_user_id,
        payload: { displayName, listingTitle, winnersUrl: winnersUrl() },
      });
    } catch (notifyError) {
      // eslint-disable-next-line no-console
      console.error("winner publish notification failed", notifyError);
    }
  }

  return NextResponse.json({ ok: true, action, winnerPost: data });
}
