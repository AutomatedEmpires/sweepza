# Sweepza Launch Runbook

Status as of 2026-07-07: **PRODUCTION DEPLOYED · LIVE BILLING CONFIGURED · REAL
REVENUE PROOF PENDING · PRODUCTION IDENTITY PENDING · OBSERVABILITY/EMAIL
PENDING.**

A `cs_live_` Checkout Session has been created and expired cleanly, which proves
`production app → live Stripe account → live product → live price → live checkout
creation`. It does **not** prove `real card payment → successful payment → signed
live webhook → subscription row → entitlement → billing UI → cancellation`. That
final loop is the last revenue proof (Gate 1 below).

Every value here is verified against the live account, the production database,
or the source. Secret values are omitted.

---

## Stripe account architecture

**SHARED STRIPE ACCOUNT · SEPARATE PRODUCT CATALOG · SEPARATE WEBHOOK ·
SEPARATE APPLICATION SECRETS.**

- Account `acct_1SpxXpDtcwz0cxzo` (`jackson@automatedempires.com`, US, individual)
  is the founder's single live account, **shared with Explore&Earn**. KYC is
  complete: `charges_enabled`, `payouts_enabled`, `details_submitted` all true.
- Product boundary is explicit via metadata. Sweepza's live products both carry
  `metadata.venture = "sweepza"` and a distinct `sweepza_key`:
  - `prod_UqNSWdENGUmKOP` "Sweepza Host Plan" (`sweepza_host_baseline`) →
    price `price_1TqghWDtcwz0cxzoYtZp1XYv`, **$19.00/mo**.
  - `prod_UqNSMnnCs3Cw1n` "Sweepza Extra Active Listing"
    (`sweepza_additional_listing`) → price `price_1TqghWDtcwz0cxzogpcLYkdP`,
    **$5.00/mo**, quantity-based.
- Webhook boundary is explicit: Sweepza `we_1TqghXDtcwz0cxzobypz5Rl9` →
  `https://sweepza.com/api/webhooks/stripe` (subscription events only), distinct
  from Explore&Earn's `we_1T8uQyDtcwz0cxzoKoHAsSl2` →
  `exploreandearn.com/api/webhooks/stripe`.
- Secret boundary is explicit: Sweepza reads only `STRIPE_PRICE_HOST_BASELINE`
  and `STRIPE_PRICE_ADDITIONAL_LISTING` from its own Doppler (`sweepza/prd`) and
  Vercel project. It never references E&E prices; E&E never references Sweepza's.
  This isolation must be preserved: **do not let Sweepza code consume E&E price
  IDs or vice versa.**

---

## Gate 1 — Real payment (the last revenue proof)

### Founder action (reduced to four steps)

1. Open `https://sweepza.com/host` (signed in as any account; if new, sign up
   first — see auth note below).
2. Create a host profile if prompted, then click **Start host plan**.
3. On Stripe Checkout, enter a **real card** and confirm the **$19.00/mo**
   subscription.
4. Return to the application (auto-redirects to `/host?checkout=success`).

Everything after step 4 is automated/verifiable.

### Expected objects (what the payment must produce)

| Thing | Expected value |
| --- | --- |
| Price consumed | `price_1TqghWDtcwz0cxzoYtZp1XYv` ($19.00/mo baseline) |
| Amount | `1900` USD, recurring monthly |
| Stripe Customer | live `cus_…`, `email` = the host's account email, `metadata` `{venture: sweepza, host_id, app_user_id}` (created by `ensureStripeCustomerForHost`, stored on `host.stripe_customer_id` **before** checkout) |
| Stripe Subscription | live `sub_…`, `status: active`, `metadata` `{venture: sweepza, host_id, plan_key: host_baseline, included_active_listings: 3, purchased_additional_listings: 0, max_active_listings: 3}` (set via `subscription_data.metadata` in `lib/stripe/checkout.ts`) |
| Webhook event delivered | `customer.subscription.created` → `HTTP 200` `{ok:true, action:"subscription_synced", …}`. (Note: the endpoint subscribes to `customer.subscription.created/updated/deleted` only. `checkout.session.completed` is **not** subscribed and is **not** what drives entitlement — the app keys off the subscription event.) |
| Supabase `subscription` row | one row for the host: `status: active`, `stripe_subscription_id: sub_…`, `included_active_listings: 3`, `purchased_additional_listings: 0`, `max_active_listings: 3` |
| Entitlement | 3 active listing slots (0 used → "3 slots remaining") |
| Billing UI (`/host/billing`) | "Host plan" badge **Active**, meter "0 / 3" |
| Host dashboard (`/host`) | "Plan status: [status]", "Allowance: 3 active listings", "Remaining active slots: 3" |

