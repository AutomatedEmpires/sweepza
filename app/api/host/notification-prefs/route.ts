import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import {
  DEFAULT_NOTIFICATION_PREFS,
  notificationPrefsSchema,
} from "@/lib/notification-prefs-schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PREF_COLUMNS =
  "email_on_listing_approved, email_on_listing_held, email_on_listing_expiring_soon, email_on_new_reaction";

async function requireHost() {
  if (!isClerkConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Clerk is not configured for this environment." },
        { status: 503 },
      ),
    } as const;
  }

  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  const { is_host, is_owner, is_admin } = authUser.appUser;
  if (!is_host && !is_owner && !is_admin) {
    return {
      error: NextResponse.json(
        { error: "Host access required." },
        { status: 403 },
      ),
    } as const;
  }

  return { authUser } as const;
}

export async function GET() {
  const gate = await requireHost();
  if ("error" in gate) return gate.error;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("notification_pref")
    .select(PREF_COLUMNS)
    .eq("app_user_id", gate.authUser.appUserId)
    .maybeSingle<typeof DEFAULT_NOTIFICATION_PREFS>();

  if (error) {
    return NextResponse.json(
      { error: `Failed to load preferences: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ prefs: data ?? DEFAULT_NOTIFICATION_PREFS });
}

export async function POST(request: Request) {
  const gate = await requireHost();
  if ("error" in gate) return gate.error;

  const parsed = notificationPrefsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("notification_pref").upsert(
    {
      app_user_id: gate.authUser.appUserId,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "app_user_id" },
  );

  if (error) {
    return NextResponse.json(
      { error: `Failed to save preferences: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, prefs: parsed.data });
}
