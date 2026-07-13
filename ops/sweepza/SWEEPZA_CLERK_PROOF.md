# Sweepza Clerk Proof

## Result

**NOT PROVEN / NO-GO for Production cutover.**

- Doppler `sweepza/stg` contains matching Clerk publishable and secret keys, but both are test/development-family.
- `CLERK_WEBHOOK_SECRET` is missing or empty.
- The fresh Preview therefore fails closed with Clerk application and webhook health false.
- No disposable user was created, no user was migrated, and Production Clerk configuration was not changed.

## Proof still required

1. Founder authenticates the intended Clerk Production application and confirms its non-secret application identifier.
2. Add the exact Preview origin and same-origin sign-in/sign-up/recovery redirects.
3. Install matching live-family publishable/secret keys in Doppler `stg` and Vercel Preview only.
4. Create the Preview `/api/webhooks/clerk` endpoint and install its signing secret.
5. With a disposable test identity, prove sign-up, sign-in, sign-out, recovery, session refresh, and signed `user.created`, `user.updated`, and `user.deleted` deliveries.
6. Verify Clerk `sub` maps to `app_user.clerk_user_id`; roles remain database-owned and RLS-enforced.
7. Rehearse restoring the current development-key configuration before any Production cutover.

Until these steps pass, do not replace Production keys or migrate users.
