# Sweepza

**Sweepstakes | Simplified.** A fast, photo-first, mobile-first way to discover sweepstakes worth entering, and a lightweight tool for hosts to post them.

- **Domain:** sweepza.com
- **Stack:** Next.js (App Router) + React + TypeScript, Supabase (Postgres + RLS + Storage), Clerk (auth), Stripe (billing), PostHog (analytics), Vercel (hosting).
- **Source of truth:** the locked Notion canon. See `AGENTS.md` for the rules every contributor (human or AI) must follow.

## Getting started

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` and fill in values as each lane comes online. The Phase 1 shell runs with no secrets.

## Build pipeline

Every change follows: **Spec → Acceptance Criteria → Branch → Implementation → PR → Review (Copilot / Claude / Codex + CI) → squash-merge → deploy**. Nothing lands on `main` without a PR and a green quality gate. See `AGENTS.md`.

## Status

Phase 1 (foundation) is live. Remaining lanes are tracked as GitHub issues, ordered by the MVP Build Order.