### After the founder pays — automated verification

Run:

```bash
doppler run --project sweepza --config prd -- node scripts/verify-live-checkout.mjs
```

It confirms, from live Stripe + production Supabase (no secrets printed): the
live customer + Sweepza subscription exist, the local `subscription` row matches
Stripe's current status (active before cancellation, canceled afterward), the
baseline entitlement has `included_active_listings=3` and
`max_active_listings=3`, both configured recurring prices are live and
Sweepza-owned, and recent subscription webhook deliveries are not stuck.

### Cancellation proof (do this second)

1. From `/host/billing`, click **Manage billing in Stripe** → cancel the
   subscription in the portal.
2. Stripe fires `customer.subscription.updated` (cancel at period end) and later
   `customer.subscription.deleted`. The app maps `canceled`/`incomplete_expired`
   → local `canceled`, `paused`/`incomplete` → `grace`
   (`toLocalSubscriptionStatus`).
3. Re-run `scripts/verify-live-checkout.mjs` and confirm the local `subscription`
   row reflects the cancelled state and the entitlement/billing UI update.
4. **Leave no ambiguity:** confirm exactly one Stripe customer + one subscription
   for the test host, and that the local row's `status` matches Stripe.

---

## Gate 2 — Production Clerk (identity)

Production currently runs a **Sweepza-dedicated development** Clerk instance
`ins_3EhjrYiNBzhqkZlG9kIc2Gh4dSy` (separate from E&E's `calm-panther-70`). Auth
(sign-up / sign-in / sign-out / host onboarding) is fully functional and
E2E-proven on it, but it is not production-grade (dev banner, dev limits, shared
`clerk.accounts.dev` frontend API).

### Founder action (dashboard-only)

Create the dedicated **production** Clerk instance for the Sweepza application and
complete the dashboard-only setup:

- Application: the existing Sweepza Clerk app → add a **Production** instance.
- Production domain: `sweepza.com`.
- Frontend API DNS: add the `CNAME` Clerk shows (typically
  `clerk.sweepza.com → frontend-api.clerk.services` plus the `accounts`,
  `clkmail`, and DKIM CNAMEs Clerk lists) at GoDaddy for the `sweepza.com` zone.
- Allowed origins: `https://sweepza.com`, `https://www.sweepza.com`.
- Paths: sign-in `/sign-in`, sign-up `/sign-up` (these already exist in-app).
- Redirect URLs / after-auth: `/` (app already sets `forceRedirectUrl="/"`).
- OAuth providers: Google (and Apple if desired) with **production** OAuth
  credentials; callback URL = the Clerk-provided
  `https://clerk.sweepza.com/v1/oauth_callback`.
- Webhook (optional but recommended): endpoint
  `https://sweepza.com/api/webhooks/clerk`, events `user.created`,
  `user.updated`, `user.deleted`; copy the signing secret.

### Then (automatable once keys exist)

1. Set in Doppler `sweepza/prd` and Vercel Production:
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_…`), `CLERK_SECRET_KEY`
   (`sk_live_…`), and `CLERK_WEBHOOK_SECRET` if the webhook was created.
2. Fresh prod deploy (publishable key is build-inlined — use
   `vercel deploy --prod` from an `origin/main` worktree, not `redeploy`).
3. Verify signed-out → public routes 200; sign-up; sign-in; sign-out; host
   onboarding gate.

### Owner/admin bootstrap (verified procedure)

Roles are protected by `trg_protect_app_user_roles`: only a caller with **no
Clerk JWT** (i.e. the service-role client) or an existing owner/admin may change
`is_owner`/`is_admin`. The current `dev_owner` seed row (from `supabase/seed.sql`)
has a placeholder `clerk_user_id` and does **not** map to any real Clerk user, so
it grants the founder nothing once real auth is live.

Procedure after the founder first signs in on the production instance:

1. `ensureCurrentAppUser()` auto-creates his `app_user` row (real
   `clerk_user_id`, `is_owner=false`).
2. Grant owner/admin via the service role (allowed by the trigger because there
   is no Clerk JWT):
   ```sql
   update app_user set is_owner = true, is_admin = true
   where clerk_user_id = '<jackson_production_clerk_user_id>';
   ```
3. Delete the non-functional bootstrap row (optional):
   `delete from app_user where clerk_user_id = 'dev_owner';`
4. Verify no duplicate/orphaned `app_user` rows for the founder.

Identity migration note: because `app_user` is keyed by `clerk_user_id`, moving
from the dev instance to the production instance means any dev-instance users get
**new** `app_user` rows under their new production Clerk ids. Production data is
currently clean (0 hosts/subs, only the bootstrap row), so there is no user
migration to perform — a clean cutover.

---

## Gate 3 — Observability & email (dedicated Sweepza projects)

All three are **cleanly off** in production (no keys set → no misconfiguration,
no Explore&Earn pollution). Each is env-gated in code and verified below. The
only external action for each is "create the dedicated Sweepza resource and
provide the key/DSN"; configuration + verification are then automatable.

### PostHog

- Code: `lib/posthog/client.ts` is a graceful no-op unless **both**
  `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are set; it never
  hardcodes a key (reads env only), and initializes with
  `autocapture: false, capture_pageview: false` (no accidental PII/URL capture).
- Instrumented events today (17, client-side, `lib/analytics.ts`): `listing_viewed`,
  `listing_saved`, `listing_enter_clicked`, `listing_marked_entered`,
  `listing_marked_won`, `listing_skipped`, `listing_shared`,
  `discover_feed_loaded`, `filter_applied`, `search_performed`,
  `search_results_shown`, `winner_post_created`, `winner_post_published`,
  `winner_post_reacted`, `winner_submission_started`,
  `winner_submission_completed`, `winner_submission_failed`. Properties are
  ids/labels/categories only — **no emails, names, or photos** (enforced by the
  dictionary comment and reviewed).
- **Known instrumentation gap (not infra):** the commercial funnel
  (`signup`, `host_onboarded`, `checkout_started`, `checkout_completed`,
  `subscription_activated`, `subscription_cancelled`, `listing_created`,
  `listing_published`) is **not** instrumented. Most of these are server-side
  (checkout server action, Stripe webhook, listing submission API) and the
  current PostHog client is browser-only, so instrumenting them cleanly requires
  adding `posthog-node` for server capture — a follow-up instrumentation task,
  deliberately not done here to avoid reopening development.
- **External action:** create a dedicated Sweepza PostHog project; provide its
  `phc_…` project key and `NEXT_PUBLIC_POSTHOG_HOST` (`https://us.posthog.com` or
  EU). Then: set both in Doppler `prd` + Vercel Production, fresh deploy, and
  confirm the 17 events arrive in the new project.

### Sentry

- Code: `instrumentation-client.ts` (client) and `instrumentation.ts` →
  `sentry.server.config.ts` / `sentry.edge.config.ts` (server/edge) all init
  **only** when `NEXT_PUBLIC_SENTRY_DSN` is set. No DSN → no init → no failure.
  The Stripe webhook already reports to Sentry on 404 (no-host) and 500
  (processing failure) with `extra` limited to `eventType`, `customerId` (a
  `cus_` id, not a secret), and `source`. Card data never touches the server
  (entered on Stripe-hosted Checkout), and no secrets are placed in error
  context. Recommended hardening (non-blocking): add a `beforeSend` scrubber in
  the Sentry configs before high traffic.
- Source maps: `withSentryConfig` is wired in `next.config.mjs`; uploads activate
  when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` are present at build.
- **External action:** create a dedicated Sweepza Sentry project; provide
  `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
  for source maps). Then: set in Doppler `prd` + Vercel Production, fresh deploy,
  trigger one safe test exception, confirm it appears source-mapped.

