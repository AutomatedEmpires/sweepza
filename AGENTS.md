# Sweepza — agent operating contract

This contract binds human and automated contributors. Read it before changing the repository. The approved venture direction is product truth; this repository and its GitHub artifacts are implementation truth. Record and reconcile gaps explicitly instead of preserving stale positioning by accident.

## 1. Venture thesis, buyer, and destination

Sweepza is **boring, trustworthy B2B giveaway-campaign infrastructure for businesses**. It should help a sponsor, brand, agency, or campaign operator intake a promotion, assemble the compliance evidence, publish only after review, manage eligibility and entries, select and document a winner, and retain an auditable campaign record.

- **Primary user:** the business operator coordinating a giveaway across marketing, operations, support, and legal review.
- **Primary buyer:** the sponsoring business, brand, agency, or promotion vendor that needs repeatable compliant campaign operations.
- **Secondary user:** the entrant who needs clear official rules, eligibility, a no-purchase entry route, understandable status, and fair treatment.
- **Product destination:** a B2B campaign workspace with vendor onboarding, structured campaign intake, a sponsor checklist, versioned official-rules workflow, eligibility and entry-method tracking, winner-selection controls, approvals, evidence, and audit history.

The current README and several older surfaces describe a consumer discovery operating system. Treat those as implementation history, not the dominant product direction. Reuse sound listing, auth, RLS, billing, and audit primitives where useful, but do not optimize the venture around consumer aggregation, habit loops, or speculative traffic.

## 2. Current stage and zero-user posture

As of **2026-07-12**, Sweepza has **zero real users, zero real customers, and zero approved live campaigns**. The portfolio has no user or customer activity to preserve here. Existing database business tables are empty apart from administrative setup, and the repository’s campaign-like content is fixture/demo material.

The codebase has meaningful product surfaces, a dedicated Supabase project, protected Preview evidence, a dedicated Stripe sandbox with unpaid Checkout proof, and dedicated PostHog proof. It is still **NO-GO** for broad Production users, live money, email activation, or public campaigns. A green build or fixture workflow is engineering evidence, not customer validation or legal clearance.

Use the zero-user stage to move quickly with synthetic vendors, test campaigns, disposable identities, protected previews, additive dev/Preview migrations, sandbox billing, and simulated winner selection. Do not overprotect mock consumer flows or seed inventory at the expense of the B2B operating path.

## 3. Execution doctrine and default authority

Agents are expected to **ship meaningful, tested changes, not produce endless audits** that restate known gaps. Prefer an end-to-end boring workflow over a polished fragment: structured intake → checklist → rules review state → protected preview → evidence → handoff. Keep the work on a reversible branch.

Without founder approval, agents may perform reversible, non-destructive work within assigned scope, including:

- application code, tests, UI, accessibility, docs, refactors, and developer tooling;
- dependency, security, CI, and observability improvements that do not retire credentials or destroy resources;
- protected Preview deployments and rollback rehearsals;
- local, disposable, development, and Preview migrations plus synthetic test data;
- vendor, sponsor, campaign, entrant, and winner-selection fixtures using fictional identities;
- isolated Clerk sign-up, role, webhook, recovery, and RLS tests with disposable users;
- Stripe sandbox products, prices, Checkout, webhooks, and unpaid test transactions;
- internal transactional-email tests to controlled recipients through a dedicated Sweepza path; and
- scoped non-production Supabase, Clerk, Stripe, Resend, PostHog, Sentry, Doppler, and Vercel configuration needed to prove the change.

Use the least risky environment that can answer the question. Keep provider mutations traceable, isolated to Sweepza, and reversible. Investigate repository evidence and run a safe proof before escalating an ordinary engineering choice.

## 4. True hard stops

Stop and obtain explicit founder authorization only for:

