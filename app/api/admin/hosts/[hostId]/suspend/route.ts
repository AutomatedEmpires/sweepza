import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-guard";
import { ensureCurrentAppUser } from "@/lib/auth";
import { suspendHost } from "@/lib/db/admin";
import { revalidatePublicListings } from "@/lib/db/listings-cache";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ hostId: z.string().uuid() });
const bodySchema = z.object({ notes: z.string().trim().min(5).max(2000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hostId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid host id." }, { status: 400 });
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
    await suspendHost({
      hostId: parsedParams.data.hostId,
      actorUserId: reviewer.appUserId,
      notes: parsedBody.data.notes,
    });
    // Suspension hides every listing the host owns, so any of theirs that were
    // publicly live must leave the cached feed.
    revalidatePublicListings();
    return NextResponse.json({ ok: true, verification_status: "none" });
  } catch (error) {
    return NextResponse.json(
      { error: "Host suspension failed." },
      { status: 422 },
    );
  }
}
