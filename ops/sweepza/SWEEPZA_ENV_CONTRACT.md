# Sweepza Environment Contract

## Environment ownership

| Lane | Secret source | Runtime target | Rule |
| --- | --- | --- | --- |
| local development | Doppler `sweepza/dev` | developer machine only | Never reuse another venture's variables |
| staging/dark proof | Doppler `sweepza/stg` | Vercel Preview | Test/sandbox services only; public values may be browser-visible |
| production | Doppler `sweepza/prd` | Vercel Production | Change only after Preview proof and explicit gate approval |

Vercel project: `sweepza` / `prj_RkvzmVMzo4kFUXbeO31dUtW8AEuU`.

Supabase project: `sweepza` / `ojwhsntcpmoxnzisuomq`.

PostHog project: `Sweepza` / `509084`.

Stripe staging account: `sweepza_sandbox` / `acct_1TeqgHD7Yqq488pB`.

## Required variables

| Integration | Variables | Preview state after this pass |
| --- | --- | --- |
| application | `NEXT_PUBLIC_APP_URL` | configured |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | configured; dedicated project verified |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | Doppler keys are development-family; webhook empty; dark lane not ready |
| Payments | `PAYMENTS_ENABLED`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_HOST_BASELINE`, `STRIPE_PRICE_ADDITIONAL_LISTING` | provider tuple may be configured; `PAYMENTS_ENABLED` remains unset/dark until separate founder approval |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | dedicated project pair configured; host is `https://us.i.posthog.com` |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | DSN/token/org empty; project name alone is insufficient |

## Enforcement rules

- Never expose server secrets in `NEXT_PUBLIC_*` variables. PostHog's project token and the Stripe publishable key are intentionally public identifiers.
- Preview must fail closed when an auth, payment, webhook, or telemetry tuple is incomplete.
- `NEXT_PUBLIC_POSTHOG_HOST` must parse as an absolute `https://` URL.
- Clerk publishable and secret keys must come from the same application and key family.
- Stripe publishable/secret keys, price IDs, and webhook signing secret must belong to the same mode and account.
- Provider credentials never authorize payment behavior. Only the literal
  `PAYMENTS_ENABLED="true"` opens the checked-in gate; every other value is dark.
- Production variables remain unchanged until dark-lane evidence is complete.

## Rollback

Restore the previous Vercel Preview environment versions and redeploy the last known-good Preview. Database rollback is forward-only: correct additive schema with a reviewed migration rather than dropping populated objects. Never roll back by deleting Stripe, Clerk, or email provider objects.
