import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { seekerNotificationPrefsSchema } from "@/lib/seeker-notification-prefs-schema";
import {
  getSeekerNotificationPrefs,
  saveSeekerNotificationPrefs,
} from "@/lib/db/seeker-notification-prefs";

export const dynamic = "force-dynamic";

async function requireSeeker() {
  if (!isClerkConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Clerk is not configured for this environment." },
        { status: 503 },
      ),
    } as const;
  }
  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  return { authUser } as const;
}

export async function GET() {
  const gate = await requireSeeker();
  if ("error" in gate) return gate.error;

  const prefs = await getSeekerNotificationPrefs(gate.authUser.appUserId);
  return NextResponse.json({ prefs });
}

export async function POST(request: Request) {
  const { ok, retryAfterSec } = rateLimit(clientKey(request), {
    namespace: "seeker-notification-prefs",
    limit: 20,
    windowMs: 60_000,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  const gate = await requireSeeker();
  if ("error" in gate) return gate.error;

  const parsed = seekerNotificationPrefsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await saveSeekerNotificationPrefs(gate.authUser.appUserId, parsed.data);
  return NextResponse.json({ ok: true, prefs: parsed.data });
}
