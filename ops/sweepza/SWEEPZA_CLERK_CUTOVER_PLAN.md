# Sweepza Clerk Cutover Plan

## Current state

- Active Production lane: Clerk development instance. A rendered Production browser session emitted Clerk's development-key warning and loaded from a `*.clerk.accounts.dev` domain.
- Dark Production Clerk application: reported to exist, but its dashboard configuration was not inspectable in this pass.
- Production `/api/health`: Clerk application configured; Clerk webhook not configured.
- Cutover status: **NO-GO**. Do not migrate users or replace Production keys yet.

## Configuration contract

Required environment names only:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`

Expected origins and redirects to verify in the dark application:

- Origins: `https://sweepza.com`, `https://www.sweepza.com` only if it is an intentional canonical/redirected host, and the exact dark Preview origin.
- Sign-in paths: `/sign-in` and post-auth return paths restricted to the same approved origins.
- Sign-up paths: `/sign-up` and same-origin post-auth return paths.
- Webhook endpoint: the lane-specific `/api/webhooks/clerk` URL over HTTPS.
- Remove localhost and obsolete Preview origins from Production Clerk after proof and approval; do not remove them during this pass.

## Claims and authorization

- Clerk JWT `sub` must map to `app_user.clerk_user_id`.
- Application roles (`seeker`, `host`, `admin`, `owner`) remain database-owned and RLS-enforced; user-editable Clerk metadata must never grant a role.
- Supabase access tokens must carry the Clerk subject in the shape expected by `current_clerk_user_id()`.
- Verify session lifetime, refresh, sign-out/revocation behavior, and multi-device behavior.
- Clerk webhooks require signature verification via `CLERK_WEBHOOK_SECRET`; prove `user.created`, `user.updated`, and `user.deleted` handling against disposable dark-lane identities only.

## Dark Preview strategy

1. Create a Vercel Preview dedicated to Clerk proof with app code equal to current `main`.
2. Bind only the dark Production Clerk publishable/secret keys and a lane-specific webhook secret.
3. Allow only the exact Preview origin and same-origin redirects.
4. Use disposable test identities; do not migrate or reuse Production development-instance users.
5. Verify sign-up, sign-in, sign-out, session refresh, protected seeker route, host denial by default, explicit role grant through the approved database procedure, and admin denial.
6. Verify signed webhook creation/update/deletion and database mapping without exposing payload PII in logs.
7. Capture deployment ID, Clerk application identifier (non-secret), webhook delivery IDs, and role-boundary results.

## Rollback

- Before any later Production cutover, record the current development publishable-key identifier, secret versions in the secret manager, Vercel deployment, and Clerk configuration export/screenshots.
- Cut over in a bounded window with the old configuration retained but not exposed.
- Roll back by restoring the prior Vercel env-version set and redeploying the last known-good deployment. Do not delete either Clerk application or migrate/delete users during the rollback window.
- A rollback is incomplete until sign-in, existing sessions, webhook health, and role-boundary smoke tests pass.

## Exact next proof

A `READY` dark Preview must show: Production Clerk key family (without revealing keys), no development-key warning, successful disposable-user sign-in, correct `sub` mapping, signed webhook delivery, seeker/host/admin RLS boundaries, safe redirects, and a rehearsed env/deployment rollback. Until then, Production remains on its current development lane.
