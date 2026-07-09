import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { toggleWinnerReaction } from "@/lib/db/winners";
import { REACTION_TYPES, type ReactionType } from "@/lib/db/enums";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const reactionSchema = z.object({
  reactionType: z.enum(REACTION_TYPES),
});

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ winnerPostId: string }> },
) {
  const { ok, retryAfterSec } = rateLimit(clientKey(request), {
    limit: 20,
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
      { error: "Clerk is not configured for this environment." },
      { status: 503 },
    );
  }

  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { winnerPostId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const reactions = await toggleWinnerReaction({
    winnerPostId,
    appUserId: authUser.appUserId,
    reactionType: parsed.data.reactionType as ReactionType,
  });

  return NextResponse.json({ ok: true, reactions });
}
