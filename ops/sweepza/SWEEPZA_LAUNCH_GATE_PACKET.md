# Sweepza — Six-Decision Launch-Gate Packet

Prepared 2026-07-16 for founder decision. **Overall gate: NO-GO** (unchanged).

This packet is decision support, not activation. Engineering has not made — and
must not make — any of these six decisions. Each remains dark until the founder
explicitly acts on the named control. No secret values appear here; only the
names of resources, variables, and records.

The authoritative source for the six decisions is
`SWEEPZA_PRODUCTION_GATE_STATUS.md` (gate table, dated 2026-07-12). Resource
names and variables are from `SWEEPZA_ENV_CONTRACT.md`; recovery mechanics from
`SWEEPZA_BREAK_GLASS_RUNBOOK.md`. A seventh item — ingestion activation, built
across PRs #71/#73/#74 — is documented in the appendix because it is now part of
the activation surface, though it is a separate capability gate rather than one
of the launch-gate six.

---

## Decision 1 — Clerk production application & dark-lane identity testing

**Decision.** Authenticate/select the intended Clerk **production** application
and approve disposable dark-lane identity testing in Preview.

**Current technical reality.** Auth code is complete and gated. The Doppler
`sweepza/stg` Clerk keys are development-family and `CLERK_WEBHOOK_SECRET` is
empty, so Preview correctly fails closed (`SWEEPZA_PRODUCTION_GATE_STATUS.md`:
Clerk = FAIL). `ensureCurrentAppUser` treats a missing Clerk middleware as
signed-out, so the app degrades safely rather than erroring. Untested against a
production-family key set.

**Risk.** User-trust and security. A mismatched publishable/secret key family or
an absent webhook secret means broken sign-in or unverified identity on a live
consumer domain. Auth is the root of every RLS decision.

**Activation mechanism.** Set, in Doppler `sweepza/prd` → Vercel Production:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (same production
application/key family), and `CLERK_WEBHOOK_SECRET`. No code change.

**Preconditions.** A named Clerk production application; publishable and secret
keys from the same application; a configured Clerk webhook endpoint with its
signing secret; one disposable dark-lane test identity approved for Preview.

**Rollback.** Restore the prior Vercel Preview/Production env versions and
redeploy the last known-good build. Never roll back by deleting Clerk objects
(`SWEEPZA_ENV_CONTRACT.md` rollback rule).

**Verification.** In Preview with production-family keys: sign in with the
disposable identity, confirm the Clerk webhook delivers (user row upserts via
`/api/webhooks/clerk`), and confirm an admin route resolves the admin identity.
`curl /api/health` → `ok:true`.

---

## Decision 2 — Sentry project connection

**Decision.** Connect the Sweepza Sentry project and supply the non-empty
Preview DSN/auth/org tuple.

**Current technical reality.** Sentry instrumentation is wired
(`sentry.*.config.ts`, `instrumentation*.ts`), but `NEXT_PUBLIC_SENTRY_DSN`,
`SENTRY_AUTH_TOKEN`, and `SENTRY_ORG` are empty; the project name alone is
insufficient (`SWEEPZA_PRODUCTION_GATE_STATUS.md`: Sentry = FAIL). No event
proof exists.

**Risk.** Operational. Activating any live behavior (ingestion, email, payments)
without error capture means an incident is invisible until a user reports it —
the observability the other decisions depend on.

