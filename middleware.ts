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

  if (!CLERK_CONFIGURED) {
    return withSecurityHeaders(
      NextResponse.next({ request: { headers: request.headers } }),
      hsts,
      nonce,
    );
  }

  // clerkMiddleware()'s NextMiddlewareResult may be a NextResponse, a
  // plain Response (e.g. a redirect to sign-in), or null/undefined
  // meaning "continue as normal" — only fall back to NextResponse.next()
  // in that last case so we never override an auth decision.
  const response =
    (await clerkMiddleware()(request, event)) ??
    NextResponse.next({ request: { headers: request.headers } });
  return withSecurityHeaders(response, hsts, nonce);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
