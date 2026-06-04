# Sweepza — Agent Operating Contract

> **Binding contract for every agent (human or AI: Copilot, Claude, Codex) that touches this repo. Read it fully before doing anything.**
> Aligned to the Explore&Earn (E&E) doctrine. Sweepza is one of the AutomatedEmpires apps; E&E is the reference implementation.

## 0 · Prime doctrine
**Notion decides. GitHub builds. Figma shows. Everything else runs.**

- **Notion** = product & vision truth (what we build and why). The locked Notion canon is authoritative; this repo implements it and does not redefine it.
- **This repo** = implementation truth (how it is actually built).
- Product/vision conflict → Notion decides. Implementation conflict → this repo decides.

The canonical specs are: Locked Product Doctrine, Audit Response & Decision Locks, Canonical Listing Object, Canonical Data Model & RLS, Listing States & Quality Gate, Trust/Verification & Badge Naming, Billing & Entitlements, Analytics Event Dictionary, Notification Matrix, Legal & Disclosure Registry, and Controlled Dictionaries & Taxonomy Governance.

## 1 · What Sweepza is
A sweepstakes / giveaway product. Map-free, mobile-first, card-first. See `README.md` and `docs/` for the canonical spec.

## 2 · The machine (where this is built)
All AutomatedEmpires apps are built on ONE machine. Assume exactly:
- Windows 11 ARM64 (Snapdragon X Elite) → WSL2 Ubuntu 24.04 → VS Code
- Working path: `/home/jackson/automatedempires/ventures/sweepza`
- 16 GB RAM. **One agent at a time** — do not assume parallel heavy builds or long-running watchers.

## 3 · Runtime (pinned — do not drift)
- Node **24.16.0** (`.nvmrc`)
- pnpm **10.12.4** (`packageManager` in `package.json`)
- **Repository shape: flat single Next.js app — intentional, recorded exception.** Sweepza is NOT a Turborepo monorepo today. It has a single web surface, so it stays a flat app (`app/`, `components/`, `lib/`). E&E and BidSpace are Turborepo monorepos because they run multiple surfaces. Convert Sweepza to a Turborepo monorepo ONLY when it gains a second surface (mobile, a separate API, or a shared package). This exception is recorded in the `AutomatedEmpires — Ventures` family standard in Notion.
- Any version or shape change requires a new dated decision in `docs/DECISIONS.md`.

## 4 · Integration spine (cross-app standard)
Shared providers across all AutomatedEmpires apps. Do not introduce alternates without a dated decision.

| Concern | Provider |
|---|---|
| Secrets | Doppler |
| Hosting | Vercel |
| Database | Supabase Postgres |
| **Auth** | **Clerk** (standardized across all apps; Supabase RLS is keyed on Clerk identity) |
| **Maps** | **Mapbox** (cross-app standard) — *N/A for Sweepza: no map surface* |
| Payments | Stripe |
| Media | Cloudinary |
| Observability | PostHog + Sentry |
| Icons | Streamline — **Sweepza uses Freehand (Pro)** |
| Language | TypeScript end-to-end |
| Surfaces | Web: Next.js |

**Icon policy (per-app):** Sweepza and Explore&Earn use **Streamline Freehand (Pro)**; LogLoads and BidSpace use a more formal Streamline style. One Streamline style per app, applied consistently — never mix styles within an app, and no Lucide / Heroicons / Font Awesome / Material.

## 5 · Core rule (no exceptions)

No one codes from vague ideas. Every slice moves through:

**Spec → Acceptance Criteria → Branch → Implementation → PR → Review → CI → Merge → Deploy → Notion status update.**

- One feature branch per slice: `feat/<lane>/<slug>` (e.g. `feat/card-system/listing-card`).
- Open a PR against `main`. Reference the issue and its acceptance criteria.
- Nothing merges to `main` without a PR + at least one independent review (Copilot/Claude/Codex) + green CI. The builder is not the sole approver.
- Squash-merge only. Merged branches are auto-deleted.

## 6 · Architectural law

- **One canonical `listing` object** drives card, detail, Discover, host area, owner area, Winner Wall attachment, sharing, and analytics. Never create parallel listing models for seeded vs. host vs. card.
- Seeker-specific state lives in `listing_seeker_state`, never on `listing`.
- **Controlled values** (category, tag, badge, eligibility, entry_frequency, report_reason, reaction, source_label) come from the dictionary registry — never free text. Hosts select; they never create taxonomy.
- Keep it boring, clear, stable. Polish comes from a clean object model, not a complex stack.

## 7 · Security & access (server-enforced)

- Roles are enforced via Supabase **RLS** keyed on Clerk identity. Client-side role checks are advisory only.
- Seekers can manage only their own seeker state and their own Winner Wall posts.
- Hosts can manage only their own listings; they cannot write moderation/verification/featured fields.
- Hosts must never post Winner Wall content as advertising.
- Public users see only `visibility_status = public` and `lifecycle_status = active` listings, and only `published` Winner posts.
- The active-listing entitlement cap (≤10) is enforced in the database, never client-side.
- **Never commit secrets.** Values live in Doppler; CI uses GitHub Actions secrets and Vercel env, referenced through `lib/env.ts`.

## 8 · Quality bar

- TypeScript strict. Mobile-first. Accessible (semantic HTML, labels, `aria-current`, focus states, color-contrast).
- SEO: per-route metadata, Open Graph, canonical URLs, semantic headings.
- Touch: 44px+ targets, no hover-only affordances.
- CI (lint + build) must pass. Add tests for non-trivial logic.

## 9 · Lanes

A Foundation · B Data/Auth/Permissions · C Card System · D Seeker Experience · E Host Experience · F Winner Wall · G Billing/Entitlements · H Observability · I QA/Review. One lane owns a slice; adjacent lanes review but do not overwrite.

## 10 · Build order guardrail

Do not build billing, Winner Wall, or host analytics before the listing card and canonical listing object are solid.

## 11 · GitHub management
- Work on lane/feature branches → small PRs → review → merge. Never push straight to `main`.
- CI (`.github/workflows/ci.yml`) runs lint + build on every PR; keep it green.
- Communicate through durable artifacts: issues, PRs, and `docs/` are the memory.
- Respect founder gates: anything money-moving, legally binding, destructive, or schema-breaking waits for explicit founder sign-off.

## 12 · Cross-app alignment
E&E is the reference. Sweepza, BidSpace, and E&E share the same doctrine, machine, runtime, and integration spine so an agent moving between repos reads one contract. Differences are product scope and repository shape (Sweepza is intentionally flat) only — never workflow.
