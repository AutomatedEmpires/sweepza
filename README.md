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

## Build pipeline

Every change follows: **Spec → Acceptance Criteria → Branch → Implementation → PR → Review (Claude / Copilot + CI) → squash-merge → deploy**. Nothing lands on `main` without a PR and a green quality gate. See `AGENTS.md`. Validate locally with `pnpm validate` (lint + typecheck + build).
