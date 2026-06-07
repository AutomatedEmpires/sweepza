import { NextResponse } from "next/server";
import { getNotificationPrefs, saveNotificationPrefs } from "@/lib/db/host-dashboard";

export async function GET() {
  const prefs = await getNotificationPrefs();
  return NextResponse.json(prefs);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  await saveNotificationPrefs({
    email_on_listing_approved: Boolean(body.email_on_listing_approved),
    email_on_listing_held: Boolean(body.email_on_listing_held),
    email_on_listing_expiring_soon: Boolean(body.email_on_listing_expiring_soon),
    email_on_new_reaction: Boolean(body.email_on_new_reaction),
  });
  return NextResponse.json({ ok: true });
}
