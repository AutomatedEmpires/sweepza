# Sweepza Provider Provisioning

This runbook is for `ventures/sweepza` only.

Do not reuse credentials from `explore-and-earn` or any other AutomatedEmpires venture. Sweepza already has its own Supabase project and its own Vercel project, and its Stripe, Clerk, PostHog, and Sentry credentials should stay isolated the same way.

## Provisioned now

- Doppler project: `sweepza`
- Doppler configs: `dev`, `dev_personal`, `stg`, `prd`
- Verified Supabase project: `ojwhsntcpmoxnzisuomq`
- Verified GitHub repo: `AutomatedEmpires/sweepza`
- Verified Vercel project: `sweepza`
- Current production alias: `https://sweepza.vercel.app`
- Synced into Doppler already:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_POSTHOG_HOST`
  - `GITHUB_OWNER`
  - `GITHUB_REPO`
  - `GITHUB_TOKEN`

## Sweepza-only Vercel sync

Use the guarded sync script below from the Sweepza repo. It refuses to run unless the linked Vercel project is `sweepza`.

```bash
pnpm ops:sync-vercel-env
```

The script syncs these keys from Doppler into Vercel:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TOKEN`

The script skips empty values and placeholder-looking values so Sweepza never pushes scaffolding secrets into Vercel by mistake.

## Remaining provider keys

These still need provider-side provisioning before they can be added to Doppler:

- `CLERK_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `NOTION_API_TOKEN`

## WSL commands for Doppler

### Clerk

Use test keys for `dev`, `dev_personal`, and `stg`. Use production keys for `prd`.

```bash
for cfg in dev dev_personal stg; do
  doppler secrets set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='pk_test_replace_me' --project sweepza --config "$cfg"
  doppler secrets set CLERK_SECRET_KEY='sk_test_replace_me' --project sweepza --config "$cfg"
  doppler secrets set CLERK_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config "$cfg"
done

doppler secrets set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='pk_live_replace_me' --project sweepza --config prd
doppler secrets set CLERK_SECRET_KEY='sk_live_replace_me' --project sweepza --config prd
doppler secrets set CLERK_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config prd
```

### Stripe

Create or switch to a Sweepza-owned Stripe account first. Do not use the Explore&Earn Stripe account.

Production payments are not currently approved (`payments = null`). Provisioning
keys is configuration only: keep `PAYMENTS_ENABLED` unset and outside every
routine environment sync. The gate is changed separately, only after
Preview/sandbox proof and an explicit founder authorization. Never add
`PAYMENTS_ENABLED` to the bulk `sync-vercel-env-from-doppler.sh` key list.

```bash
for cfg in dev dev_personal stg; do
  doppler secrets set STRIPE_SECRET_KEY='sk_test_replace_me' --project sweepza --config "$cfg"
  doppler secrets set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='pk_test_replace_me' --project sweepza --config "$cfg"
  doppler secrets set STRIPE_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config "$cfg"
done

doppler secrets set STRIPE_SECRET_KEY='sk_live_replace_me' --project sweepza --config prd
doppler secrets set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='pk_live_replace_me' --project sweepza --config prd
doppler secrets set STRIPE_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config prd
```

### PostHog

```bash
for cfg in dev dev_personal stg prd; do
  doppler secrets set NEXT_PUBLIC_POSTHOG_KEY='phc_replace_me' --project sweepza --config "$cfg"
done
```

### Sentry

```bash
for cfg in dev dev_personal stg prd; do
  doppler secrets set NEXT_PUBLIC_SENTRY_DSN='https://replace_me.ingest.us.sentry.io/replace_me' --project sweepza --config "$cfg"
  doppler secrets set SENTRY_AUTH_TOKEN='sntrys_replace_me' --project sweepza --config "$cfg"
  doppler secrets set SENTRY_ORG='replace_me' --project sweepza --config "$cfg"
  doppler secrets set SENTRY_PROJECT='sweepza' --project sweepza --config "$cfg"
done
```

### GitHub worker token

Use a token scoped only as far as the Sweepza worker needs. A fine-grained token limited to `AutomatedEmpires/sweepza` is preferred.

```bash
for cfg in dev dev_personal stg prd; do
  doppler secrets set GITHUB_TOKEN='github_pat_replace_me' --project sweepza --config "$cfg"
done
```

### Notion worker token

```bash
for cfg in dev dev_personal stg prd; do
  doppler secrets set NOTION_API_TOKEN='secret_replace_me' --project sweepza --config "$cfg"
done
```

## PowerShell commands for Doppler

Run these from Windows PowerShell. They call into WSL so the Doppler CLI stays in one place.

### Clerk

```powershell
foreach ($cfg in @('dev','dev_personal','stg')) {
  wsl bash -lc "doppler secrets set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='pk_test_replace_me' --project sweepza --config $cfg"
  wsl bash -lc "doppler secrets set CLERK_SECRET_KEY='sk_test_replace_me' --project sweepza --config $cfg"
  wsl bash -lc "doppler secrets set CLERK_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config $cfg"
}

