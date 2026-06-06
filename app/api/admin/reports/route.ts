import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getReportById } from "@/lib/db/report-queue";
import { reportReviewSchema } from "@/lib/report-review-schema";
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

  const parsed = reportReviewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { reportId, action, resolutionNotes } = parsed.data;

  const report = await getReportById(reportId);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    assigned_admin_id: authUser.appUserId,
  };

  if (resolutionNotes !== undefined) {
    updates.resolution_notes_internal = resolutionNotes ?? null;
  }

  if (action === "open") {
    updates.status = "admin_review";
    updates.resolved_at = null;
  } else if (action === "resolve") {
    updates.status = "resolved";
    updates.resolved_at = new Date().toISOString();
  } else {
    updates.status = "dismissed";
    updates.resolved_at = new Date().toISOString();
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("report")
    .update(updates)
    .eq("id", reportId)
    .select("id, status, resolved_at")
    .single<{ id: string; status: string; resolved_at: string | null }>();

  if (error) {
    return NextResponse.json(
      { error: `Report update failed: ${error.message}` },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, action, report: data });
}
