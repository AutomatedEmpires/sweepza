import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { createReport } from "@/lib/db/reports";
import { REPORT_REASONS, REPORT_TARGET_TYPES } from "@/lib/db/enums";

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().uuid(),
  reasonCode: z.enum(REPORT_REASONS),
  details: z.string().max(500).trim().optional(),
});

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

  const parsed = reportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const report = await createReport({
    reporterUserId: authUser.appUserId,
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    reasonCode: parsed.data.reasonCode,
    details: parsed.data.details,
  });

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    status: report.status,
  });
}
