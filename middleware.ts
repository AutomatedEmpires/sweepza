import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildContentSecurityPolicy,
  createNonce,
  withSecurityHeaders,
} from "@/lib/security-headers";

// Enforcement is a deliberate activation (docs/runbooks/csp-enforcement.md):
// flipping this env flag switches the report-only policy to an enforcing,
// nonce-based one AND makes every page dynamic (nonces cannot be prerendered).
// Requires a redeploy to take effect — static pages bake at build time.
const CSP_ENFORCE = process.env.CSP_ENFORCE === "true";

const CLERK_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

// Only send HSTS from the canonical production host, never from preview
// deployments (a *.vercel.app response with includeSubDomains would pin HSTS
// onto unrelated preview hosts).
const CANONICAL_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
      : null;
  } catch {
    return null;
  }
})();

const SWEEP_DETAIL_PATH = /^\/sweeps\/([^/]+)\/?$/;
const DEAD_LISTING_RENDER_PATH = "/dead-listing";
const LISTING_PROBE_TIMEOUT_MS = 2_500;

function isMiddlewareDecision(
  request: NextRequest,
  response: Response | undefined,
): boolean {
  if (!response) return false;
  if (response.headers.get("x-middleware-next") === "1") return false;

  // Clerk 7 decorates a normal pass-through by rewriting to the original
  // request URL while forwarding auth context. A different rewrite target,
  // redirect, or other response is an explicit middleware decision.
  const rewrite = response.headers.get("x-middleware-rewrite");
  if (rewrite) {
    try {
      return new URL(rewrite, request.url).toString() !== request.url;
    } catch {
      return true;
    }
  }
  return true;
}

function headersForRewrite(response: Response | undefined): Headers {
  const headers = new Headers(response?.headers);
  // A response cannot both continue and rewrite. Keep Clerk's forwarded
  // response headers, but rebuild the request-forwarding control headers
  // below so the rewrite has one unambiguous instruction set.
  headers.delete("x-middleware-next");
  headers.delete("x-middleware-rewrite");
  headers.delete("x-middleware-override-headers");
  for (const name of [...headers.keys()]) {
    if (name.startsWith("x-middleware-request-")) headers.delete(name);
  }
  return headers;
}

function requestHeadersForRewrite(
  request: NextRequest,
  response: Response | undefined,
): Headers {
  const headers = new Headers(request.headers);
  const overrideNames = response?.headers
    .get("x-middleware-override-headers")
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  for (const name of overrideNames ?? []) {
    const value = response?.headers.get(`x-middleware-request-${name}`);
    if (value === null || value === undefined) headers.delete(name);
    else headers.set(name, value);
  }
  return headers;
}

/**
 * App Router loading boundaries stream before a page-level notFound() can
 * change the status code. Probe the existing public listing endpoint before
 * rendering so a confirmed missing slug can be routed to a real 404. Errors
 * fail open: a provider outage must not turn a possibly-live listing into a
 * false 404.
 */
async function rewriteMissingSweep(
  request: NextRequest,
  hsts: boolean,
  nonce: string | null,
  clerkResponse: Response | undefined,
): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const match = request.nextUrl.pathname.match(SWEEP_DETAIL_PATH);
  if (!match) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LISTING_PROBE_TIMEOUT_MS);

  try {
    const probeUrl = new URL(
      `/api/listings/${encodeURIComponent(match[1])}`,
      request.url,
    );
    const probe = await fetch(probeUrl, {
      method: "HEAD",
      cache: "no-store",
      headers: { "user-agent": "sweepza-listing-availability/1.0" },
      signal: controller.signal,
    });
    if (probe.status !== 404) return null;

    // Render the dedicated recovery page while preserving the original URL
    // and committing the 404 before any loading boundary can stream a 200.
    const notFoundUrl = request.nextUrl.clone();
    notFoundUrl.pathname = DEAD_LISTING_RENDER_PATH;
    notFoundUrl.search = "";

    const responseHeaders = headersForRewrite(clerkResponse);
    responseHeaders.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );

    return withSecurityHeaders(
      NextResponse.rewrite(notFoundUrl, {
        status: 404,
        headers: responseHeaders,
        request: { headers: requestHeadersForRewrite(request, clerkResponse) },
      }),
      hsts,
      nonce,
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const hsts = CANONICAL_HOST !== null && request.nextUrl.host === CANONICAL_HOST;

  // In enforcing mode the nonce is threaded to the app two ways: `x-nonce`
  // for our own inline scripts (root layout reads it), and the CSP request
  // header from which Next extracts the nonce to stamp its framework inline
  // scripts automatically.
  const nonce = CSP_ENFORCE ? createNonce() : null;
  if (nonce) {
    request.headers.set("x-nonce", nonce);
    request.headers.set(
      "Content-Security-Policy",
      buildContentSecurityPolicy(nonce),
    );
  }

  // Run Clerk before any custom rewrite. Pass-through response headers carry
  // Clerk's request context; redirects and other explicit decisions must be
  // returned untouched apart from the shared security headers.
  const clerkResponse = CLERK_CONFIGURED
    ? ((await clerkMiddleware()(request, event)) ?? undefined)
    : undefined;
  if (isMiddlewareDecision(request, clerkResponse)) {
    return withSecurityHeaders(clerkResponse!, hsts, nonce);
  }

  // The render target is internal-only. A direct request must not expose a
  // standalone 200 page, but an internal rewrite reaches it without running
  // middleware a second time.
  if (request.nextUrl.pathname === DEAD_LISTING_RENDER_PATH) {
    const notFoundUrl = request.nextUrl.clone();
    notFoundUrl.pathname = "/_sweepza/dead-listing";
    return withSecurityHeaders(
      NextResponse.rewrite(notFoundUrl, {
        headers: headersForRewrite(clerkResponse),
        request: { headers: requestHeadersForRewrite(request, clerkResponse) },
      }),
      hsts,
      nonce,
    );
  }

  const missingSweepResponse = await rewriteMissingSweep(
    request,
    hsts,
    nonce,
    clerkResponse,
  );
  if (missingSweepResponse) return missingSweepResponse;

  const response =
    clerkResponse ??
    NextResponse.next({ request: { headers: request.headers } });
  return withSecurityHeaders(response, hsts, nonce);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
