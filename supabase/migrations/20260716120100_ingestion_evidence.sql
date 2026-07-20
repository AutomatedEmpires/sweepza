-- Ingestion evidence + run attribution.
--
-- Two gaps this closes:
--
-- 1. extraction_confidence was a bare numeric. A reviewer looking at 0.62 had
--    no way to know WHICH evidence was missing, which makes the number worse
--    than useless — it invites being read as "62% likely to be real" when it
--    actually means "62% of the soft evidence weights were present on the
--    page". The factors column stores the explanation alongside the score
--    (lib/ingestion/verify.ts EvidenceFactor[]).
--
-- 2. ingestion_run recorded counts but not WHY a pass did nothing. A run that
--    was refused by the compliance gate and a run that found no new sweeps both
--    logged zeros, so "is ingestion working?" was unanswerable from the data.
--
-- Additive and dark: no behavior changes on apply.

alter table listing_ingestion
  add column extraction_factors jsonb,
  add column extraction_summary text;

comment on column listing_ingestion.extraction_confidence is
  'Weighted share (0..1) of soft evidence factors present on the official page. NOT a probability that the sweepstakes is genuine. Read with extraction_factors.';
comment on column listing_ingestion.extraction_factors is
  'EvidenceFactor[] from lib/ingestion/verify.ts: every check with weight, hard/soft, pass/fail, and a reviewer-facing explanation.';

alter table ingestion_run
  -- 'skipped' distinguishes "the gate refused this source" from a real pass.
  add column gate_decision text,
  add column requests_made int not null default 0,
  add column not_modified int not null default 0;

comment on column ingestion_run.gate_decision is
  'Why the run was allowed or refused (lib/ingestion/gate.ts GateDecision). Null for runs predating this column.';
comment on column ingestion_run.status is
  'running | ok | error | skipped. skipped means the compliance gate refused the source; no network activity occurred.';
