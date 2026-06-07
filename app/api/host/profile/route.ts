import { NextResponse } from "next/server";
import { updateHostProfile } from "@/lib/db/host-dashboard";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const body = (await req.json()) as { logo_url?: string | null; file_type?: string; file_size?: number };
  if (body.file_type && !ALLOWED.has(body.file_type)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }
  if (body.file_size && body.file_size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 400 });
  }
  await updateHostProfile({ logo_url: body.logo_url ?? null });
  return NextResponse.json({ ok: true });
}