- a paid provider plan upgrade;
- a domain purchase or DNS cutover;
- live-money mode, a real charge, refund, payout, subscription, invoice, or other real financial movement;
- destructive deletion of a provider project, deployment, environment, bucket, endpoint, or equivalent resource;
- a destructive Production database migration or destructive live-data operation;
- credential rotation or revocation;
- repository, domain, account, project, or other ownership transfer;
- a public launch announcement or removing protection in a way that constitutes public launch;
- an ad buy, public marketing campaign, or live giveaway campaign;
- a legal filing on the venture’s behalf; or
- any action blocked by MFA when the authorized human is unavailable.

If a hard stop is encountered, complete the draft, branch implementation, test data, sandbox rehearsal, rollback plan, or evidence up to that boundary and report the exact authorization needed. Do not turn additive schemas, test-mode billing, legal-review status fields, ordinary auth work, or reversible provider configuration into generic founder gates.

## 5. Compliance product contract

Every campaign workflow must make these items explicit, structured, and reviewable:

- sponsor and any administrator/vendor identity, authority, contacts, and responsibilities;
- promotion purpose, jurisdictions, opening/closing times, prize details and value, quantity, fulfillment owner, and material restrictions;
- official-rules draft, version, effective state, review history, approved publication copy, and stable evidence of what entrants saw;
- a no-purchase entry method and any alternate method of entry, with equal eligibility treatment and no consideration required;
- country/state, age, exclusion, employee/household, residency, and other eligibility rules;
- entry methods, limits, frequency, validation, duplicate/fraud handling, privacy disclosures, consent, and retention;
- winner-selection method, eligible pool snapshot, randomness or judging criteria, operator, timestamp, audit evidence, alternates, notification, verification, and prize fulfillment; and
- sponsor checklist, internal approvals, qualified legal-review status, launch gate, incident/report handling, and closeout/retention state.

Official rules govern the promotion. Product summaries must not contradict or silently weaken them. Rules, eligibility, entry methods, prize facts, and selection settings need version history rather than destructive overwrite. Simulated winner selection may use synthetic entrants; never represent a fixture winner as real.

Every public campaign requires qualified legal review of its official rules, eligibility, entry mechanics, disclosures, privacy treatment, winner process, and relevant jurisdictional requirements before launch. Repository agents may build the workflow and draft operational copy, but must not claim attorney approval or make legal conclusions unsupported by reviewed evidence.

## 6. Product priorities

Prefer work in this order unless the assigned issue says otherwise:

1. Build the boring B2B path: business/vendor onboarding, roles, ownership, contacts, and status.
2. Establish a structured campaign-intake schema and operator UI with complete sponsor, prize, jurisdiction, eligibility, entry, timing, and fulfillment fields.
3. Build the sponsor checklist and versioned official-rules workflow, including clear missing-evidence and legal-review gates.
4. Support and test no-purchase entry, alternate entry methods, eligibility evaluation, entry limits, and a durable audit trail.
5. Implement simulated, test-data winner selection with reproducible evidence, alternates, notification states, verification, and fulfillment tracking.
6. Prove host/operator/admin boundaries through Clerk, Supabase RLS, disposable identities, and recovery flows.
7. Use Stripe sandbox only to prove business subscription/entitlement behavior; do not create live paid campaigns.
8. Establish a dedicated Sweepza email/Resend path and prove internal delivery, receipt, reply, bounce, suppression, and support ownership.
9. Connect and prove dedicated Sentry monitoring, then close protected Preview, rollback, security, accessibility, and production-readiness gaps.

## 7. Low-value or prohibited work

- Do not stop at inventories, generic compliance memos, speculative roadmaps, or visual polish when a safe workflow slice can be implemented and tested.
- Do not scrape, aggregate, or repost third-party giveaways. External pages may inform research or a private prospect record only; they are never publishable inventory without sponsor authority, rights, provenance, and review.
- Do not create live paid campaigns, real-money entries, consideration-linked entries, live subscriptions, charges, payouts, or prize payments.
- Do not expand consumer discovery, swipe, reminders, Winner Wall, gamification, or host analytics ahead of campaign intake, rules, eligibility, auditability, and operator proof.
- Do not use consumer-facing copy that frames Sweepza with `gambling`, `casino`, `betting`, `lottery`, `jackpot`, `win-big`, `play-to-win`, or `sweepstakes-casino` language. Keep the voice operational, credible, and businesslike.
- Do not imply that Sweepza is the sponsor, administrator, law firm, or prize provider unless a reviewed campaign contract explicitly makes that true.
- Do not fabricate sponsors, campaigns, entrants, winners, customers, legal approval, conversion, provider proof, or launch readiness.

