import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import {
  getSeekerStateSnapshotForAppUser,
  updateSeekerState,
} from "@/lib/db/seeker-state";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({
  listingId: z.string().uuid(),
  primaryUiState: z
    .enum(["none", "saved", "entered", "skipped", "won"])
    .optional(),
  saved: z.boolean().optional(),
});

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Clerk is not configured for this environment." },
      { status: 503 },
    );
  }

  const user = await ensureCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getSeekerStateSnapshotForAppUser(user.appUserId);
  return NextResponse.json({ data: snapshot });
}

export async function POST(request: Request) {
  const { ok, retryAfterSec } = rateLimit(clientKey(request), {
    namespace: "seeker-state",
    limit: 60,
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

  const user = await ensureCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await updateSeekerState({
    appUserId: user.appUserId,
    listingId: parsed.data.listingId,
    primaryUiState: parsed.data.primaryUiState,
    saved: parsed.data.saved,
  });

  const snapshot = await getSeekerStateSnapshotForAppUser(user.appUserId);
  return NextResponse.json({ ok: true, data: snapshot });
}
