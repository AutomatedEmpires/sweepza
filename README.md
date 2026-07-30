# Sweepza

**Sweepstakes | Simplified.** A trust-first platform for discovering, tracking, and winning legitimate sweepstakes — always free for the people entering, with the business model on the host side.

[![CI](https://github.com/AutomatedEmpires/sweepza/actions/workflows/ci.yml/badge.svg)](https://github.com/AutomatedEmpires/sweepza/actions/workflows/ci.yml)
[![CodeQL](https://github.com/AutomatedEmpires/sweepza/actions/workflows/codeql.yml/badge.svg)](https://github.com/AutomatedEmpires/sweepza/actions/workflows/codeql.yml)
[![Production Smoke](https://github.com/AutomatedEmpires/sweepza/actions/workflows/production-smoke.yml/badge.svg)](https://github.com/AutomatedEmpires/sweepza/actions/workflows/production-smoke.yml)

Live at **[sweepza.com](https://sweepza.com)**.

## Overview

Sweepza is a consumer web app for sweepstakes seekers: one place to find real, vetted giveaways, keep track of what you have entered, know the moment you can enter again, and see actual winners. Signed-out visitors get a working device-local experience; signing in makes the same routine durable across devices.

The other side of the marketplace is hosts — the brands and sponsors running sweepstakes. Sweepza gives them a listing workspace, a claim flow for listings that reference their promotions, and a subscription entitlement model. Seekers never pay; the platform is designed to be host-funded, and that billing path is built but not yet collecting (see Status).

Every listing passes through an operator review queue before it is public, entry always happens on the sponsor's official page (Sweepza never collects entries itself), and the gamification layer only counts things a seeker genuinely did. That trust posture is enforced in code, not just copy.

## Why it exists

Sweepstakes discovery today is scattered across forums, expired links, and aggregator sites that blur the line between legitimate promotions and lead-generation traps. Seekers waste time on dead or dubious listings and lose track of daily re-entry windows — which is where most winning odds actually come from. Sweepza's bet is that a curated, verified inventory plus a daily tracking routine is worth a habit for seekers, and that an engaged seeker audience is worth paying for as a host.

## Product

### Seeker surfaces

- **Today** (`/`) — the daily habit dashboard: ready-again entries, ending-today listings, saved-not-entered, and recent activity, with an editorial variant when signed out.
- **Discover** (`/discover`, `/discover/swipe`) — one discovery system with feed and swipe modes, full-text search, category hubs, and shared filter chips and sorting.
- **My Sweeps** (`/my-sweeps`) — the seeker control center: Ready, Saved, Entered, Ready Again, Ending Soon, Won, and Skipped lanes computed by `lib/sweep-routine.ts` over per-seeker state (database when signed in, localStorage when not).
- **Listing detail** (`/sweeps/[slug]`) — verification badges, eligibility, entry frequency, re-entry countdowns, and a one-tap path to the sponsor's official entry page.
- **Winners** (`/winners`) — real winner posts with reactions, community submissions, and operator verification before anything is displayed.
- **Gamification** (`lib/gamification.ts`) — entry streaks and badges derived exclusively from real entry events and wins; a streak counts distinct days with at least one genuine entry, so it cannot be farmed by opening the app.
- **Reminders** — per-seeker notification preferences and a durable daily digest pipeline (built end to end; delivery is gated, see Status).

### Host workspace (`/host`)

Listing submission and management, listing claims, profile and logo, analytics, notification preferences, and billing. The entitlement model is a baseline subscription with included active-listing slots plus per-slot add-ons, capped by a database CHECK constraint (`lib/billing/plans.ts`).

### Admin console (`/admin`)

Operator tooling for the listing review queue, host applications, listing claims, winner verification, abuse reports, manual import, ingestion source registry and compliance state, and an operations/source-health view.

### Ingestion engine (`lib/ingestion/`) — built, intentionally dark

An AI-assisted supply pipeline: source adapters fetch official sweepstakes pages through a single hardened HTTP client (host allowlist, crawl delay, request budgets, classified failure taxonomy), an Anthropic-powered extractor turns pages into structured listing candidates, and a work queue plus lifecycle module manages dedupe, re-verification, and expiry. Execution requires four independent conditions to hold at once — a founder-controlled environment switch, a reviewed registry floor in code, a completed terms-of-service review, and an audited per-source approval record in the database (`lib/ingestion/gate.ts`, `lib/ingestion/compliance.ts`). None are currently set in production, so the scheduled ingest cron is a safe no-op by design.

## Status

An honest snapshot. Live means operating on sweepza.com today; gated means merged, tested code that requires explicit founder activation.

| Capability | Status |
| --- | --- |
| Discovery, listing detail, search, My Sweeps tracking | **Live** |
| Gamification (streaks, badges) | **Live** |
| Winners wall with operator verification | **Live** |
| Admin review and operations console | **Live** (operator-facing) |
| Host workspace and application flow | **Live**; paid billing dark |
| Stale-listing expiry cron | **Live** (twice daily) |
| Scheduled production smoke checks | **Live** (every 6 hours) |
| AI ingestion engine | Built; **dark** pending founder env + per-source compliance approval |
| Outbound email (reminder digests, notifications) | Built with durable outbox; **dark** pending provider approval and activation gates |
| Stripe host billing | Built; **dark** — default-off gate, no production provider approved |
| CSP enforcing mode | Report-only in production; enforcing mode behind a flag |

Several launch-gate items remain no-go pending a six-decision founder review packet (`docs/`); CI-green code is deliberately not treated as launch permission.

## Architecture

Single Next.js App Router application — no monorepo. Sweepza runs on fully independent infrastructure: its own Supabase project, its own Clerk instance, and its own email sender identity, shared with no other venture.

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript end to end |
| Database | Supabase Postgres with row-level security; 41 versioned migrations |
| Auth | Clerk (webhook-synced app users; app degrades to device-local mode without keys) |
| Payments | Stripe (host subscriptions; default-off activation gate) |
| Email | Resend (durable outbox + delivery worker; default-off activation gates) |
| AI | Anthropic SDK (ingestion extraction; inert without key and approvals) |
| Analytics / errors | PostHog, Sentry |
| Hosting | Vercel (merge to `main` auto-deploys production; crons in `vercel.json`) |
| Styling | Tailwind over a single token source (`app/tokens.css`); Phosphor icons via a semantic registry |

Theming ships two token palettes: **Midnight** (dark, the default experience) and **Sunrise** (light, an explicit signed-in choice under Profile → Appearance). A sync script generates the runtime theme module from the token file, and every build verifies the two have not drifted.

Notable subsystems: durable reminder-email outbox with bounded scan queues (`lib/email/`), atomic ingestion source-state transitions in SQL, attribution-guarded listing image ingestion with generated per-category fallback art, security headers + report-only CSP, and structured data / OG image generation for listings.

## Engineering discipline

- **Delivery pipeline** — every change moves Spec → Acceptance Criteria → Branch → PR → independent review → green CI → squash-merge → deploy. Nothing lands on `main` without a PR (`AGENTS.md`).
- **CI gates** (`.github/workflows/`) — `ci.yml` (org-wide reusable quality gate), `codeql.yml` static analysis, `dependency-review.yml`, and `production-smoke.yml`, which probes the live deployment every six hours for launch invariants (security headers, canonical URLs, dead-slug 404s) and escalates failures as issues.
- **Default-off activation gates** — payments, outbound email, and ingestion each require a literal `"true"` environment value before any provider call; credentials alone never authorize behavior (`lib/billing/payment-gate.ts`, `lib/email/outbound-gate.ts`, `lib/ingestion/gate.ts`).
- **RLS posture** — row-level security enabled across the schema with 60+ policies, hardened function search paths, and identity helpers moved to a private schema, all in versioned migrations.
- **Design-token ratchet** — `theme:check` runs before build, lint, typegen, and test; a stale generated theme module fails the pipeline.
- **Tests** — Vitest suites colocated across API routes, libraries, and scripts; `pnpm validate` runs lint + typecheck + test + build as one gate.

## Getting started

Requires Node 24.16.0 and pnpm 10.12.4 (both pinned).

```bash
pnpm install
cp .env.example .env.local   # fill in values; see names below
pnpm dev
```

Without Clerk keys the app runs in local mode (device-only seeker state), so a bare clone is immediately explorable. Useful commands:

```bash
pnpm validate        # lint + typecheck + test + build
pnpm test            # vitest run
pnpm ops:seed-dev    # representative dev inventory
pnpm ops:expire-stale
pnpm db:reset        # local Supabase reset
pnpm db:types        # regenerate database types
```

Environment variable names (values are never committed): `NEXT_PUBLIC_APP_URL`; Clerk `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`; Supabase `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; Stripe `PAYMENTS_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_HOST_BASELINE`, `STRIPE_PRICE_ADDITIONAL_LISTING`; email `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL`, `EMAIL_OUTBOX_SCHEMA_READY`, `OUTBOUND_EMAIL_ENABLED`; ingestion `INGESTION_ENABLED`, `ANTHROPIC_API_KEY`, `INGEST_EXTRACTION_MODEL`; observability `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`; plus `CRON_SECRET` for scheduled routes and `CSP_ENFORCE` for the enforcing CSP mode.

## Repository layout

```
app/            App Router pages + API routes (seeker, host, admin, cron, webhooks)
components/     UI components (dashboards, swipe deck, queues, forms, shells)
lib/            Domain logic: sweep-routine, gamification, billing, email, ingestion, db
supabase/       41 SQL migrations (schema, RLS, functions, hardening)
scripts/        Ops + guardrail scripts (smoke, seeding, theme sync, Stripe safety)
docs/           Launch runbook, governance, review checklists, provisioning runbooks
.github/        CI, CodeQL, dependency review, production smoke, agent routing
```

See `AGENTS.md` for the binding contributor contract and `docs/LAUNCH_RUNBOOK.md` for go-live procedure.
