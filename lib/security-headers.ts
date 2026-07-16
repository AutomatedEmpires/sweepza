// Security headers shared by middleware. Kept as plain constants so they're
// edge-safe (no Node APIs) and unit-testable.
//
// CSP ships REPORT-ONLY first: it never blocks, it only surfaces what an
// enforcing policy would break. script-src deliberately omits 'unsafe-inline'
// so the report phase reveals every inline script we'd need to nonce before
// flipping to an enforcing Content-Security-Policy. Widen origins here as
// providers change; the enforce step (nonce-based) is a tracked follow-up.

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

export const CONTENT_SECURITY_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([directive, values]) => `${directive} ${values.join(" ")}`)
  .join("; ");

// 2 years, cover subdomains. `preload` (list submission) is a deliberate later
// step — omitted until every subdomain is confirmed HTTPS.
export const STRICT_TRANSPORT_SECURITY = "max-age=63072000; includeSubDomains";