## 8. Architecture, provider, data, and email boundaries

Never expose tokens, secret values, private URLs, cookies, private personal data, or provider recovery material in source, logs, screenshots, commits, or handoffs. Keep every provider and data path venture-specific; do not reuse another AutomatedEmpires venture’s account, credentials, domain, capacity, sender reputation, fixtures, or customer objects.

- **Canonical data:** preserve server-enforced authorization and controlled dictionaries. The existing canonical `listing` and `listing_seeker_state` split is valid for legacy surfaces, but new B2B campaign concepts should have clear ownership and audit boundaries rather than being forced into untyped listing fields.
- **Supabase:** local databases, disposable branches, synthetic fixtures, additive dev/Preview migrations, RLS tests, and forward-only corrections are allowed. Prove business/operator/admin separation with distinct identities. Do not rewrite applied Production migration history or perform destructive live-data work.
- **Clerk:** Production still uses development-family configuration and the protected dark-lane webhook/user proof is incomplete. Disposable non-production users, signed webhooks, role-denial tests, recovery, and rollback rehearsal are authorized. Roles remain database-owned and RLS-enforced, never granted through user-editable metadata.
- **Stripe:** use the dedicated Sweepza sandbox only. Sandbox catalog, unpaid Checkout, webhook, entitlement, and idempotency proofs are authorized. Keep foreign Explore&Earn residue untouched. Live money and live paid campaigns remain hard stops.
- **Email/Resend:** `support@sweepza.com` is owned, but receipt, reply, routing, retention, and recovery are not yet proven. Sweepza requires a separate Resend/account/domain/reputation path; never send through Explore&Earn’s path. Once the dedicated non-production path exists, internal allowlisted tests are authorized. Marketing or campaign sends remain a hard stop.
- **PostHog/Sentry:** use only dedicated Sweepza projects and non-sensitive synthetic events. PostHog Preview proof exists; dedicated Sentry configuration and event proof remain open. Add privacy scrubbing before broader use and never mistake test telemetry for user activity.
- **Vercel/Doppler:** protected previews, scoped environment updates, and reversible rollback rehearsals are allowed. Do not print values. A public alias/DNS cutover or public launch remains a hard stop.
- **Personal/legal data:** collect the minimum needed, separate public campaign facts from private operator/entrant/winner records, define retention and deletion behavior, redact evidence exports, and never use real entrant or winner data in development.

Public reads must expose only reviewed, active material. Businesses may manage only their own campaigns and must not self-grant approval, legal-review, moderation, featured, winner-verification, or administrative fields. Entrants may access and manage only their own private state. All privileged transitions require server enforcement and an audit event.

## 9. Design and implementation boundaries

Sweepza should feel calm, professional, legible, and intentionally unexciting where compliance is at stake.

- Prefer clear tables, checklists, states, evidence panels, warnings, and timelines over celebratory consumer mechanics.
- Preserve semantic HTML, labels, visible focus, contrast, non-color status cues, and touch targets of at least 44px.
- Keep strict TypeScript, Zod validation at inputs, server-side authorization, and focused tests for every privileged transition.
- Reuse the Phosphor semantic icon system; do not introduce a competing icon or component library.
- Controlled taxonomies must cover campaign status, eligibility, entry method, rules/review state, issue type, winner state, and evidence type. Users select valid values instead of inventing operational state through free text.

The pinned baseline is Windows 11 ARM64 → WSL2 Ubuntu 24.04, Node 24.16.0, pnpm 10.12.4, Next.js App Router, React, strict TypeScript, Supabase, and Clerk. Change runtime or core architecture only with an explicit, dated repository decision.

## 10. Branch, PR, and verification rules