**Activation mechanism.** Set `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, `SENTRY_PROJECT` in Doppler → Vercel (Preview first, then
Production). No code change.

**Preconditions.** A dedicated Sweepza Sentry project (not shared with another
venture); a DSN and an auth token scoped to it.

**Rollback.** Clear the four variables and redeploy; instrumentation no-ops
without a DSN. Non-destructive.

**Verification.** Trigger a controlled test error in Preview and confirm it lands
in the Sweepza Sentry project with the correct release/environment tags.

---

## Decision 3 — Live Stripe account (payments)

**Decision.** Connect the Sweepza **live** Stripe account, confirm the two
recurring customers and the `$0` draft invoice, and — only after replacement
proof — approve retiring the retained foreign webhook.

**Current technical reality.** Billing code and a signed-webhook route exist and
pass against the isolated sandbox `sweepza_sandbox` / `acct_1TeqgHD7Yqq488pB`
(gate: sandbox catalog PASS, signed webhook PASS). Live-money proof is
incomplete and a foreign webhook remains (gate: live money = FAIL). **Machine-
level Stripe connectors resolve to Explore & Earn and must never be used here**
(founder lock; `POLICY.md` §6).

**Risk.** Financial, legal, reputation. Charging on a live consumer domain with
an unverified account, or leaving a foreign webhook that could mutate Sweepza
billing state, is the highest-severity item in this packet.

**Activation mechanism.** Set `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_HOST_BASELINE`, `STRIPE_PRICE_ADDITIONAL_LISTING` — all from the
**same live account and mode** — in Doppler `sweepza/prd` → Vercel Production.
Retire the foreign webhook in the Stripe dashboard only after the replacement is
proven.

**Preconditions.** A Sweepza-owned live Stripe account (independent of E&E); two
confirmed recurring prices; the two customers and `$0` draft invoice verified;
the replacement signed-webhook endpoint proven before foreign-webhook retirement.

**Rollback.** Restore prior env versions; never delete Stripe objects to roll
back (`SWEEPZA_ENV_CONTRACT.md`). Payments stay dark while the live keys are
absent.

**Verification.** A correctly signed synthetic event returns HTTP 200 with no
unintended mutation (as already proven in sandbox), repeated on the live
endpoint; the two customers and `$0` invoice reconcile in the live dashboard.

---

## Decision 4 — Email domain / sender identity (`sweepza.com`)

**Decision.** Authenticate the `sweepza.com` mailbox/domain provider, name every
alias owner/forwarding target, choose apex vs. sending subdomain, and approve one
internal test.

**Current technical reality.** Transactional send is implemented
(`lib/email/send.ts`, default sender `Sweepza <hello@sweepza.com>`) and the
seeker-reminder digest renders (`lib/email/templates.ts`), but **zero aliases
exist and the only connected Resend identity is Explore & Earn's** (gate: email
aliases = FAIL). Sweepza must have its **own** Resend sending identity — sender
isolation is a founder lock (`POLICY.md` §6, registry). Reminder preview is now
available dark (Decision-7 appendix / PR #74) so the content is reviewable
without sending.

**Risk.** Reputation, deliverability, cross-product contamination. Sending from a
non-isolated identity would commingle Sweepza with E&E and risk both domains'
sender reputation.

**Activation mechanism.** Provision a Sweepza-owned Resend domain/identity for
`sweepza.com`; set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Doppler → Vercel.
Reminder delivery additionally requires enabling the reminder cron (currently a
dark no-op path) — keep it off until this decision is complete.

**Preconditions.** DNS records (SPF/DKIM/DMARC) for the chosen apex or sending
subdomain; every alias owner and forwarding target named; a Sweepza-owned Resend
account (never E&E's connector).

**Rollback.** Clear `RESEND_API_KEY`; `sendEmail` then no-ops (graceful warn +
return). Non-destructive.

**Verification.** Send one internal test to a named owner from the isolated
identity; confirm SPF/DKIM pass and the message is received. Run the reminder
**preview** (`/admin/operations`) to confirm digest content before any real send.

---

## Decision 5 — Qualified legal review of Privacy & Terms

**Decision.** Assign qualified legal review for Privacy and Terms, covering
governing law, liability, dispute resolution, retention, and
jurisdiction-specific privacy provisions.

**Current technical reality.** Privacy and Terms pages exist with placeholder
copy replaced, but the copy explicitly states it requires legal review and is
**not attorney-approved** (gate: legal baseline = PASS-DRAFT). Sweepstakes carry
jurisdiction-specific legal obligations (eligibility, official rules, no-purchase
disclosure) that the product already treats as invariants.

**Risk.** Legal, compliance. Operating a live sweepstakes directory under
un-reviewed Terms/Privacy is a regulatory exposure independent of any technical
control.

**Activation mechanism.** Not a code flag — a legal sign-off. Replace the draft
copy in `app/privacy` and `app/terms` with attorney-approved copy via a reviewed
PR once counsel signs off.

**Preconditions.** Assigned qualified counsel; jurisdictions of operation
identified; retention and dispute posture decided.

**Rollback.** Revert to the prior page copy via PR. Non-destructive.

**Verification.** Written attorney approval on file; the deployed pages match the
approved copy.

---

## Decision 6 — Break-glass owner & recovery drill

**Decision.** Name the break-glass owner (and ideally a secondary) and approve a
non-destructive recovery/rollback drill.

**Current technical reality.** The runbook exists
(`SWEEPZA_BREAK_GLASS_RUNBOOK.md`) with the Vercel Instant Rollback path and
per-provider recovery, but the primary/secondary owners are unnamed and no drill
has been run (gate: recovery = FAIL). A known-good deploy reference is recorded.

**Risk.** Operational, reputation. A live consumer domain with no named,
access-verified incident owner and no rehearsed rollback is one bad deploy from
prolonged downtime.

**Activation mechanism.** Not a code flag — an ownership + rehearsal decision.
Name the owner(s) in the runbook table; confirm each has admin on Vercel,
Doppler, Supabase, Clerk, and Stripe; run the documented non-destructive drill
(Vercel Instant Rollback to a known-good **Ready** build, then forward again).

**Preconditions.** At least one named owner with verified admin on all five
providers; a chosen drill window.

**Rollback.** The drill itself is the rollback mechanism; it is non-destructive
(re-points the `sweepza.com` alias, does not rebuild or delete).

**Verification.** After the drill: `curl https://sweepza.com/api/health` →
`ok:true`, homepage 200, integrations green; the owner table is filled in and
access confirmed.

