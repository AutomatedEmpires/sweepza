import { NextResponse } from "next/server";
import { updateHostProfile } from "@/lib/db/host-dashboard";

export async function POST(req: Request) {
  const body = (await req.json()) as { logo_url?: string | null };
  await updateHostProfile({ logo_url: body.logo_url ?? null });
  return NextResponse.json({ ok: true });
}