### Resend

- Code: `lib/email/send.ts` posts to `api.resend.com/emails` via `fetch`; it is a
  graceful no-op (logs a warning) when `RESEND_API_KEY` is unset, and throws on a
  non-2xx response with status + body for observability. No retry (single
  attempt; acceptable for transactional). Sender defaults to
  `Sweepza <hello@sweepza.com>` unless `RESEND_FROM_EMAIL` overrides it.
- Emails are sent for **listing lifecycle + winner** events only
  (`sendHostNotification`: `listing_approved`, `listing_held`,
  `listing_expiring_soon`; `sendWinnerNotification`: `winner_post_published`).
  **No billing/checkout emails exist.** Recipients are always the target user's
  own `app_user.email` (never a hardcoded/invented address); every attempt writes
  a `notification_log` row (`sent`/`skipped`), honoring per-event + channel prefs.
- **Exact intended sender identity:** `Sweepza <notifications@send.sweepza.com>`
  (set `RESEND_FROM_EMAIL` to this). Operational/from-domain: `send.sweepza.com`.
- **External action:** create/authorize a Sweepza Resend account (or workspace)
  and add the sending domain `send.sweepza.com`. Then (automatable): add the
  Resend DKIM `TXT resend._domainkey`, SPF `TXT send` (`v=spf1
  include:amazonses.com ~all`), and bounce `MX send →
  feedback-smtp.us-east-1.amazonses.com` (priority 10) at GoDaddy; verify the
  domain in Resend; set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in Doppler `prd` +
  Vercel Production; fresh deploy; trigger one real listing-approved notification
  from admin and confirm inbox delivery (not just a 200).

