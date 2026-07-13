# Sweepza Activation Execution Pass

Date: 2026-07-12 (America/Los_Angeles)

Scope: Sweepza only

Branch: `codex/sweepza-independence-preflight` / draft PR #53

## Outcome

This execution pass moved Sweepza materially forward but does not authorize Production promotion.

- Fixed the invalid Preview `NEXT_PUBLIC_POSTHOG_HOST` in Sweepza Doppler `stg` and Vercel Preview.
- Bound Preview analytics to the dedicated PostHog `Sweepza` project and verified one anonymous, non-sensitive controlled event in project data after the capture API returned HTTP 200.
- Built, deployed, and smoke-tested fresh `READY` Preview `dpl_HLrzHx9Wz7VFgupVu25pBbjgDihe` without changing Production.
- Reconciled all eight missing Supabase migrations, corrected the invalid search migration, and added a targeted security-hardening migration.
- Verified the dedicated `sweepza_sandbox` Stripe account, active products and recurring prices, and created an unpaid test Checkout Session with no charge.
- Created a replacement Preview-only Stripe sandbox webhook endpoint and installed its signing secret in Doppler `stg` and Vercel Preview.
- Replaced the Privacy and Terms placeholders with baseline draft copy explicitly marked as requiring legal review before public launch.
- Ran lint, typecheck, 145 tests, and the production build successfully.

## Safety boundary

Production was not changed or promoted. No live charge, live subscription, Stripe deletion, customer email, DNS change, Clerk user migration, or destructive Supabase data action occurred. Connected Stripe and Resend application connectors identify as Explore&Earn and were not used for Sweepza mutations. Stripe sandbox work used the Sweepza test key directly against Stripe's API.

## Remaining blockers

- Clerk `stg` keys are development-family, not the intended dark Production application, and `CLERK_WEBHOOK_SECRET` is empty.
- Sentry DSN, auth token, and organization are empty in Doppler `stg`; no controlled Sentry event is possible.
- The replacement Stripe sandbox webhook accepted a correctly signed synthetic proof event; live residue remains read-only/unreconciled because the live connector is foreign.
- Resend exposes only the Explore&Earn domain; no Sweepza alias was created.
- Legal baseline copy still needs qualified legal review.

## Validation

- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm test`: 145/145 pass
- `pnpm build`: pass
- Supabase remote migration history: 17/17 repository migrations present
- Supabase post-change security advisor: zero `ERROR` findings
