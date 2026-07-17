#!/usr/bin/env node
// Sweepza smoke checks — dependency-free (Node 18+ fetch only), so it runs
// against ANY deployment: a local `pnpm start`, a Vercel preview you're
// signed into, or production.
//
//   pnpm ops:smoke                       # http://localhost:3000
//   pnpm ops:smoke https://sweepza.com   # production
//
// Two severities:
//  - required: a FAIL flips the exit code.
//  - optional: surfaces that ship in open PRs. Absent → WARN,
//    present-but-broken → FAIL.
// Some checks are stricter against remote deployments than against a local
// DB-less server (dead-slug 404s, canonical origins) — see isLocalBase.
// Extraction is regex-grade on purpose: this is a smoke harness, not a
// parser; every pattern targets markup Next emits deterministically.
// Covered by scripts/__tests__/smoke.test.ts against fixture servers.

import { pathToFileURL } from "node:url";

export const CANONICAL_ROUTES = [
  "/discover",
  "/about",
  "/faq",
  "/privacy",
  "/terms",
  "/cookies",
  "/winners",
  "/my-sweeps",
  "/host",
];

/** Local servers run without the production database and env, so a few
 * checks (dead-slug 404s, canonical origins) can't be held to production
 * strictness there. */
export function isLocalBase(base) {
  try {
    const { hostname } = new URL(base);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

export async function runSmoke(base, options = {}) {
  base = base.replace(/\/+$/, "");
  const local = options.treatAsLocal ?? isLocalBase(base);
  const results = [];
  const record = (level, name, ok, detail = "") => {
    results.push({ level, name, ok, detail });
  };

  async function get(path) {
    const response = await fetch(base + path, {
      redirect: "manual",
      headers: { "user-agent": "sweepza-smoke/1.0" },
      cache: "no-store",
    });
    // Sitemaps are application/xml and the manifest is
    // application/manifest+json — read anything textual, not just text/*.
    const contentType = response.headers.get("content-type") ?? "";
    const body = /text|xml|json|javascript/.test(contentType)
      ? await response.text()
      : "";
    return { response, body };
  }

  function checkHeader(headers, name, test, expectation) {
    const value = headers.get(name);
    const ok = value !== null && test(value);
    record(
      "required",
      `header ${name}`,
      ok,
      ok ? "" : `got: ${value ?? "(absent)"} — expected ${expectation}`,
    );
  }

  // ---- 1. Security headers on the front door -----------------------------
  async function checkSecurityHeaders() {
    const { response } = await get("/");
    record("required", "GET / responds 200", response.status === 200, `status ${response.status}`);
    const headers = response.headers;

    checkHeader(headers, "x-content-type-options", (v) => v === "nosniff", "nosniff");
    checkHeader(headers, "x-frame-options", (v) => v === "DENY", "DENY");
    checkHeader(headers, "referrer-policy", (v) => v.includes("strict-origin-when-cross-origin"), "strict-origin-when-cross-origin");
    checkHeader(
      headers,
      "permissions-policy",
      (v) => ["camera=()", "microphone=()", "geolocation=()"].every((directive) => v.includes(directive)),
      "camera, microphone, AND geolocation all disabled",
    );

    // Exactly one CSP mode: report-only today, enforcing once CSP_ENFORCE
    // flips (docs/runbooks/csp-enforcement.md). Both present = misconfig.
    const reportOnly = headers.get("content-security-policy-report-only");
    const enforcing = headers.get("content-security-policy");
    const exactlyOne = Boolean(reportOnly) !== Boolean(enforcing);
    record(
      "required",
      "exactly one CSP header (report-only XOR enforcing)",
      exactlyOne,
      `report-only: ${Boolean(reportOnly)}, enforcing: ${Boolean(enforcing)}`,
    );
    if (enforcing) {
      record(
        "required",
        "enforcing CSP carries nonce + strict-dynamic",
        enforcing.includes("'nonce-") && enforcing.includes("'strict-dynamic'"),
        "",
      );
    }
  }

  // ---- 2. Metadata canon on public routes --------------------------------
  async function checkRouteMetadata(route) {
    const { response, body } = await get(route);
    if (response.status !== 200) {
      record("required", `${route} responds 200`, false, `status ${response.status}`);
      return;
    }
    record("required", `${route} responds 200`, true);

    const canonical = body.match(/rel="canonical" href="([^"]+)"/)?.[1];
    // Canonical coverage lands route-by-route (open metadata-canon PRs);
    // absence is a WARN until those merge, wrong values are always a FAIL.
    if (!canonical) {
      record("optional", `${route} canonical`, false, "absent (lands with the metadata-canon PRs)");
      return;
    }

    // Exact comparison, not a suffix match: the canonical must be an absolute
    // URL whose path is exactly this route, with no query or fragment.
    // Against a remote deployment its origin must be the deployment's own
    // origin (self-pointing) — a stale NEXT_PUBLIC_APP_URL is precisely the
    // misconfiguration this catches. A local server intentionally
    // canonicalizes to the configured production origin, so only the path is
    // held exact there.
    let parsed = null;
    try {
      parsed = new URL(canonical);
    } catch {
      // unparseable → both checks below fail
    }
    const pathOk =
      parsed !== null && parsed.pathname === route && !parsed.search && !parsed.hash;
    const originOk =
      parsed !== null && (local || parsed.origin === new URL(base).origin);
    record(
      "required",
      `${route} canonical is exact${local ? " (path)" : " (origin + path)"}`,
      pathOk && originOk,
      `got ${canonical}`,
    );

    // With a canonical present, the route must emit exactly one og:url that
    // agrees with it — inheriting the root og:url or emitting a divergent
    // one is the present-but-broken case.
    const ogUrls = [...body.matchAll(/property="og:url" content="([^"]+)"/g)].map(
      (match) => match[1],
    );
    record(
      "required",
      `${route} og:url matches canonical`,
      ogUrls.length === 1 && ogUrls[0] === canonical,
      `og:url ${JSON.stringify(ogUrls)} vs canonical ${canonical}`,
    );
  }

  // ---- 3. Crawl surfaces --------------------------------------------------
  async function checkCrawlSurfaces() {
    const robots = await get("/robots.txt");
    record("required", "/robots.txt responds 200", robots.response.status === 200, `status ${robots.response.status}`);

    const sitemap = await get("/sitemap.xml");
    record(
      "required",
      "/sitemap.xml responds 200 with a urlset",
      sitemap.response.status === 200 && sitemap.body.includes("<urlset"),
      `status ${sitemap.response.status}`,
    );
  }

  // ---- 4. Dead listing links ----------------------------------------------
  async function checkDeadSlug() {
    const { response } = await get("/sweeps/smoke-check-nonexistent-slug");
    // Required against remote deployments: the metadata-phase notFound()
    // makes dead slugs real 404s, and a regression to 200/302/500 is exactly
    // the post-deploy break this gate exists to catch. A DB-less local
    // server errors on the lookup instead, so only local runs soften to WARN.
    record(
      local ? "optional" : "required",
      "dead /sweeps slug is a real 404",
      response.status === 404,
      `status ${response.status}${local ? " (DB-less local servers error here instead of 404ing)" : ""}`,
    );
  }

  // ---- 5. PWA surfaces ------------------------------------------------------
  async function checkPwaSurfaces() {
    const manifest = await get("/manifest.webmanifest");
    if (manifest.response.status === 404) {
      record("optional", "web app manifest", false, "absent (lands with the PWA PR)");
    } else {
      let parsedManifest = null;
      try {
        parsedManifest = JSON.parse(manifest.body);
      } catch {
        // parse failure recorded below
      }
      record(
        "required",
        "web app manifest parses with a name",
        manifest.response.status === 200 &&
          parsedManifest !== null &&
          typeof parsedManifest.name === "string",
        `status ${manifest.response.status}${parsedManifest === null ? ", body is not valid JSON" : ""}`,
      );
    }

    const sw = await get("/sw.js");
    if (sw.response.status === 404) {
      record("optional", "offline service worker", false, "absent (lands with the offline-fallback PR)");
    } else {
      record(
        "required",
        "offline service worker is cache-free",
        sw.response.status === 200 && !sw.body.includes("caches.open"),
        `status ${sw.response.status}`,
      );
    }
  }

  await checkSecurityHeaders();
  for (const route of CANONICAL_ROUTES) await checkRouteMetadata(route);
  await checkCrawlSurfaces();
  await checkDeadSlug();
  await checkPwaSurfaces();

  const failed = results.filter((r) => !r.ok && r.level === "required").length;
  const warned = results.filter((r) => !r.ok && r.level === "optional").length;
  return { results, failed, warned };
}

// ---- CLI -------------------------------------------------------------------
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const base = process.argv[2] ?? "http://localhost:3000";
  let summary;
  try {
    summary = await runSmoke(base);
  } catch (error) {
    console.error(`\nsmoke run aborted: ${error.message}`);
    process.exit(1);
  }

  for (const { level, name, ok, detail } of summary.results) {
    const tag = ok ? "PASS" : level === "optional" ? "WARN" : "FAIL";
    console.log(`${tag}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  }
  console.log(
    `\n${base}: ${summary.results.length} checks, ${summary.failed} failed, ${summary.warned} warnings`,
  );
  process.exit(summary.failed > 0 ? 1 : 0);
}
