import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-guard";
import { dismissReport } from "@/lib/db/admin";

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
    await dismissReport(parsedParams.data.reportId);
    return NextResponse.json({ ok: true, status: "dismissed" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dismiss failed." },
      { status: 500 },
    );
  }
}
