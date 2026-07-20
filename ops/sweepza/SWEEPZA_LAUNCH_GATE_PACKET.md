# Sweepza — Founder Launch-Gate Packet

Reconciled 2026-07-19 Pacific. **Overall launch gate: NO-GO.**

This packet records decisions and proof requirements; it does not authorize an
activation. Engineering must not infer approval from a merged PR, a configured
provider object, or an available secret. Production changes require the named
founder decision, Preview evidence where applicable, a reviewed change window,
and a recorded rollback target.

The 2026-07-12 `SWEEPZA_PRODUCTION_GATE_STATUS.md` and
`SWEEPZA_BREAK_GLASS_RUNBOOK.md` are historical inputs, not current authority by
themselves. Their claims must be re-verified at execution time. Resource names
and lane rules come from `SWEEPZA_ENV_CONTRACT.md`. Current control-plane truth
is that Sweepza is live at `sweepza.com`, `main` deploys production, email must
use a Sweepza-owned Resend identity, payments have no approved provider, and
storage is `none`.

## Change-control rules for every decision

1. Use only Sweepza-owned provider resources. The machine Stripe and Resend
   connectors are known to resolve to Explore & Earn and are forbidden here.
2. Prove a complete, internally consistent tuple in Doppler `sweepza/stg` and a
   Vercel Preview before changing Doppler `sweepza/prd` or Vercel Production.
3. Do not expose secret values in tickets, PRs, logs, screenshots, or this file.
4. Record the approving founder, timestamp, exact scope, operator, Preview URL,
   production deployment SHA, and rollback target in the change record.
5. Use forward-only database corrections. Never delete provider objects as a
   rollback shortcut.
6. A provider secret is not an activation gate. Email and payments need
   checked-in code gates before production secrets can be provisioned.

## Decision register

| # | Founder decision | Current disposition | Production authority |
| --- | --- | --- | --- |
| 1 | Clerk production application and disposable dark-lane identity | Blocked; production-family Preview proof absent | Explicit approval after Preview proof |
| 2 | Dedicated Sweepza Sentry project | Blocked; complete event proof absent | Explicit approval after Preview proof |
| 3 | Sweepza live payments provider and residue disposition | Blocked; no provider approved, no payment gate | Separate live-money approval after sandbox proof |
| 4 | Sweepza outbound sender plus inbound mailbox ownership | Blocked; isolation and reply-loop proof absent, no email gate | Separate outbound and inbound approvals after safe Preview proof |
| 5 | Qualified Privacy and Terms review | Blocked; deployed copy is not attorney-approved | Written legal approval plus reviewed content PR |
| 6 | Break-glass owners and recovery drill | Blocked; owners/drill not recorded | Named owners and approved drill window |

## Decision 1 — Clerk production application and dark-lane identity

**Decision required.** Select the intended Sweepza Clerk production
application and approve one disposable identity for non-public Preview testing.

**Current technical reality.** The historical gate recorded development-family
keys and an empty webhook secret in the staging lane. That snapshot is not a
current provider inspection. Application middleware fails signed-out when Clerk
is unavailable, but the complete production-family tuple and webhook flow have
not been proven in Preview.

**Safe sequence.**

1. A founder-authorized operator identifies the dedicated Sweepza Clerk
   production application; it must not belong to another venture.
2. Install the matching `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SECRET` in `sweepza/stg` / Vercel
   Preview only.
3. On a private Preview, use the approved disposable identity to prove sign-in,
   sign-out, webhook signature verification and user upsert, protected-route
   denial for a non-admin, and admin authorization for the intended admin.
4. Record Preview evidence. Only then request explicit Production approval and
   install the same application family in `sweepza/prd` / Vercel Production.

**Rollback.** Restore the prior environment versions and redeploy the previously
verified Ready SHA. Do not delete users, webhooks, or the Clerk application.

**Production proof.** `/api/health` is green, the disposable production test
completes, role boundaries hold, and webhook delivery is visible in the
dedicated Sweepza project without leaking secrets.

## Decision 2 — Dedicated Sentry project

**Decision required.** Select a dedicated Sweepza Sentry project and authorize
the DSN, release-upload credential, organization, and project tuple.

**Current technical reality.** Sentry instrumentation is present. The
2026-07-12 snapshot recorded an incomplete staging tuple, but no current
provider inspection or received-event evidence is claimed here.