---

## Appendix — Ingestion activation (separate capability gate; built this session)

Not one of the launch-gate six, but now part of the activation surface. Live
sweepstakes ingestion is dark and requires **all** of the following, by design,
so no single edit turns it on (PRs #71/#73/#74):

1. **Deployment switch** — `INGESTION_ENABLED` must equal the literal `"true"`
   in Vercel env. Unset (current state) ⇒ the `/api/cron/ingest` route no-ops and
   the execution gate refuses every source.
2. **Reviewed policy floor (code)** — a source's `complianceState` in
   `lib/ingestion/source.ts` must be `approved_for_production`. **All sources
   currently sit at `approved_for_fixtures`, and every `tosPosture` is
   `unreviewed`** — the outstanding blocker is per-source Terms-of-Service
   review.
3. **Approval record (database)** — a `source_registry` row must reach
   `approved_for_production` via an audited transition
   (`lib/db/source-registry.transitionSourceCompliance`), recording the actor and
   timestamp in the append-only `source_approval_event` log.
4. **Extractor key** — `ANTHROPIC_API_KEY` must be set (else extraction no-ops).
5. **No kill switch / closed circuit** — neither the code nor DB kill switch
   engaged, and the source's circuit breaker closed.

The execution gate (`lib/ingestion/gate.ts`) enforces conditions 1–3 and 5 on
every run; tests prove an unapproved source cannot execute even with the switch
on and a forged approval record. **Preconditions to activate a source:** complete
its ToS review, raise its code floor to production in a reviewed PR, record the
DB approval, and set the two env vars. **Rollback:** unset `INGESTION_ENABLED`
(instant, deployment-wide), engage a source kill switch, or transition the source
to `paused`/`revoked` (no deploy needed). **Verification before activation:** run
the ingestion **dry-run** (`/admin/operations`) and confirm the source-health
console (`/admin/sources`) shows the intended gate verdict. Migrations
(`source_registry`, `ingestion_evidence`, `listing_lifecycle`) must be applied to
the Sweepza Supabase project as a deliberate step — they are additive and change
no behavior on apply.
