<!-- ae-control-plane v1 (2026-07-16). Machine operating contract; product docs follow below. -->
# Operating contract — Automated Empires control plane

- **Canonical clone (the ONLY writable copy):** WSL `Ubuntu-24.04-Recovered` → `/home/jackson/automatedempires/ventures/sweepza`.
  Never clone this repository anywhere else on the machine. Parallel work uses controlled
  worktrees: `ae start sweepza -t <task> -a <agent> --worktree`.
- **Sessions:** acquire the single-writer lease first (`ae start sweepza -t <task> -a <agent>`);
  end with `ae finish sweepza`. Work counts as done ONLY when pushed and remote-SHA-verified.
- **Deploys:** merging `main` auto-deploys production via Vercel — **LIVE at sweepza.com**.
- **Validate before merge:** `pnpm typecheck && pnpm lint` (CI must be green; squash merges).
- **Providers (fixed — never swap or cross-wire):** db=supabase, auth=clerk, email=resend (sender isolation — OWN identity, never E&E's), storage=none (Sweepza has no Cloudinary account, code, or env — the previous "own account/env" claim was false; corrected 2026-07-18), ai=anthropic (ingestion extraction, claude-opus-4-8).
- **LOCKED:** Sweepza is FULLY INDEPENDENT from Explore & Earn — no shared Stripe/Resend/Supabase resources, ever
- **LOCKED:** Launch gate: NO-GO until 6 founder decisions are made — CI-green code is not launch permission
- **LOCKED:** Theme: tokenized day/night hybrid (auto by local clock, dark 8pm-6am) — edit app/tokens.css only
- **Warn before:** MERGING TO MAIN DEPLOYS sweepza.com
- **Warn before:** activating ingestion crons (needs founder env + per-source compliance approval)
- **Warn before:** sending email
- Full policy: `github.com/AutomatedEmpires/ae-control` → `POLICY.md`. Briefing: `ae info sweepza`.

---

# Sweepza — Agent & Contributor Guide

This file is binding for every contributor, human or AI (Copilot or Claude). Read it before writing code.

## The machine & runtime (pinned — do not drift)

Sweepza is one app in the AutomatedEmpires venture system; **Explore&Earn (E&E) is the reference implementation**. All apps share one machine, one runtime, and one integration spine so an agent moving between repos reads one contract.

- **Machine:** Windows 11 ARM64 (Snapdragon X Elite) → WSL2 Ubuntu 24.04 → VS Code. Working path `/home/jackson/automatedempires/ventures/sweepza`. 16 GB RAM — **one agent at a time**; do not assume parallel heavy builds or long-running watchers.
- **Runtime (pinned):** Node **24.16.0** (`.nvmrc`) · pnpm **10.12.4** (`packageManager`) · TypeScript end-to-end. Any version change requires a dated decision in the locked Notion canon.
- **Integration spine (cross-app standard — do not introduce alternates without a dated decision):** Secrets = Doppler · Hosting = Vercel · Database = Supabase Postgres (+ PostGIS) · Auth = Clerk · Maps = Mapbox · Payments = Stripe Connect · Media = Cloudinary if Sweepza adopts media (current storage is `none`) · Observability = PostHog + Sentry · Icons = Phosphor (semantic registry in components/icon.tsx) · Email = Resend.
- **CI & agent routing:** CI runs through the org reusable workflow (`.github/workflows/ci.yml` → `AutomatedEmpires/.github` reusable-ci). Agent routing (build-task router, PR agent router/dispatch) mirrors E&E. Notion decides product truth; this repo decides implementation truth.

## Source of truth

**Doctrine: Notion decides and builds. GitHub reviews and ships. Figma shows. Everything else runs.** The bulk of the build — specs, data model, copy — is authored in the locked Notion canon first; this repo validates, reviews, and ships it.

The **locked Notion canon** is authoritative. This repo implements it; it does not redefine it. Where code and canon disagree, the canon wins. The canonical specs are: Locked Product Doctrine, Audit Response & Decision Locks, Canonical Listing Object, Canonical Data Model & RLS, Listing States & Quality Gate, Trust/Verification & Badge Naming, Billing & Entitlements, Analytics Event Dictionary, Notification Matrix, Legal & Disclosure Registry, and Controlled Dictionaries & Taxonomy Governance.

## Core rule (no exceptions)

No one codes from vague ideas. Every slice moves through:

**Spec → Acceptance Criteria → Branch → Implementation → PR → Review → CI → Merge → Deploy → Notion status update.**

- One feature branch per slice: `feat/<lane>/<slug>` (e.g. `feat/card-system/listing-card`).
- Open a PR against `main`. Reference the issue and its acceptance criteria.
- Nothing merges to `main` without a PR + at least one independent review (**Claude** primary, **Copilot** secondary) + green CI. The builder is not the sole approver. **Codex was retired 2026-06-06.**
- Squash-merge only. Merged branches are auto-deleted.

## Architectural law

- **One canonical `listing` object** drives card, detail, Discover, host area, owner area, Winner Wall attachment, sharing, and analytics. Never create parallel listing models for seeded vs. host vs. card.
- Seeker-specific state lives in `listing_seeker_state`, never on `listing`.
- **Controlled values** (category, tag, badge, eligibility, entry_frequency, report_reason, reaction, source_label) come from the dictionary registry — never free text. Hosts select; they never create taxonomy.
- Keep it boring, clear, stable. Polish comes from a clean object model, not a complex stack.

## Security & access (server-enforced)

- Roles are enforced via Supabase **RLS** keyed on Clerk identity. Client-side role checks are advisory only.
- Seekers can manage only their own seeker state and their own Winner Wall posts.
- Hosts can manage only their own listings; they cannot write moderation/verification/featured fields.
- Hosts must never post Winner Wall content as advertising.
- Public users see only `visibility_status = public` and `lifecycle_status = active` listings, and only `published` Winner posts.
- The active-listing entitlement cap (≤10) is enforced in the database, never client-side.
- **Never commit secrets.** All keys live in GitHub Actions secrets and Vercel env, referenced through `lib/env.ts`.

## Quality bar

- TypeScript strict. Mobile-first. Accessible (semantic HTML, labels, `aria-current`, focus states, color-contrast).
- SEO: per-route metadata, Open Graph, canonical URLs, semantic headings.
- Touch: 44px+ targets, no hover-only affordances.
- CI (lint + build) must pass. Add tests for non-trivial logic.

## Lanes

A Foundation · B Data/Auth/Permissions · C Card System · D Seeker Experience · E Host Experience · F Winner Wall · G Billing/Entitlements · H Observability · I QA/Review. One lane owns a slice; adjacent lanes review but do not overwrite.

## Build order guardrail

Do not build billing, Winner Wall, or host analytics before the listing card and canonical listing object are solid.
