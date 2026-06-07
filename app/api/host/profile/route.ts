import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { upsertHostProfileForAppUser } from "@/lib/db/hosts";
import { hostProfileSchema } from "@/lib/host-profile-schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Clerk is not configured for this environment." },
      { status: 503 },
    );
  }

  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!authUser.appUser.is_host) {
    return NextResponse.json({ error: "Host access required." }, { status: 403 });
  }

  const parsed = hostProfileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const host = await upsertHostProfileForAppUser(authUser.appUserId, parsed.data);
    return NextResponse.json({
      ok: true,
      host: {
        id: host.id,
        display_name: host.display_name,
        website_url: host.website_url,
        short_description: host.short_description,
        logo_url: host.logo_url,
        verification_status: host.verification_status,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Host profile save failed.",
      },
      { status: 500 },
    );
  }
}
