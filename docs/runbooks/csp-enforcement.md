# Runbook: enforce the Content-Security-Policy

**State today:** CSP ships report-only. Middleware sends
`Content-Security-Policy-Report-Only` on every response; nothing is blocked.
The enforcing, nonce-based mode is fully implemented and dark behind
`CSP_ENFORCE`.

## Preconditions
1. Report-only has run in production long enough to cover every surface
   (sign-in/up, checkout, swipe, admin) with **zero unexpected violations**
   in browser consoles / reporting.
2. Every third-party `<script>` the app renders directly carries the request
   nonce (or is injected by an already-nonced script — how Clerk, Stripe, and
   PostHog load today). Under `'strict-dynamic'`, supporting browsers ignore
   the host allowlist in `script-src`, so adding an origin to
   `lib/security-headers.ts` `CSP_DIRECTIVES` only covers report-only mode
   and older browsers; it does NOT authorize a plain `<script src>` tag under
   enforcement.

## Activate
1. Set the env var `CSP_ENFORCE=true` in Vercel (Production).
2. **Redeploy.** The flag is read at build time for static pages — without a
   redeploy, prerendered pages lack nonces and would violate the policy.
3. What changes: middleware mints a per-request nonce, sends an enforcing
   `Content-Security-Policy` (script-src gains `'nonce-…' 'strict-dynamic'`,
   report-only header is dropped), threads the nonce via `x-nonce` (theme
   script in `app/layout.tsx`) and via the CSP request header (Next stamps its
   own framework inline scripts). All pages render dynamically.

## Verify (immediately after deploy)
- Load `/`, `/discover`, a listing detail, `/sign-in`: pages behave normally,
  the theme applies (proves the inline theme script executed under
  enforcement), and DevTools console shows no CSP violations.
- `curl -sI https://<host>/ | grep -i content-security-policy` shows the
  enforcing header containing `nonce-` and `strict-dynamic`.

## Rollback
Unset `CSP_ENFORCE` (or set to anything but `true`) and redeploy. The site
returns to report-only; nothing else changes.
