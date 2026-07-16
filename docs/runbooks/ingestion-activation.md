# Runbook: activate the sweepstakes ingestion pipeline (founder-gated)

**State today:** fully built, fully dark. Every source in
`lib/ingestion/source.ts` `SOURCE_REGISTRY` ships `enabled: false`, and the
cron route no-ops unless a source is enabled AND `ANTHROPIC_API_KEY` is set.
Ingested listings are always created draft/private/unreviewed — nothing
publishes without admin review.

## Gates (all founder-owned)
1. Source terms-of-service clearance per source (the registry records
   crawl-delay and priority; Freebie Guy is pre-set to a 10s crawl delay).
2. `ANTHROPIC_API_KEY` present in Vercel env (extraction uses tool-forced
   structured output; model overridable via `INGEST_EXTRACTION_MODEL`).
3. `CRON_SECRET` configured (already required by the other crons).

## Activate
1. Flip the chosen source to `enabled: true` in `SOURCE_REGISTRY` via PR.
2. Ensure the Vercel cron for `/api/cron/ingest` is scheduled (vercel.json).
3. First run: invoke the route manually with the bearer secret and inspect
   the `ingestion_run` row + created `listing_ingestion` provenance records.
4. Review queue: ingested listings appear as draft/private/unreviewed —
   publish only through the admin review flow (which busts the public feed
   cache automatically).

## Verify
- `ingestion_run` rows show the actual run counters: `discovered`, `fetched`,
  `created`, `updated`, `skipped`, `failed` (plus `status` and `notes`).
- Verification is **advisory at ingest time**: `verifyCandidate` scores each
  candidate (official-rules URL, future end date, entry URL, no-purchase
  signal) and records the confidence on the listing's provenance row, but the
  draft is created either way and waits in the admin review queue. The hard
  gate is at publish: the DB publish guard plus manual admin approval —
  nothing becomes public without both. (Follow-up logged: optionally block
  draft creation when `verification.publishable` is false in
  `lib/ingestion/orchestrator.ts`.)

## Rollback
Set the source back to `enabled: false` (PR) — the cron returns to no-op.
Already-created drafts stay private until deleted or reviewed.

## Known limitation (logged)
`fetchOfficialPage` uses plain fetch; heavily JS-rendered sponsor pages yield
partial text. A browser-rendering fallback needs a serverless-compatible
chromium (e.g. @sparticuz/chromium) — dependency decision deferred.
