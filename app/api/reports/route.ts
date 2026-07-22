import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { createReport } from "@/lib/db/reports";
import { REPORT_REASONS, REPORT_TARGET_TYPES } from "@/lib/db/enums";
import { clientKey, rateLimitShared } from "@/lib/rate-limit";

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().uuid(),
  reasonCode: z.enum(REPORT_REASONS),
  details: z.string().max(500).trim().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { ok, retryAfterSec } = await rateLimitShared(clientKey(request), {
    namespace: "reports",
    limit: 5,
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

  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let report;
  try {
    report = await createReport({
      reporterUserId: authUser.appUserId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reasonCode: parsed.data.reasonCode,
      details: parsed.data.details,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "The report target is unavailable or could not be submitted." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    status: report.status,
    created: report.created,
  });
}
