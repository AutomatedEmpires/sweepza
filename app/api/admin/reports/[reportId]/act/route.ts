import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-guard";
import { ensureCurrentAppUser } from "@/lib/auth";
import { actOnReport } from "@/lib/db/admin";
import { revalidatePublicListings } from "@/lib/db/listings-cache";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ reportId: z.string().uuid() });
const bodySchema = z.object({ reviewNotes: z.string().trim().min(5).max(2000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  }

  const reviewer = await ensureCurrentAppUser();
  if (!reviewer) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await actOnReport({
      reportId: parsedParams.data.reportId,
      reviewerUserId: reviewer.appUserId,
      reviewNotes: parsedBody.data.reviewNotes,
    });
    // Listing reports move the listing into a held correction state. Host
    // suspension also removes every active listing owned by that host.
    if (["listing", "image", "entry_link", "host"].includes(result.target_type)) {
      revalidatePublicListings();
    }
    return NextResponse.json({
      ok: true,
      status: "action_taken",
      target_type: result.target_type,
      target_id: result.target_id,
    });
  } catch {
    return NextResponse.json(
      { error: "Report action failed." },
      { status: 422 },
    );
  }
}