Before work, record `git status -sb`, branch, HEAD, open PRs, assigned acceptance criteria, and artifact ownership. One agent owns one task, branch, and artifact set at a time. Hand off through durable issues, PRs, tests, and repository documentation.

- Agent work: `agent/<scope>-<short-description>`
- Features: `feat/<lane>/<slug>`
- Fixes: `fix/<lane>/<slug>`
- Documentation: `docs/<lane>/<slug>`
- Chores: `chore/<lane>/<slug>`

Existing lane keys are A Foundation, B Data/Auth/Permissions, C Card System, D Seeker Experience, E Host Experience, F Winner Wall, G Billing/Entitlements, H Observability, and I QA/Review. Use the closest lane until a B2B-specific lane change is deliberately documented; do not let legacy lane names drive product priority.

Use kebab case. Never direct-push `main`, force-push, rewrite shared history, merge your own PR, delete an unmerged branch, or overwrite another agent’s artifact. Keep PRs small and tied to a documented spec, issue, and acceptance criteria. A maintainer or approved automation merges after independent review and green required checks. Do not reintroduce the stale claim that Codex is retired.

Package scripts verified on **2026-07-12**:

```text
pnpm install --frozen-lockfile
pnpm validate
```

`pnpm validate` runs lint, type generation/typecheck, Vitest, and the production build. Focused commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Run the focused test first while iterating, then the full relevant gate before handoff. For UI changes, include mobile/desktop screenshots and accessibility evidence. Always run `git diff --check`. A docs-only change may use documentation-specific checks plus `git diff --check`; report any unrun application command instead of implying it passed.

## 11. Definition of done

Work is done when:

- it advances the B2B operator path or removes a concrete compliance, trust, auth, provider, or readiness blocker;
- acceptance criteria are met without unrelated consumer expansion or drive-by edits;
- schemas and UI represent sponsor, campaign, rules, eligibility, entry, review, selection, and audit state explicitly where relevant;
- privileged transitions are server-enforced and covered by focused positive and denial tests;
- `pnpm validate` and other relevant checks have fresh recorded results, or every skipped/failed check is precisely explained;
- affected UI is exercised through the real workflow with responsive and accessibility evidence;
- only fictional test data, dedicated Sweepza providers, sandbox money, and controlled internal email recipients are used;
- legal-review and public-launch gates cannot be bypassed by a business user or client-only code;
- migrations/provider changes are additive or reversible, traceable, and include cleanup/rollback evidence;
- no secrets, private URLs, personal data, scraped content, prohibited positioning, or unsupported customer/legal/readiness claims enter the diff; and
- the PR and handoff let another agent continue without private context.

## 12. Current PRs and blockers

Verified **2026-07-12 Pacific time**:

- Draft PR **#54**, `agent/docs-operating-standards` → `main`: this docs-only operating-contract work. Its current remote checks are green, but those checks do not validate later local commits.

No other PR is open. Current blockers are the consumer-to-B2B product-model gap; incomplete dark Clerk Preview, Clerk signed-webhook, role, and recovery proof; missing dedicated Sentry event proof; missing dedicated Sweepza Resend/email receipt and reply path; draft legal pages and no campaign-specific qualified legal review; residual Supabase identity-helper warnings; unproven provider recovery/rollback; and no approved live-money or public-campaign path. Zero production users/customers and zero live campaigns remain the baseline.

## 13. Future-agent handoff format

Every handoff or PR report must include:

- B2B/compliance outcome delivered and acceptance criteria addressed;
- branch, HEAD, PR number/URL or `none`, and current conflict/check state;
- files changed and owned artifacts;
- exact commands run with pass/fail/skip results;
- workflow, UI, accessibility, and denial-path evidence when relevant;
- provider actions by environment, including `none`;
- sponsor/vendor, campaign, rules, eligibility, entry, winner, legal-review, and audit impact;
- data, tenant, money, email, privacy, legal, and security impact;
- migrations, fixtures, rollback, and cleanup performed;
- assumptions, risks, blockers, and the next highest-leverage action; and
- every founder hard stop encountered and the exact authorization still required.
