import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-guard";
import { actOnReport } from "@/lib/db/admin";
import { revalidatePublicListings } from "@/lib/db/listings-cache";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ reportId: z.string().uuid() });
const bodySchema = z.object({}).passthrough();

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

  const rawBody = await request.json().catch(() => ({}));
  if (!bodySchema.safeParse(rawBody).success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await actOnReport(parsedParams.data.reportId);
    // Acting on a listing report hides the listing; refresh the cached feed so
    // the moderated listing stops showing. Non-listing targets don't affect it.
    if (result.target_type === "listing") {
      revalidatePublicListings();
    }
    return NextResponse.json({
      ok: true,
      status: "action_taken",
      target_type: result.target_type,
      target_id: result.target_id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 500 },
    );
  }
}
