# Sweepza — Agent & Contributor Guide

This file is binding for every contributor, human or AI (Copilot or Claude). Read it before writing code.

## Source of truth

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
