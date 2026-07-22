# Sweepza

**Sweepstakes | Simplified.** The consumer operating system for discovering, organizing, entering, re-entering, tracking, and winning legitimate sweepstakes — free for seekers, funded by hosts.

- **Domain:** sweepza.com
- **Stack:** Next.js (App Router) + React + TypeScript, Supabase (Postgres + RLS + Storage), Clerk (auth), Stripe (billing), Resend (email), PostHog (analytics), Sentry (errors), Vercel (hosting). Icons: Phosphor via the semantic registry in `components/icon.tsx`.
- **Source of truth:** the locked Notion canon. See `AGENTS.md` for the rules every contributor (human or AI) must follow.

## Product surfaces

- **Today** (`/`) — the daily habit surface: Ready Again, Ending Today, Saved-not-entered, New since last visit, recent activity. Editorial variant when signed out.
- **Discover** (`/discover`) — one discovery system: feed and swipe modes, full-text search (`?q=`), shared chips/filters/sort.
- **My Sweeps** (`/my-sweeps`) — the seeker control center: Ready, Saved, Entered, Ready Again, Ending Soon, Won, Skipped, computed by `lib/sweep-routine.ts` over `listing_seeker_state` (signed-in) or localStorage (signed-out).
- **Winners** (`/winners`) — real winner posts, reactions, submissions.
- **Profile** (`/profile`) — account hub and role-aware gateway to host (`/host`) and admin (`/admin`) tools.

## Getting started

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` and fill in values. Without Clerk keys the app runs in local mode (device-only seeker state). Useful ops scripts: `pnpm ops:seed-dev` (representative dev inventory), `pnpm ops:expire-stale` (expire active listings past their end date).

## Going live — required environment

Set these in Vercel (or the deploy target) before launch. The app degrades
gracefully when a group is missing (local mode / billing disabled), but a
production deploy needs all of them:

| Group | Vars | Notes |
| --- | --- | --- |
| App | `NEXT_PUBLIC_APP_URL` | Canonical origin; Stripe redirects require it. |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | Webhook endpoint: `/api/webhooks/clerk`. |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Service role stays server-only. |
| Payments | `PAYMENTS_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_HOST_BASELINE`, `STRIPE_PRICE_ADDITIONAL_LISTING` | No production provider is approved. `STRIPE_ACCOUNT_ID` binds credentials to the reviewed Sweepza account but does not activate payments. Keep `PAYMENTS_ENABLED` unset; only the literal `"true"` authorizes customer creation, Checkout, portal sessions, and webhook mutation. Never use another venture's Stripe account. |
| Email | `EMAIL_OUTBOX_SCHEMA_READY`, `OUTBOUND_EMAIL_ENABLED`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL` | No provider is approved. Apply and verify the durable outbox migrations before setting the schema-ready gate. Keep the separate outbound activation gate unset. From and Reply-To must both be explicit Sweepza-owned identities. |
| Observability | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Auth token is build-time (source maps). Stripe webhook failures are reported to Sentry — watch that project during the first live checkout. |

Pre-launch data step: purge dev inventory with
`delete from listing where sponsor_notes_internal = 'dev-seed';` and schedule
`pnpm ops:expire-stale` (e.g. Vercel cron) so ended listings leave live
inventory automatically.

Scheduled jobs (`vercel.json` crons, authorized with `CRON_SECRET`):

| Cron | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/expire-stale` | daily 06:10 UTC | Expire active listings past their end date. |
| `/api/cron/seeker-reminders` | daily 14:00 UTC | Claims one bounded, acknowledged seeker-scan wave and creates at most one durable digest per seeker/UTC day. It is database-free until both email gates are ready. |

`/api/cron/email-deliveries` is implemented but intentionally unscheduled and
dormant until a dedicated Sweepza provider is configured and separately
activated. Provider calls still require the literal
`OUTBOUND_EMAIL_ENABLED="true"` gate.

## Build pipeline

Every change follows: **Spec → Acceptance Criteria → Branch → Implementation → PR → Review (Claude / Copilot + CI) → squash-merge → deploy**. Nothing lands on `main` without a PR and a green quality gate. See `AGENTS.md`. Validate locally with `pnpm validate` (lint + typecheck + test + build).
