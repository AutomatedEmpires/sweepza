# Sweepza Independence Preflight

Date: 2026-07-12  
Scope: Sweepza only  
Source baseline: `main` at `4c0aad183fe9442e4546985b373b26498e38e6e7`

## Executive verdict

This pass is a preflight, not a launch. Production was not promoted, live payment state was not mutated, email was not activated, DNS was not changed, and Clerk users were not migrated.

| Decision | Verdict | Reason |
| --- | --- | --- |
| Production users | **NO-GO** | Production uses Clerk development keys and the production Clerk webhook is not configured. |
| Paid hosts / money | **NO-GO** | No Sweepza-account read proof was available in this pass, no sandbox checkout proof was completed, and the replacement live webhook must precede retirement of the foreign endpoint. |
| Email activation | **NO-GO** | `support@sweepza.com` ownership is recorded, but Production reports no email integration proof and sender/capacity decisions remain open. |
| Production promotion | **NO-GO** | This pass intentionally made no promotion; auth, telemetry, migration, legal, and recovery gates remain open. |
| Transfer-readiness | **NO-GO** | Provider ownership, recovery, runbooks, secrets custody, and all launch gates are not yet evidenced as a transferable package. |

## Evidence captured

- GitHub `main` was clean at the baseline SHA above. The specified branch was created from that exact SHA.
- Vercel project `sweepza` is independent from `explore-and-earn`. Production deployment `dpl_9N57qj7PHDteARUpVFWCKAxYutts` is `READY`, targets Production, and reports the exact baseline SHA.
- Production rendered successfully at `https://sweepza.com/`. Homepage, `/discover`, `/host`, and `/my-sweeps` loaded without fatal browser errors. `/discover` truthfully showed zero matching sweeps; host and seeker surfaces showed signed-out states.
- Production browser console emitted the Clerk warning that development keys are loaded in Production.
- `/api/health` returned `ok: true` while reporting: Supabase public/service clients true; Clerk app true and webhook false; Stripe app/webhook true; PostHog false; Sentry false.
- Supabase project name/ref `sweepza` / `ojwhsntcpmoxnzisuomq` is `ACTIVE_HEALTHY`. All inspected `public` tables have RLS enabled and role/ownership policies exist for seeker, host, admin, and owner boundaries.
- Remote Supabase migration history contains eight migrations through `20260604120700_seed_dictionaries`. The repo contains eight later migrations through `20260608000000_search_index`; parity is therefore **not proven** and must be reconciled without destructive migration work.
- The dedicated PostHog project named `Sweepza` exists, but it reports no ingested event. Production health also reports PostHog disabled.
- Sentry code is installed and env-gated, but Production health reports Sentry disabled; no controlled event can be claimed.

## Current-main Preview

The branch was created at exact `main`, but branch creation alone did not trigger a Vercel Preview. The docs-only commit from this preflight should trigger the normal Git integration; its app code remains identical to the baseline. Record the resulting deployment ID and URL in `SWEEPZA_PRODUCTION_GATE_STATUS.md` before treating this gate as passed.

Production remained unchanged throughout. The documented rollback candidate is the prior `READY` Production deployment `dpl_6epZN9Y8Z7byQ7Rsf9LRN4zRPNQz` (SHA `005af4fdd09ffab279ece37e8d0426847b02ff5b`). A real rollback proof still requires a non-production rehearsal or an approved Production rollback exercise.

## Remaining controlled proofs

1. Build and smoke-test the branch Preview, then record its deployment ID.
2. Configure a dark Preview with the Production Clerk application and prove sign-in, claims, redirects, and signed webhook delivery without changing Production.
3. Reconnect provider inspection to the Sweepza Stripe account. The connected account in this pass identified itself as Explore&Earn, so Stripe inspection stopped immediately under the isolation rule.
4. Reconcile the eight repo migrations absent from remote migration history and verify ordinary-user access with scoped test identities.
5. Install Sweepza PostHog and Sentry variables in a non-production lane and prove one non-sensitive event in each project.
6. Approve sender architecture, Resend capacity, aliases, and support workflow before enabling email.
7. Replace placeholder legal text with reviewed privacy/terms content and prove admin/recovery procedures.

## Guardrail confirmation

No Explore&Earn repository or provider state was changed. No live Stripe objects were created, updated, or deleted. No email, alias, DNS, Clerk-user migration, destructive database action, Production promotion, or credential retirement occurred.
