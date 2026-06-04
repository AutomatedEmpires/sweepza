# Agent Alignment Notes — Sweepza

> **Date:** 2026-06-03 · **Author:** Teach (founder's Notion agent) · **Branch:** `feat/foundation/node24-runtime-align`
> Handoff note for every agent working on Sweepza, BidSpace, or Explore&Earn. Read this alongside the existing `AGENTS.md` (which remains the binding contract for Sweepza).

## The system you are part of
Three apps — **Explore&Earn (E&E)**, **BidSpace**, **Sweepza** — are built by one founder (Jackson / "Caveman") under the **AutomatedEmpires** GitHub org, coordinated through Notion. They run as one venture system with **one shared doctrine, one machine, one runtime, and one integration spine.** Only product scope differs.

**E&E is the reference implementation.** When in doubt about workflow, runtime, or repo conventions, copy E&E.

## Prime doctrine
**Notion decides. GitHub builds. Figma shows. Everything else runs.**
- Notion = product & vision truth. This repo = implementation truth.
- Sweepza's existing `AGENTS.md` already states this ("locked Notion canon is authoritative"). No change to that contract.

## The machine (all three apps build here)
- Windows 11 ARM64 (Snapdragon X Elite) → WSL2 Ubuntu 24.04 → VS Code.
- Path: `/home/jackson/automatedempires/ventures/<app>`.
- **16 GB RAM — one agent at a time.** No parallel heavy builds / long watchers. Claude Code is installed but not subscribed; do not assume it.

## Runtime (pinned across all apps)
- Node **24.16.0** (`.nvmrc`) · pnpm **10.12.4** (`packageManager`).
- Sweepza stays a **single Next.js app** (Next 15 / React 19), NOT a Turborepo monorepo. Do not add `turbo.json` / `pnpm-workspace.yaml` — that is E&E/BidSpace structure, not Sweepza's.
- Version changes require a decision recorded in the Notion canon / repo.

## Integration spine (cross-app standard)
Secrets via GitHub Actions + Vercel env (referenced through `lib/env.ts`) · Hosting **Vercel** · DB **Supabase Postgres + RLS + Storage** · **Auth = Clerk** · Payments **Stripe** · Analytics **PostHog** · **TypeScript** · **Next.js (App Router)**.
- **Maps:** none today. If geospatial is ever needed, the cross-app standard is **Mapbox** (do not introduce Google/Azure maps).
- **Auth is already Clerk** — Sweepza is on-standard. Nothing to migrate.

## Flows / how we work (already in AGENTS.md, restated)
- Spec → Acceptance Criteria → Branch (`feat/<lane>/<slug>`) → Implementation → PR → Review (Copilot/Codex; Claude when available) → CI → squash-merge → deploy → Notion status update.
- Never push to `main`. Builder ≠ approver. Secrets never committed.

## What this PR changed (and why)
1. **Added `.nvmrc` = `24.16.0`** — Node was unpinned; now matches E&E/BidSpace.
2. **`package.json`** — `packageManager` pnpm `9.12.0` → **`10.12.4`**, added **`engines.node` exact `24.16.0`** (not a floor), and bumped **`@types/node` → `^24`** to match the runtime. **All app dependencies (Next/React/Tailwind/zod/eslint/TS) were left unchanged.**
3. **Added `.mcp.json`** — Notion MCP server, so in-repo agents reach product truth.
4. **Added this note** — cross-app context + machine + spine.

## What did NOT change (important)
- **`AGENTS.md`, `CLAUDE.md`, `README.md` were left intact** — they are already strong and on-doctrine. This pass is additive only.
- **No monorepo scaffolding** was added — Sweepza is intentionally a single Next.js app.
- **Auth/maps:** already compliant (Clerk; no maps). The auth/maps outlier is **E&E** (Supabase Auth + Azure Maps), tracked in a separate E&E migration issue.

## Follow-ups for the next agent
- **`.env.example`** is referenced by `README.md` but not committed. Add it (Clerk, Supabase, Stripe, PostHog, Vercel keys) using the exact variable names from `lib/env.ts`. (Skipped here to avoid guessing var names.)
- **CI workflow:** the connected GitHub app lacks the `workflows` permission, so I could not add/modify `.github/workflows`. Confirm CI runs lint + build + typecheck on PRs; add it if missing.
- After bumping pnpm to 10.12.4, run `pnpm install` to refresh the lockfile and confirm CI is green before merge.
