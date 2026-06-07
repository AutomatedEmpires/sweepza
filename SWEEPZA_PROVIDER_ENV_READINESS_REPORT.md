# Sweepza Provider / Env Readiness Report

Updated: 2026-06-04

## Current State

Current committed env contract is narrow and intentionally permissive:
- `.env.example` includes App URL, Clerk, Supabase, Stripe, and PostHog placeholders.
- `lib/env.ts` validates only those same variables.
- Runtime code currently depends primarily on Supabase vars.
- Docs mention a broader provider spine (Vercel, Notion, Cloudinary, Sentry, GitHub Actions secrets), but those are not yet reflected in `lib/env.ts` or `.env.example`.

## Environment Readiness Matrix

| Env var | Provider | Purpose | Local dev | Build | Preview/prod | Server only | Present in `.env.example` | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | App/Vercel | Base app URL for links/metadata | Optional | No | Yes | No | Yes | Currently not used consistently; layout metadata is hardcoded to `https://sweepza.com` |
| `NEXT_PUBLIC_APP_NAME` | App | Display/app naming | No | No | Optional | No | No | Recommended later if app config is centralized |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Browser/server anon client URL | Yes for live route runtime | No | Yes | No | Yes | Core current requirement |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Browser/server anon RLS key | Yes for live route runtime | No | Yes | No | Yes | Core current requirement |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase | Optional newer public-key naming | No | No | Optional | No | No | Not used in current code |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Trusted server bypass for admin/webhooks/seeding | No for public read | No | Later yes | Yes | Yes | Present but not needed for current public-read path |
| `SUPABASE_SECRET_KEY` | Supabase | Optional newer server secret naming | No | No | Later optional | Yes | No | Not used in current code |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI | CLI / automation auth | Optional | No | CI/admin only | Yes | No | Recommended for workflow/CLI automation, not runtime |
| `SUPABASE_PROJECT_REF` | Supabase | Project targeting / automation | Optional | No | CI/admin only | Yes | No | Useful for repeatable ops |
| `DATABASE_URL` | Supabase/Postgres | Direct DB/admin tooling access | Optional | No | Admin only | Yes | No | Not referenced in app code |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | Future auth client key | Later | No | Later | No | Yes | Present but unused today |
| `CLERK_SECRET_KEY` | Clerk | Future auth server key | Later | No | Later | Yes | Yes | Present but unused today |
| `CLERK_WEBHOOK_SECRET` | Clerk | Webhook verification | Later | No | Later | Yes | No | Missing from committed env contract |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | Future billing client key | Later | No | Later | No | Yes | Present but unused today |
| `STRIPE_SECRET_KEY` | Stripe | Future billing server key | Later | No | Later | Yes | Yes | Present but unused today |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Future billing webhook verification | Later | No | Later | Yes | Yes | Present but unused today |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog | Client analytics transport | Optional later | No | Beta/prod yes | No | Yes | Analytics stub exists but transport is not wired |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog | Analytics host | Optional later | No | Beta/prod yes | No | Yes | Present |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Client error monitoring | No | No | Recommended for beta/prod | No | No | Missing |
| `SENTRY_AUTH_TOKEN` | Sentry | Source maps / CI integration | No | No | Recommended later | Yes | No | Missing |
| `SENTRY_ORG` | Sentry | CI/source map config | No | No | Recommended later | Yes | No | Missing |
| `SENTRY_PROJECT` | Sentry | CI/source map config | No | No | Recommended later | Yes | No | Missing |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary | Public media delivery | No | No | Optional later | No | No | Missing; no Cloudinary code yet |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary | Server media operations | No | No | Optional later | Yes | No | Missing |
| `CLOUDINARY_API_KEY` | Cloudinary | Server media operations | No | No | Optional later | Yes | No | Missing |
| `CLOUDINARY_API_SECRET` | Cloudinary | Server media operations | No | No | Optional later | Yes | No | Missing |
| `VERCEL_TOKEN` | Vercel | CI/deployment automation | No | No | Admin only | Yes | No | Not an app runtime var; GitHub secret instead |
| `VERCEL_ORG_ID` | Vercel | CI/deployment automation | No | No | Admin only | Yes | No | GitHub secret instead |
| `VERCEL_PROJECT_ID` | Vercel | CI/deployment automation | No | No | Admin only | Yes | No | GitHub secret instead |
| `GODADDY_API_KEY` | GoDaddy | Domain automation | No | No | Optional later | Yes | No | Not referenced in code |
| `GODADDY_API_SECRET` | GoDaddy | Domain automation | No | No | Optional later | Yes | No | Not referenced in code |
| `NOTION_TOKEN` or equivalent | Notion | Future worker automation | No | No | Optional later | Yes | No | No active committed Notion worker on `main` |

## What Is Actually Required Now

### Required now for real local runtime
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Not required for current build/CI path
- Clerk
- Stripe
- PostHog
- Sentry
- Cloudinary
- Vercel runtime env vars

### Required only once later slices land
- `SUPABASE_SERVICE_ROLE_KEY` for admin/webhooks/moderation jobs
- Clerk keys for auth shell and role-aware writes
- PostHog keys for real analytics transport
- Sentry vars for monitoring
- Stripe vars for monetization

## Provider Readiness Summary

| Provider | Current status | Notes |
| --- | --- | --- |
| Supabase | Ready for public-read MVP | Live public listing routes already depend on it |
| Clerk | Planned / schema-aligned | Env placeholders exist; UI not wired |
| Stripe | Planned | Schema + env placeholders only |
| PostHog | Planned | Analytics stub only |
| Vercel | Expected deployment target | Docs refer to it, but runtime code does not read Vercel-specific vars |
| Sentry | Not started | No code/env wiring |
| Cloudinary | Not started | No code/env wiring |
| Notion | Process-level only on `main` | Workflow docs exist; no committed worker tool on `main` |
| GoDaddy | Optional future | No code wiring |
| Doppler | Optional future | Not referenced in code |

## Webhooks Likely Needed Later

1. Clerk webhook for user/app_user sync and role updates.
2. Stripe webhook for subscription/billing state changes.
3. Optional internal/admin hooks for ingest/import workflows.

## Vercel Recommendations

### Preview / production envs to define first
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Add when the related slice lands
- Clerk keys
- PostHog keys
- Sentry vars
- Stripe vars
- `SUPABASE_SERVICE_ROLE_KEY` only for server-side protected tasks

## GitHub Secrets Recommendations

Keep as GitHub Actions secrets, not `.env.example`, when automation actually exists:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SENTRY_AUTH_TOKEN`
- `CLERK_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SECRET` when used by Actions or server automation

## Doppler Recommendation

Do not introduce Doppler until the env surface is stable enough to justify another control plane. Right now Sweepza should keep `.env.example` as the canonical public contract and use Vercel/GitHub secrets for deployment and automation.

## Gaps Requiring Follow-up

1. `.env.example` does not yet reflect the broader provider spine described in repo docs and prior planning.
2. `lib/env.ts` and `.env.example` are aligned with each other, but both are narrower than likely beta/prod needs.
3. `NEXT_PUBLIC_APP_URL` is present but metadata currently hardcodes `https://sweepza.com` in `app/layout.tsx`.
4. No committed `supabase/config.toml` exists in Sweepza, so local Supabase project wiring is intentionally light.

## Recommended Follow-up PR

If Jackson wants provider/env readiness clarified before more product work, create a docs-only follow-up branch for env normalization and deployment guidance rather than reviving stale PR #14 directly.