**Safe sequence.** Install `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, and `SENTRY_PROJECT` in Preview first. Trigger a controlled Preview
error, confirm the correct project, release and environment, and verify source
maps without exposing user data. Request Production approval only after that
proof.

**Rollback.** Restore the prior environment versions and redeploy. Clearing the
DSN disables event delivery, but the preferred rollback is the recorded prior
version.

**Production proof.** One controlled production-tagged event lands in the
dedicated Sweepza project, alert ownership is named, and the event contains no
unexpected sensitive data.

## Decision 3 — Live payments and Stripe residue

**Decision required.** Choose and authorize a Sweepza-owned live payments
provider, classify the retained Stripe residue, and separately authorize any
live-money test. Current control-plane configuration is `payments = null`; no
provider is approved for production.

**Current technical reality.** Subscription Checkout and webhook code exist.
The checked-in `PAYMENTS_ENABLED` gate defaults off and requires the literal
`"true"` before customer creation, Checkout, portal sessions, or webhook state
mutation. Provider credentials are configuration, not activation authority.

The accepted historical Stripe snapshot records two residual customers and one
`$0` draft invoice, with no subscriptions, charges, PaymentIntents, refunds, or
disputes. It does **not** record “recurring customers.” The connected machine
Stripe surface belongs to Explore & Earn, so this assignment did not refresh or
mutate the snapshot.

**Checked-in control.** The default-off payment gate blocks customer creation,
Checkout, portal sessions, and payment-webhook state mutation unless the
explicitly named production control is enabled. Missing, malformed, and
non-literal truthy values fail closed.

**Safe sequence.**

1. In `sweepza/stg` / Preview, use only the dedicated Sweepza sandbox account.
2. Prove account/mode consistency for publishable key, secret key, prices, and
   webhook secret; prove signed-webhook idempotency and a complete sandbox
   Checkout/entitlement lifecycle with the checked-in gate deliberately enabled.
3. From the correct Sweepza live account, obtain fresh read-only evidence for
   the two customers, `$0` invoice, zero-count claims, and foreign webhook. Do
   not delete or disable any object.
4. Founder separately approves the provider, residue disposition, live key
   installation, and any controlled live-money proof.
5. Install Production values in an approved window with the payment gate still
   off. Enable it only under the separately recorded live-money authorization.
6. Retire the foreign webhook only after the replacement is proven and the
   founder explicitly approves retirement.

**Rollback.** Turn the checked-in payment gate off, restore prior environment
versions, and redeploy the recorded Ready SHA. Preserve customers, invoices,
subscriptions, and webhooks for investigation.

**Production proof.** Correct account and mode, exact prices, signed webhook,
idempotent retry behavior, entitlements, Sentry visibility, and reconciliation
are all evidenced. No real charge is proof unless its amount and test identity
were explicitly authorized in advance.

## Decision 4 — Outbound email and inbound mailbox ownership

**Decisions required.** These are separate controls:

- approve a Sweepza-owned outbound Resend identity and exact From address; and
- name the owner and forwarding target of every public inbound/reply address,
  then prove an end-to-end reply loop.

A verified sender header does not prove that replies are received or owned.

**Current technical reality.** `lib/email/send.ts` sends when
`RESEND_API_KEY` is present and otherwise skips. The daily
`/api/cron/seeker-reminders` schedule already exists in `vercel.json`; the route
returns 503 without the key but can send eligible reminders on the next run as
soon as the key is present. Other notification call sites also use the shared
sender. There is no checked-in email-enable gate and the current helper does not
establish a separate Reply-To contract. Consequently, provisioning a production
key can activate outbound mail.

**Required engineering control before any production key.** Add and test a
checked-in, default-off email gate covering cron reminders and all transactional
call sites. The disabled state must perform no provider call and must give
operators an honest status. Either remove/disable the reminder schedule until
approval or make the scheduled route a successful, observable no-op while the
gate is off. Define explicit From and Reply-To variables without claiming an
inbox exists.

**Safe sequence.**

1. Choose apex versus sending subdomain and create a dedicated Sweepza Resend
   resource—never the Explore & Earn connector.
2. Verify SPF, DKIM, and DMARC. Record the exact From address.
3. Name each inbound address owner and forwarding destination; prove inbound
   delivery and a reply back to the original internal sender.
4. With the checked-in email gate off, install a production-like credential in
   Preview and exercise the real scheduled-reminder route plus every
   transactional send entrypoint. Tests and provider evidence must show zero
   provider calls. Separately confirm that the admin reminder preview remains a
   pure, no-send content review.
5. Founder separately approves one internal outbound test. Enable the gate only
   in Preview, send to the named internal recipient, verify authentication and
   reply behavior, then turn it off.
6. Request a separate Production approval. Install Production credentials with
   the gate off; enable only during the approved window.

**Rollback.** Turn the checked-in gate off first, restore prior environment
versions, and redeploy. Do not treat deleting a domain or API key as the primary
rollback.

**Production proof.** Provider dashboard shows the dedicated Sweepza identity;
SPF/DKIM/DMARC pass; From and Reply-To are exact; the named mailbox owner
receives and answers the internal test; reminder eligibility, preference
suppression, and delivery logging match the dark preview.

## Decision 5 — Qualified legal review

**Decision required.** Assign qualified counsel to approve Privacy and Terms,
including governing law, liability, dispute resolution, retention, consumer
privacy, sweepstakes eligibility, and jurisdictional requirements.

**Current technical reality.** Privacy and Terms routes exist, but no current
written attorney approval is recorded. The product may display listing-specific
no-purchase and official-rules evidence when that evidence was verified; it
does not universally establish those facts for every external listing.

**Safe sequence.** Counsel identifies operating jurisdictions and approves
source-bound wording. Engineering implements the exact approved copy in a
reviewed PR without broadening claims. Any listing-level legal statement remains
tied to captured evidence rather than inferred from category or source.

**Rollback.** Revert the content PR to the previously reviewed deployed copy.

**Production proof.** Written approval identifies the reviewed document
versions and date, and the deployed pages at the recorded SHA match them.

## Decision 6 — Break-glass ownership and recovery drill

**Decision required.** Name a primary and secondary owner, verify their access,
and approve a non-destructive drill window.

**Current technical reality.** A runbook exists, but its historical deployment
reference must not be treated as a permanent known-good target. Owner and drill
evidence are not recorded in this packet.

**Safe sequence.** Immediately before the drill, choose a currently Ready,
production-smoked deployment SHA and record it as the rollback target. Verify
the named operators' least-privilege access to Vercel, Doppler, Supabase, Clerk,
and any provider actually approved for Sweepza. Run Vercel Instant Rollback,
prove health and critical public routes, then deliberately roll forward to the
approved current deployment. Do not rebuild, delete provider objects, apply
migrations, or activate another gate during the drill.

**Rollback.** The recorded Ready deployment is the rollback target. If the
forward step fails, keep the known-good alias live and open an incident.

**Production proof.** Owner names, access-check timestamp, two exact SHAs,
deployment IDs, health and smoke results, timings, and follow-ups are recorded.

## Separate capability gate — live ingestion

This capability is implemented on `main` through PRs #71, #73, and #74. PR #74
deployed at `abc3bc733a20ee0b254a50bac063073c2727db09`; its admin operations and
source-health surfaces are read-only. Their presence does not authorize
ingestion, source approval, or database migration application.

Live ingestion remains dark and requires every policy and runtime control below:

1. `INGESTION_ENABLED` equals the literal `"true"`; unset is dark.
2. The source descriptor's code policy is `approved_for_production`, its ToS
   posture is `permits_use`, and its robots posture is `permissive` or
   `permissive_with_delay`.
3. The database registry has an audited `approved_for_production` transition for
   that source.
4. `ANTHROPIC_API_KEY` is present for extraction.
5. No code or database kill switch is engaged and the circuit is closed.
6. The source is due for refresh under its policy; a successful run must also
   acquire the atomic database lease so overlapping invocations cannot execute
   the same source concurrently.

Current checked-in source state is intentionally below production: the
`official_direct` source is `reviewed` with `robotsPosture = unknown`; the three
discovery sources are `approved_for_fixtures`; every source has
`tosPosture = unreviewed`. A forged or premature database approval cannot
override the lower code, ToS, or robots floor.

The source-registry, evidence, and listing-lifecycle migration files are merged
but were **not applied to production in this reconciliation**. Applying them is
not behavior-neutral: they add and alter indexes, constraints, grants,
functions, triggers, and write behavior. Applying the schema alone does not
approve a source, change its lifecycle state, or enable ingestion, but it is
still a deliberate production database change requiring its own review,
backup/recovery evidence, maintenance plan, and founder authorization.

Before any source activation: complete and record source-specific ToS and
robots review; raise the code and policy floors in a reviewed PR; apply and
verify the migrations under an approved database window; advance the registry
through a valid audited transition path; prove refresh and atomic-lease behavior;
use the admin dry-run and source-health views; then request explicit
authorization for the environment switch. Rollback order is: unset
`INGESTION_ENABLED`, engage the source kill switch or transition it to
`paused`/`revoked`, and investigate. No rollback step deletes evidence or source
history.

## Sign-off record template

Copy one row per authorized change into the change record. An empty cell means
the gate remains closed.

| Field | Required evidence |
| --- | --- |
| Decision and exact scope | One numbered decision or ingestion source; no bundled implied approvals |
| Founder approval | Name, timestamp, and durable link |
| Operator and owner | Implementer plus primary incident owner |
| Preview proof | URL, deployment SHA, test identities/data classification, results |
| Production window | Start/end, affected provider resources and variables |
| Rollback target | Previously verified Ready deployment ID and SHA |
| Production proof | Health, smoke, provider evidence, and user-impact observation |
| Final disposition | Enabled, rolled back, or still dark |
