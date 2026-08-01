import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { recoverStaleIngestionRuns } from "@/lib/db/ingestion";
import { env } from "@/lib/env";
import { runIngestion } from "@/lib/ingestion/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ingestion cron: discover → extract at the official source → dedupe → land
// draft (review-only) listings. Auth mirrors expire-stale (Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`).
//
// Three gates stand between this route firing and any live request, and they
// are checked in cost order — cheapest and most global first:
//   1. INGESTION_ENABLED !== "true"  → 200 healthy no-op, nothing loads.
//   2. ANTHROPIC_API_KEY absent      → 503 here; extraction is impossible.
//   3. per-source compliance         → lib/ingestion/gate.ts, inside the run.
// Vercel calls this on schedule today; with the switch unset it is a no-op that
// costs one JSON response. That is deliberate — the cron entry can stay in
// vercel.json without ingestion being live, so activation is an env change the
// founder makes, not a deploy an engineer makes.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (env.INGESTION_ENABLED !== "true") {
    return NextResponse.json(
      {
        ok: true,
        skipped: "INGESTION_ENABLED is not \"true\"; live ingestion is disabled for this deployment.",
        sources: [],
      },
      { status: 200 },
    );
  }
  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured; ingestion is disabled." },
      { status: 503 },
    );
  }

  try {
    const recovery = await recoverStaleIngestionRuns();
    const sources = await runIngestion({ limit: 25 });
    const created = sources.reduce((n, s) => n + (s.created ?? 0), 0);
    const failedSources = sources
      .filter((source) => source.status === "error")
      .map((source) => source.source);

    if (failedSources.length > 0) {
      const failure = new Error(
        `Ingestion source execution failed: ${failedSources.join(", ")}`,
      );
      Sentry.captureException(failure, {
        tags: { operation: "ingestion_cron" },
        extra: {
          failedSources,
          created,
          recoveredStaleRuns: recovery.recovered,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: "One or more ingestion sources failed.",
          created,
          recoveredStaleRuns: recovery.recovered,
          sources,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      created,
      recoveredStaleRuns: recovery.recovered,
      sources,
    });
  } catch (error) {
    Sentry.captureException(
      error instanceof Error ? error : new Error("ingestion cron failed"),
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingestion failed." },
      { status: 500 },
    );
  }
}
