import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAdminApi } from "@/lib/admin-guard";
import { ensureCurrentAppUser } from "@/lib/auth";
import {
  enqueueOfficialUrlIntake,
  OfficialUrlIntakeIdempotencyConflictError,
  OfficialUrlIntakeRevalidationNotFoundError,
  revalidateOfficialUrlIntake,
} from "@/lib/db/official-url-intake";
import { officialUrlIntakeBatchSchema } from "@/lib/official-url-intake-schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.message },
      { status: guard.status },
    );
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

  const parsed = officialUrlIntakeBatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid official URL intake batch.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.operation === "revalidate") {
      const result = await revalidateOfficialUrlIntake({
        actorAppUserId: operator.appUserId,
        entries: parsed.data.entries,
      });
      return NextResponse.json(
        {
          ok: true,
          revalidated: result.revalidated,
          pending: result.pending,
          status: "queued_for_private_draft_revalidation",
        },
        { status: 202 },
      );
    }

    const result = await enqueueOfficialUrlIntake({
      actorAppUserId: operator.appUserId,
      entries: parsed.data.entries,
    });
    return NextResponse.json(
      {
        ok: true,
        accepted: result.accepted,
        replayed: result.replayed,
        status: "queued_for_private_draft_review",
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof OfficialUrlIntakeIdempotencyConflictError) {
      return NextResponse.json(
        {
          error:
            "An idempotency key was already used for a different official URL. Use a new key for new work.",
        },
        { status: 409 },
      );
    }
    if (error instanceof OfficialUrlIntakeRevalidationNotFoundError) {
      return NextResponse.json(
        {
          error:
            "Revalidation requires an exact URL request that was queued previously. Queue it as new intake first.",
        },
        { status: 409 },
      );
    }
    Sentry.captureException(error, {
      tags: {
        operation:
          parsed.data.operation === "revalidate"
            ? "official_url_revalidation"
            : "official_url_intake",
      },
    });
    return NextResponse.json(
      {
        error:
          "Official URLs could not be queued safely. No listing was published.",
      },
      { status: 500 },
    );
  }
}
