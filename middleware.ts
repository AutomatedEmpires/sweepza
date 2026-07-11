import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const CLERK_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

function withSecurityHeaders<T extends Response>(response: T): T {
  // Mutate headers in place so we never discard/replace whatever
  // clerkMiddleware() returned (e.g. a redirect Response) — Clerk's
  // NextMiddlewareResult can be a NextResponse or a plain Response,
  // and all Response-like values expose a mutable `.headers` (a
  // standard Headers instance) that we can set on directly without
  // touching status/body/redirect target.
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (!CLERK_CONFIGURED) {
    return withSecurityHeaders(NextResponse.next());
  }

  // clerkMiddleware()'s NextMiddlewareResult may be a NextResponse, a
  // plain Response (e.g. a redirect to sign-in), or null/undefined
  // meaning "continue as normal" — only fall back to NextResponse.next()
  // in that last case so we never override an auth decision.
  const response = (await clerkMiddleware()(request, event)) ?? NextResponse.next();
  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
