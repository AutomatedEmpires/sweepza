import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { moderateWinnerPost } from "@/lib/db/winners";
import { sendWinnerNotification } from "@/lib/email/notifications";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const winnerModerationSchema = z
  .object({
    winnerPostId: z.string().uuid("A valid winner post id is required."),
    action: z.enum(["publish", "hide", "reject"]),
    verifiedWin: z.boolean().default(false),
    reviewNotes: z.string().trim().max(2000).optional(),
    verificationEvidenceUrl: z.string().trim().url().startsWith("https://").optional(),
  })
  .superRefine((value, ctx) => {
    if (["hide", "reject"].includes(value.action) && !value.reviewNotes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewNotes"],
        message: "Review notes are required for this action.",
      });
    }
    if (value.verifiedWin && !value.verificationEvidenceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verificationEvidenceUrl"],
        message: "Verified wins require an HTTPS evidence URL.",
      });
    }
  });

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

  const parsed = winnerModerationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { winnerPostId, action } = parsed.data;
  let data;
  try {
    data = await moderateWinnerPost({
      winnerPostId,
      reviewerUserId: authUser.appUserId,
      action,
      verifiedWin: action === "publish" ? parsed.data.verifiedWin : false,
      reviewNotes: parsed.data.reviewNotes,
      verificationEvidenceUrl: parsed.data.verificationEvidenceUrl,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "The winner post could not be moderated in its current state." },
      { status: 422 },
    );
  }

  const supabase = createServiceRoleClient();

  // Only a publish triggers the celebratory email; failures never block.
  if (action === "publish") {
    try {
      let listingTitle = "";
      const { data: listing } = await supabase
        .from("listing")
        .select("title")
        .eq("id", data.listing_id)
        .maybeSingle<{ title: string | null }>();
      listingTitle = listing?.title ?? "";

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
