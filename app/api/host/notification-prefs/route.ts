import { NextResponse } from "next/server";
import { getNotificationPrefs, HostAccessError, saveNotificationPrefs } from "@/lib/db/host-dashboard";

export async function GET(): Promise<NextResponse> {
  try {
    const prefs = await getNotificationPrefs();
    return NextResponse.json({
      email_on_listing_approved: prefs.email_on_listing_approved,
      email_on_listing_held: prefs.email_on_listing_held,
      email_on_listing_expiring_soon: prefs.email_on_listing_expiring_soon,
      email_on_new_reaction: prefs.email_on_new_reaction,
    });
  } catch (error) {
    if (error instanceof HostAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected error loading preferences." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    await saveNotificationPrefs({
      email_on_listing_approved: Boolean(body.email_on_listing_approved),
      email_on_listing_held: Boolean(body.email_on_listing_held),
      email_on_listing_expiring_soon: Boolean(body.email_on_listing_expiring_soon),
      email_on_new_reaction: Boolean(body.email_on_new_reaction),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HostAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected error saving preferences." }, { status: 500 });
  }
}
