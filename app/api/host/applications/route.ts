import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { submitHostApplication } from "@/lib/db/host-applications";
import { hostApplicationSchema } from "@/lib/host-application-schema";
import { clientKey, rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { ok, retryAfterSec } = await rateLimitShared(clientKey(request), {
    namespace: "host-applications",
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many host applications. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  if (!isClerkConfigured()) {
    return NextResponse.json({ error: "Host applications are unavailable." }, { status: 503 });
  }
  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authUser.appUser.is_host) {
    return NextResponse.json({ error: "This account already has host access." }, { status: 409 });
  }

  const parsed = hostApplicationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Review the application fields and try again.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const application = await submitHostApplication({
      appUserId: authUser.appUserId,
      input: parsed.data,
    });
    return NextResponse.json(
      { id: application.id, status: application.status },
      { status: 201 },
    );
  } catch (error) {
    Sentry.captureException(error);
    const conflict = error instanceof Error && error.message.includes("already active");
    return NextResponse.json(
      { error: conflict ? error.message : "The application could not be submitted." },
      { status: conflict ? 409 : 500 },
    );
  }
}
