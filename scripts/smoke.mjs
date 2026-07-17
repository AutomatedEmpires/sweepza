#!/usr/bin/env node
// Sweepza smoke checks — dependency-free (Node 18+ fetch only), so it runs
// against ANY deployment: a local `pnpm start`, a Vercel preview you're
// signed into, or production.
//
//   pnpm ops:smoke                       # http://localhost:3000
//   pnpm ops:smoke https://sweepza.com   # production
//
// Two severities:
//  - required: invariants of main today — a FAIL flips the exit code.
//  - optional: surfaces that ship in open PRs (manifest, service worker,
//    real-404 dead slugs). Absent → WARN, present-but-broken → FAIL.
// Extraction is regex-grade on purpose: this is a smoke harness, not a
// parser; every pattern targets markup Next emits deterministically.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");

const results = [];
function record(level, name, ok, detail = "") {
  results.push({ level, name, ok, detail });
}

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
  record("required", `header ${name}`, ok, ok ? "" : `got: ${value ?? "(absent)"} — expected ${expectation}`);
}

// ---- 1. Security headers on the front door -------------------------------
async function checkSecurityHeaders() {
  const { response } = await get("/");
  record("required", "GET / responds 200", response.status === 200, `status ${response.status}`);
  const headers = response.headers;

  checkHeader(headers, "x-content-type-options", (v) => v === "nosniff", "nosniff");
  checkHeader(headers, "x-frame-options", (v) => v === "DENY", "DENY");
  checkHeader(headers, "referrer-policy", (v) => v.includes("strict-origin-when-cross-origin"), "strict-origin-when-cross-origin");
  checkHeader(headers, "permissions-policy", (v) => v.includes("camera=()"), "camera/mic/geo disabled");

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

// ---- 2. Metadata canon on public routes -----------------------------------
const CANONICAL_ROUTES = [
  "/discover",
  "/about",
  "/faq",
  "/privacy",
  "/terms",
  "/cookies",
  "/winners",
  "/my-sweeps",
];

async function checkRouteMetadata(route) {
  const { response, body } = await get(route);
  if (response.status !== 200) {
    record("required", `${route} responds 200`, false, `status ${response.status}`);
    return;
  }
  record("required", `${route} responds 200`, true);

  const canonical = body.match(/rel="canonical" href="([^"]+)"/)?.[1];
  // Canonical + per-route og:url land route-by-route (PRs #70/#81/#83);
  // absence is a WARN until those merge, wrong values are a FAIL.
  if (!canonical) {
    record("optional", `${route} canonical`, false, "absent (lands with the metadata-canon PRs)");
  } else {
    record("required", `${route} canonical points at itself`, canonical.endsWith(route), `got ${canonical}`);
  }

  const ogUrls = body.match(/property="og:url"/g)?.length ?? 0;
  record("required", `${route} has at most one og:url`, ogUrls <= 1, `count ${ogUrls}`);
}

// ---- 3. Crawl surfaces -----------------------------------------------------
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

// ---- 4. Dead listing links -------------------------------------------------
async function checkDeadSlug() {
  const { response, body } = await get("/sweeps/smoke-check-nonexistent-slug");
  if (response.status === 404) {
    record("optional", "dead /sweeps slug is a real 404", true);
    return;
  }
  // Pre-#80 (metadata-phase notFound) a streamed miss can commit 200; Next
  // still stamps noindex on the not-found body, which keeps it SEO-safe.
  const noindexed = /name="robots"[^>]*noindex|content="noindex/.test(body);
  record(
    "optional",
    "dead /sweeps slug is a real 404",
    false,
    `status ${response.status}${noindexed ? " (noindex present — SEO-safe)" : " — investigate on a DB-backed deployment (a DB-less local server errors here instead of 404ing)"}`,
  );
}

// ---- 5. PWA surfaces (ship in open PRs; absent = WARN) ---------------------
async function checkPwaSurfaces() {
  const manifest = await get("/manifest.webmanifest");
  if (manifest.response.status === 404) {
    record("optional", "web app manifest", false, "absent (lands with the PWA PR)");
  } else {
    record(
      "required",
      "web app manifest parses",
      manifest.response.status === 200 && manifest.body.includes('"name"'),
      `status ${manifest.response.status}`,
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

// ---- run --------------------------------------------------------------------
try {
  await checkSecurityHeaders();
  for (const route of CANONICAL_ROUTES) await checkRouteMetadata(route);
  await checkCrawlSurfaces();
  await checkDeadSlug();
  await checkPwaSurfaces();
} catch (error) {
  console.error(`\nsmoke run aborted: ${error.message}`);
  process.exit(1);
}

let failures = 0;
let warns = 0;
for (const { level, name, ok, detail } of results) {
  let tag;
  if (ok) {
    tag = "PASS";
  } else if (level === "optional") {
    tag = "WARN";
    warns += 1;
  } else {
    tag = "FAIL";
    failures += 1;
  }
  console.log(`${tag}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

console.log(
  `\n${base}: ${results.length} checks, ${failures} failed, ${warns} warnings`,
);
process.exit(failures > 0 ? 1 : 0);
