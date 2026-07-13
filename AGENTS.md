# Sweepza — Agent and Contributor Contract

This contract binds human and automated contributors. Read it before inspecting or changing the repository. The approved Notion canon is product truth; this repository and its GitHub artifacts are implementation truth. Record and reconcile any gap between them.

## 1. App purpose

Sweepza is a sweepstakes and giveaway discovery and management platform. The domain is legal- and compliance-sensitive: eligibility, entry mechanics, prize claims, disclosures, host rights, and money flows must remain explicit and reviewable. Current production users and customers: **none**.

One canonical `listing` object must drive cards, details, Discover, host and owner surfaces, Winner Wall attachments, sharing, and analytics. Seeker-specific state belongs in `listing_seeker_state`, never on `listing`.

## 2. Business vision

Build a trustworthy, mobile-first marketplace in which authorized hosts submit and manage legitimate giveaways and seekers can understand entry and eligibility without dark patterns. Controlled taxonomies, transparent lifecycle state, and server-enforced permissions are product fundamentals.

Do not scrape or repost giveaways. External giveaway pages may be lawful prospect or research inputs only; they are not marketplace inventory and may not be published without host submission, rights, provenance, and the required review.

The build order keeps the canonical listing object and listing card ahead of billing, Winner Wall expansion, or host analytics. Legal, payment, and prize-promotion gates take precedence over feature momentum.

## 3. Current rollout status

Snapshot: **2026-07-12**. Status: **next · active · blocked**. There are **no open PRs** and **zero production customers/users** at this snapshot. Refresh current branch, HEAD, PR, issue, acceptance-criteria, ownership, and rollout data before acting. Do not inflate zero-customer/user status or treat this snapshot as current without checking.

Known blockers are production using Clerk development mode; incomplete preflight/current-main Preview evidence; foreign Explore&Earn Stripe residue; a separate Sweepza email activation and capacity path; and missing rollback, data, and telemetry proof.

## 4. Branch naming rules

Before work, record `git status -sb`, the current branch and HEAD, open PRs, the issue and acceptance criteria, and artifact ownership. One agent owns one task, one branch, and one artifact set at a time. Hand off through durable repo artifacts such as issues, PRs, and documentation.

- Agent work: `agent/<scope>-<short-description>`
- Normal feature work: `feat/<lane>/<slug>`
- Fixes: `fix/<lane>/<slug>`
- Documentation: `docs/<lane>/<slug>`
- Chores: `chore/<lane>/<slug>`

Lane keys remain A Foundation, B Data/Auth/Permissions, C Card System, D Seeker Experience, E Host Experience, F Winner Wall, G Billing/Entitlements, H Observability, and I QA/Review.

Use kebab case. Implementing agents/builders never direct-push `main`, merge their own PRs, delete unmerged branches, rewrite history, force-push, or overwrite another agent’s lane or artifact. A designated maintainer or approved automation may merge after independent review and green required checks, then delete the merged branch. Keep PRs small and tied to a documented spec, issue, and acceptance criteria. The stale claim that Codex is retired is not policy and must not be reintroduced.

## 5. Required checks before PR

Run from the repository root and report the exact command and result:

```text
pnpm install --frozen-lockfile
pnpm validate
git diff --check
```

Run focused tests for every non-trivial change. Include screenshots and accessibility evidence for UI work. If a check cannot run, report why; do not describe an unrun check as passing.

## 6. Forbidden actions

- Do not scrape or repost external giveaways or turn prospect/research inputs into inventory without rights and host submission.
- Do not launch live paid campaigns, entries tied to consideration, subscriptions or charges, or prize promotions without explicit legal and payment approval.
- Do not bypass the canonical listing object, store seeker state on listings, create free-text alternatives to controlled taxonomies, weaken RLS, or rely on client-only authorization.
- Do not build billing, Winner Wall expansion, or host analytics ahead of the listing card and canonical object.
- Do not delete live data, drop schemas, bypass review, deploy, alter domains/DNS, expose secrets, or perform unscoped production mutations.

## 7. Provider no-touch zones

Doppler, Vercel, Supabase, Clerk, Stripe, Resend and DNS, Mapbox, Cloudinary, PostHog, Sentry, and all provider-specific resources are no-touch unless the task explicitly approves the exact action. No deploy, environment, domain, DNS, secret, live migration or SQL, auth, storage, product, price, webhook, email, or telemetry writes are authorized by ordinary repository work.

Sweepza's approved payment surface is host subscription billing. Stripe Connect and payouts are not approved scope and must not be introduced without a dated legal/payment decision. Foreign Explore&Earn Stripe configuration or residue must not be reused or “cleaned up” without a separately approved provider task.

`support@sweepza.com` is owned, but ownership is not activation or sending authority. Sweepza requires a separate Resend/email path; never reuse another venture’s sender, account, domain, credentials, capacity, or reputation path.

## 8. Data, money, email, and auth guardrails

Never use or expose secrets, live data, private user or customer data, real money, real email, or production auth. Use fixtures and non-production resources only when the task explicitly permits them.

- **Data:** Preserve the canonical listing model, controlled dictionary registry, and server-enforced Supabase RLS keyed to Clerk identity. No live SQL, migration, storage, customer-data, entitlement, moderation, or visibility mutation without approval.
- **Money and prizes:** No live payments, consideration-linked entries, subscription or campaign charges, prize promotion, product/price creation, Connect action, payout, refund, or webhook change without legal and payment approval.
- **Email:** No production sending, sender/domain activation, DNS change, recipient import, or capacity change. A dedicated Sweepza Resend path and approved consent, suppression, and reply handling are required.
- **Auth:** Production currently uses Clerk development mode. Do not activate production Clerk or mutate users, roles, RLS identity mapping, permissions, or sessions without approval and evidence.

Public access must remain limited to public/active listings and published Winner posts. Hosts may manage only their own listings and may not write moderation, verification, or featured fields. Seekers may manage only their own state and Winner Wall posts.

## 9. Design notes

Preserve the current mobile-first, card-first, accessible interface and Phosphor semantic icon system. Avoid incidental redesign or a competing component/icon library.

- Maintain semantic HTML, labels, `aria-current`, visible focus states, contrast, and 44px-or-larger touch targets; never rely on hover alone.
- Preserve the one-card/one-canonical-listing composition across surfaces.
- Use controlled taxonomies for category, tag, badge, eligibility, entry frequency, report reason, reaction, and source label; hosts select values and do not invent taxonomy.
- Keep strict TypeScript and server-enforced permissions. Add per-route metadata, Open Graph data, canonical URLs, and semantic headings where relevant.

The pinned baseline remains Windows 11 ARM64 → WSL2 Ubuntu 24.04, Node 24.16.0, pnpm 10.12.4, and TypeScript end to end. CI routes through the organization reusable workflow. Runtime, provider, or architectural alternatives require an explicit dated decision.

## 10. Current known PRs and blockers

As of **2026-07-12**, there are no open PRs. Re-check before starting or reporting work.

Known blockers are Clerk development mode in production; incomplete preflight and current-main Preview proof; foreign Explore&Earn Stripe residue; separate Sweepza email activation and capacity; and rollback, data, and telemetry evidence. Zero production users/customers is the current baseline and must not be presented otherwise.

## 11. Output format for future agents

Every handoff or PR report must include:

- branch and HEAD;
- scope, owned artifacts, and files changed;
- exact commands run and their results;
- explicit provider/live actions (`none` normally);
- data, money, email, and auth impact;
- screenshots and accessibility evidence for UI work;
- risks, blockers, assumptions, and unrun checks; and
- PR URL, or `none` with the reason.