---

## Live webhook observability (before/after the payment)

- Inspect deliveries without secrets:
  `GET https://api.stripe.com/v1/webhook_endpoints/we_1TqghXDtcwz0cxzobypz5Rl9`
  and the account's Events (`GET /v1/events?type=customer.subscription.created`)
  show event id, type, and delivery status.
- The app's handler returns a **structured, secret-free** JSON body on every
  path: `503` (no secret), `400` (missing/invalid signature),
  `{ok:true,action:"ignored"}` (non-subscription event),
  `404` + Sentry alert (no host for customer),
  `{ok:true,action:"subscription_synced",eventType,hostId,subscriptionId,status}`
  (success), or `500` + Sentry alert (processing failure → Stripe retries).
- `scripts/verify-live-checkout.mjs` reads the endpoint's recent delivery status
  and the resulting DB row so failures are diagnosable pre- and post-payment
  without exposing secrets.

---

## Deployment mechanics (reference)

- Source of truth: `main` (currently `8c39db4`). Vercel auto-deploys on push to
  `main`.
- After changing any `NEXT_PUBLIC_*` var, do a **fresh** build (those are inlined
  at build time): `vercel deploy --prod` from a checkout of `origin/main` with
  `.vercel/` copied in. `vercel redeploy` reuses build artifacts and will keep
  stale `NEXT_PUBLIC_*` values.
- Env source of truth is Doppler `sweepza/prd`; `pnpm ops:sync-vercel-env`
  mirrors the full key set into Vercel (development/preview/production).