wsl bash -lc "doppler secrets set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='pk_live_replace_me' --project sweepza --config prd"
wsl bash -lc "doppler secrets set CLERK_SECRET_KEY='sk_live_replace_me' --project sweepza --config prd"
wsl bash -lc "doppler secrets set CLERK_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config prd"
```

### Stripe

```powershell
foreach ($cfg in @('dev','dev_personal','stg')) {
  wsl bash -lc "doppler secrets set STRIPE_SECRET_KEY='sk_test_replace_me' --project sweepza --config $cfg"
  wsl bash -lc "doppler secrets set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='pk_test_replace_me' --project sweepza --config $cfg"
  wsl bash -lc "doppler secrets set STRIPE_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config $cfg"
}

wsl bash -lc "doppler secrets set STRIPE_SECRET_KEY='sk_live_replace_me' --project sweepza --config prd"
wsl bash -lc "doppler secrets set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='pk_live_replace_me' --project sweepza --config prd"
wsl bash -lc "doppler secrets set STRIPE_WEBHOOK_SECRET='whsec_replace_me' --project sweepza --config prd"
```

### PostHog

```powershell
foreach ($cfg in @('dev','dev_personal','stg','prd')) {
  wsl bash -lc "doppler secrets set NEXT_PUBLIC_POSTHOG_KEY='phc_replace_me' --project sweepza --config $cfg"
}
```

### Sentry

```powershell
foreach ($cfg in @('dev','dev_personal','stg','prd')) {
  wsl bash -lc "doppler secrets set NEXT_PUBLIC_SENTRY_DSN='https://replace_me.ingest.us.sentry.io/replace_me' --project sweepza --config $cfg"
  wsl bash -lc "doppler secrets set SENTRY_AUTH_TOKEN='sntrys_replace_me' --project sweepza --config $cfg"
  wsl bash -lc "doppler secrets set SENTRY_ORG='replace_me' --project sweepza --config $cfg"
  wsl bash -lc "doppler secrets set SENTRY_PROJECT='sweepza' --project sweepza --config $cfg"
}
```

### GitHub token

```powershell
foreach ($cfg in @('dev','dev_personal','stg','prd')) {
  wsl bash -lc "doppler secrets set GITHUB_TOKEN='github_pat_replace_me' --project sweepza --config $cfg"
}
```

### Notion token

```powershell
foreach ($cfg in @('dev','dev_personal','stg','prd')) {
  wsl bash -lc "doppler secrets set NOTION_API_TOKEN='secret_replace_me' --project sweepza --config $cfg"
}
```

## Where to fetch each key

- Clerk:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk Dashboard -> API Keys -> Publishable key
  - `CLERK_SECRET_KEY`: Clerk Dashboard -> API Keys -> Secret key
  - `CLERK_WEBHOOK_SECRET`: Clerk Dashboard -> Webhooks -> the signing secret for your Sweepza webhook endpoint
- Stripe:
  - `STRIPE_SECRET_KEY`: Stripe Dashboard -> Developers -> API keys
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Stripe Dashboard -> Developers -> API keys
  - `STRIPE_WEBHOOK_SECRET`: Stripe Dashboard -> Developers -> Webhooks -> endpoint signing secret
- PostHog:
  - `NEXT_PUBLIC_POSTHOG_KEY`: PostHog Project Settings -> Project API Key
- Sentry:
  - `NEXT_PUBLIC_SENTRY_DSN`: Sentry Project Settings -> Client Keys (DSN)
  - `SENTRY_AUTH_TOKEN`: Sentry User Settings -> Auth Tokens
  - `SENTRY_ORG`: Sentry organization slug
  - `SENTRY_PROJECT`: Sentry project slug
- GitHub:
  - `GITHUB_TOKEN`: Fine-grained personal access token scoped to `AutomatedEmpires/sweepza`
- Notion:
  - `NOTION_API_TOKEN`: Internal integration token for the Sweepza workspace/integration

## Follow-up commands

After adding new keys to Doppler:

```bash
pnpm ops:sync-vercel-env
vercel deploy --prod --yes --scope jackson-coles-projects-dd76106c
```

Until a custom domain is attached in Vercel, keep `prd` `NEXT_PUBLIC_APP_URL` set to `https://sweepza.vercel.app`.

## Local type generation

Sweepza relies on Next.js generated route types under `.next/types`. To keep `pnpm typecheck` deterministic, the repo now generates those types first:

```bash
pnpm typegen
pnpm typecheck
```

If you need to link the local repo to the remote Supabase project for migration pushes, you still need the Sweepza database password:

```bash
supabase link --project-ref ojwhsntcpmoxnzisuomq --password 'replace_me'
```
