import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-guard";
import { verifyHost } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ hostId: z.string().uuid() });
const bodySchema = z.object({}).passthrough();

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

  const rawBody = await request.json().catch(() => ({}));
  if (!bodySchema.safeParse(rawBody).success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    await verifyHost(parsedParams.data.hostId);
    return NextResponse.json({ ok: true, verification_status: "admin_verified" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verify failed." },
      { status: 500 },
    );
  }
}
