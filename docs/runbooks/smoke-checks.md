# Runbook: post-deploy smoke checks

`scripts/smoke.mjs` verifies the launch invariants against a **running
deployment** — local build, preview, or production. It is dependency-free
(Node 18+ `fetch` only), so it runs anywhere without installing anything.

```sh
pnpm ops:smoke                        # against http://localhost:3000
pnpm ops:smoke https://sweepza.com    # against production
```

Exit code 0 = all required checks pass. Any `FAIL` exits 1.

## What it pins

1. **Security headers** on `/`: nosniff, `X-Frame-Options: DENY`,
   referrer policy, permissions policy, and **exactly one** CSP header —
   report-only today, enforcing after the `CSP_ENFORCE` flip
   (`docs/runbooks/csp-enforcement.md`); both at once is a misconfiguration.
   When enforcing, the policy must carry a nonce and `'strict-dynamic'`.
2. **Metadata canon** on the public routes (including `/host`): 200, an
   **exact** canonical — parsed as a URL, path must equal the route with no
   query/fragment, and against a remote deployment the origin must be the
   deployment's own (catches a stale `NEXT_PUBLIC_APP_URL`; local servers
   intentionally canonicalize to the configured production origin, so only
   the path is held exact there) — and **exactly one `og:url` equal to the
   canonical** (inheriting the root og:url is present-but-broken).
3. **Crawl surfaces**: `/robots.txt` and `/sitemap.xml` respond and the
   sitemap contains a `urlset`.
4. **Dead listing links**: a nonexistent `/sweeps/<slug>` must be a real
   HTTP 404. **Required against remote deployments** — a regression to
   200/302/500 fails the run; only local DB-less servers (which error on
   the lookup instead) soften this to a warning.
5. **PWA surfaces**: manifest parses; the service worker stays **cache-free**
   (`caches.open` appearing in `sw.js` means someone reintroduced caching —
   see the offline-fallback PR for why that is forbidden).

## WARN vs FAIL

Checks for surfaces that ship in open PRs (per-route canonicals, manifest,
service worker) report `WARN` while absent instead of failing, so the
harness is useful across merge states. Once a surface exists, its checks
become required: present-but-broken is always `FAIL`. Local-vs-remote
strictness comes from the target host (`localhost`/loopback = local).

The harness itself is regression-proofed by
`scripts/__tests__/smoke.test.ts`, which drives it against fixture HTTP
servers for the healthy case and each guarded failure mode.

## When to run

- After every production deploy (fast: a dozen HTTP requests).
- After changing env in Vercel (especially `CSP_ENFORCE`,
  `NEXT_PUBLIC_APP_URL`).
- Locally before opening infra-touching PRs: `pnpm build && pnpm start`
  in one shell, `pnpm ops:smoke` in another.

## Known limits

- Preview deployments behind Vercel Deployment Protection answer 302 to
  SSO for anonymous requests — run the harness against local or production
  instead.
- Extraction is regex-grade against markup Next emits deterministically;
  it is a smoke harness, not an HTML parser.
