import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { ensureCurrentAppUser } from "@/lib/auth";
import { appendOfficialDestinationPolicyEvent } from "@/lib/db/official-destination-policy";
import { officialDestinationPolicyEventSchema } from "@/lib/official-destination-policy-event-schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const operator = await ensureCurrentAppUser();
  if (!operator) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!operator.appUser.is_admin && !operator.appUser.is_owner) {
    return NextResponse.json(
      { error: "Admin or owner access required." },
      { status: 403 },
    );
  }

  const parsed = officialDestinationPolicyEventSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid destination policy decision.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await appendOfficialDestinationPolicyEvent({
      actorUserId: operator.appUserId,
      decision: parsed.data,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;
    if (code === "40001") {
      return NextResponse.json(
        {
          error:
            "This destination scope changed while you were reviewing it. Refresh and review the current decision before trying again.",
        },
        { status: 409 },
      );
    }
    if (code === "23505") {
      return NextResponse.json(
        {
          error:
            "This submission key was already used for a different decision. Review the current scope before trying again.",
        },
        { status: 409 },
      );
    }
    if (code === "42501") {
      return NextResponse.json(
        { error: "Admin or owner access required." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Destination policy decision could not be recorded. No permission changed.",
      },
      { status: 422 },
    );
  }
}
