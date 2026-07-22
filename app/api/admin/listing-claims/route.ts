import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/admin-guard";
import { ensureCurrentAppUser } from "@/lib/auth";
import { reviewListingClaim } from "@/lib/db/listing-claims";

const schema = z.object({
  claimId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reviewNotes: z.string().trim().min(5).max(2000),
});

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });
  const reviewer = await ensureCurrentAppUser();
  if (!reviewer) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid decision and notes are required." }, { status: 400 });
  try {
    await reviewListingClaim({
      claimId: parsed.data.claimId,
      reviewerUserId: reviewer.appUserId,
      action: parsed.data.action,
      reviewNotes: parsed.data.reviewNotes,
    });
    return NextResponse.json({ ok: true, status: parsed.data.action === "approve" ? "approved" : "rejected" });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "The claim could not be resolved in its current state." }, { status: 422 });
  }
}
