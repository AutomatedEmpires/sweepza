import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { runIngestion } from "@/lib/ingestion/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ingestion cron: discover → extract at the official source → dedupe → land
// draft (review-only) listings. Auth mirrors expire-stale (Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`). No-ops safely when no source is
// enabled or the extractor key is absent — nothing runs live until both are set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured; ingestion is disabled." },
      { status: 503 },
    );
  }

  try {
    const sources = await runIngestion({ limit: 25 });
    const created = sources.reduce((n, s) => n + (s.created ?? 0), 0);
    return NextResponse.json({ ok: true, created, sources });
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
