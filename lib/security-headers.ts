// Security headers shared by middleware. Kept edge-safe (no Node APIs) and
// unit-testable.
//
// Two CSP modes, selected by the CSP_ENFORCE env flag (see middleware.ts):
//  - default: REPORT-ONLY — never blocks, only surfaces what an enforcing
//    policy would break. script-src deliberately omits 'unsafe-inline' so the
//    report phase reveals every inline script that needs a nonce.
//  - CSP_ENFORCE=true: an ENFORCING policy whose script-src carries the
//    per-request nonce plus 'strict-dynamic' — nonce'd scripts (Next's own
//    bootstrap plus our theme script) may load their children (chunks, Clerk,
//    Stripe, PostHog loaders), while the host allowlist remains as the
//    fallback for browsers without 'strict-dynamic'.
// Activation steps + rollback live in docs/runbooks/csp-enforcement.md.

const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://js.stripe.com",
    "https://*.posthog.com",
    "https://*.i.posthog.com",
    "https://challenges.cloudflare.com",
  ],
  // Inline styles are common (Tailwind/next) and low-risk — allowed for now.
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://*.supabase.co",
    "https://img.clerk.com",
    "https://*.stripe.com",
  ],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://clerk-telemetry.com",
    "https://*.supabase.co",
    "https://*.posthog.com",
    "https://*.i.posthog.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://api.stripe.com",
  ],
  "frame-src": [
    "https://js.stripe.com",
    "https://hooks.stripe.com",
    "https://*.clerk.com",
    "https://challenges.cloudflare.com",
  ],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

/**
 * Serialize the policy, optionally binding a per-request script nonce.
 * Without a nonce this is the report-only target policy; with one it is the
 * enforcing policy (nonce + 'strict-dynamic' prepended to script-src).
 */
export function buildContentSecurityPolicy(nonce?: string): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, values]) => {
      if (directive === "script-src" && nonce) {
        return `${directive} ${["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...values.filter((v) => v !== "'self'")].join(" ")}`;
      }
      return `${directive} ${values.join(" ")}`;
    })
    .join("; ");
}

export const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy();

// 2 years, cover subdomains. `preload` (list submission) is a deliberate later
// step — omitted until every subdomain is confirmed HTTPS.
export const STRICT_TRANSPORT_SECURITY = "max-age=63072000; includeSubDomains";
