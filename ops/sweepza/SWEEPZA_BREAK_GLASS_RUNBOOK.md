# Sweepza Break-Glass & Recovery Runbook

Purpose: the minimum, pre-approved actions to restore Sweepza (`sweepza.com`) during
an incident, and a non-destructive drill to prove they work. Sweepza is isolated
per-venture; **never** touch Explore&Earn or any other venture's resources during a
Sweepza incident.

## Break-glass owner

| Role | Owner | Contact | Notes |
| --- | --- | --- | --- |
| Primary | **_(founder to name)_** | | Has Vercel + Doppler + Supabase + Clerk + Stripe admin |
| Secondary | **_(recommend naming a 2nd)_** | | So recovery isn't single-person-dependent |

> Action required: name the primary (and ideally a secondary) break-glass owner and
> confirm each has working admin access to all five providers below.

## First move in almost any app-level incident: roll back the deploy

Vercel keeps every prior production build. Rolling back is instant and non-destructive
(it re-points the `sweepza.com` alias to a previous **Ready** build; it does not rebuild).

**Dashboard (fastest):** Vercel → project `sweepza` → Deployments → pick the last known-good
**Ready** production deployment → **Instant Rollback**.

**CLI:**
```bash
# list production deployments, newest first
vercel ls sweepza --prod --scope jackson-coles-projects-dd76106c
# roll the sweepza.com alias back to a specific known-good deployment
vercel rollback <deployment-url> --scope jackson-coles-projects-dd76106c
```

Known-good reference at time of writing: `sweepza-6ubq13137-…vercel.app` (commit `828fe6c`,
live env). Always confirm the target is **Ready** before rolling.

After rollback, verify: `curl -s https://sweepza.com/api/health` → `ok:true` and integrations
green; homepage 200.

## Provider-specific recovery

| Provider | Failure | Recovery |
| --- | --- | --- |
| **Vercel** | Bad deploy / outage | Instant Rollback (above). Env lives in Doppler `sweepza/prd`; re-sync + redeploy if env is the cause. |
| **Supabase** (`ojwhsntcpmoxnzisuomq`) | Bad data/migration | Point-in-time recovery from the Supabase dashboard. **Do not** run destructive SQL. RLS + service-role key protect data. |
| **Clerk** (prod `ins_3GKoNM…`) | Auth broken after a key/DNS change | Confirm `pk_live`/`sk_live` in Doppler match the **production** instance; confirm `clerk.sweepza.com` DNS resolves; redeploy (publishable key is build-inlined). |
| **Stripe** (`acct_1SpxXp…`) | Billing/webhook issue | Only `sweepza.com/api/webhooks/stripe` should exist (no foreign endpoints). Re-check the signing secret in Doppler. Never touch another venture's Stripe account. |
| **Doppler** (`sweepza/prd`) | Secret lost/rotated | Doppler is the source of truth; re-set the secret, run `scripts/sync-vercel-env-from-doppler.sh` (or the per-key `vercel env` upsert), redeploy. |

## Isolation guardrail

The founder's single login can see every venture. Before any write, confirm the account
IS Sweepza (Stripe account = `sweepza`, Supabase project = `sweepza`, Vercel project =
`sweepza`, Clerk app = `sweepza`). If a connector resolves to Explore&Earn or another
venture, **stop**.

## Non-destructive rollback drill (to close this gate)

1. Record the current production deployment id (`vercel ls sweepza --prod …`).
2. `vercel rollback <previous-known-good-url>` → alias moves to the prior build.
3. Verify `sweepza.com/api/health` = green and homepage 200 on the rolled-back build.
4. Roll forward: `vercel rollback <original-current-url>` (or `vercel redeploy`/promote the latest).
5. Verify green again. Record elapsed time (target: < 5 min end-to-end).

Run the drill in a low-traffic window; it briefly serves an older but functional build.
