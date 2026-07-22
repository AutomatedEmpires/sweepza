import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-guard";
import { ensureCurrentAppUser } from "@/lib/auth";
import { verifyHost } from "@/lib/db/admin";
import { publicHttpsUrlSchema } from "@/lib/http-url-schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ hostId: z.string().uuid() });
const bodySchema = z.object({
  notes: z.string().trim().min(5).max(2000),
  evidenceUrl: publicHttpsUrlSchema,
});

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
    await verifyHost({
      hostId: parsedParams.data.hostId,
      actorUserId: reviewer.appUserId,
      notes: parsedBody.data.notes,
      evidenceUrl: parsedBody.data.evidenceUrl,
    });
    return NextResponse.json({ ok: true, verification_status: "admin_verified" });
  } catch (error) {
    return NextResponse.json(
      { error: "Host verification failed." },
      { status: 422 },
    );
  }
}
