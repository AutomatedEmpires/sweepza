import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import {
  CONTENT_SECURITY_POLICY,
  STRICT_TRANSPORT_SECURITY,
  createNonce,
  withSecurityHeaders,
} from "@/lib/security-headers";

// The middleware reads CSP_ENFORCE / Clerk keys at module load, so each case
// stubs the env and re-imports a fresh copy. clerkMiddleware is mocked at the
// module boundary; its behavior is set per test through `clerk.impl`.
const clerk = vi.hoisted(() => ({
  impl: vi.fn<(request: NextRequest, event: NextFetchEvent) => Promise<Response | undefined>>(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: () => clerk.impl,
}));

const EVENT = undefined as unknown as NextFetchEvent;

async function loadMiddleware(env: {
  enforce?: boolean;
  clerkConfigured?: boolean;
  appUrl?: string;
}) {
  vi.resetModules();
  vi.stubEnv("CSP_ENFORCE", env.enforce ? "true" : "");
  vi.stubEnv(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    env.clerkConfigured ? "pk_test_stub" : "",
  );
  vi.stubEnv("CLERK_SECRET_KEY", env.clerkConfigured ? "sk_test_stub" : "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", env.appUrl ?? "");
  const mod = await import("@/middleware");
  return mod.default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

function cspHeaders(response: Response) {
  return {
    enforcing: response.headers.get("Content-Security-Policy"),
    reportOnly: response.headers.get("Content-Security-Policy-Report-Only"),
  };
}

describe("createNonce", () => {
  it("returns base64 of 16 random bytes and never repeats", () => {
    const a = createNonce();
    const b = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(atob(b)).toHaveLength(16);
    expect(a).not.toBe(b);
  });
});

describe("withSecurityHeaders", () => {
  it("emits the report-only policy (and no enforcing one) without a nonce", () => {
    const response = withSecurityHeaders(new Response(), false, null);
    const { enforcing, reportOnly } = cspHeaders(response);
    expect(reportOnly).toBe(CONTENT_SECURITY_POLICY);
    expect(enforcing).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("emits exactly one enforcing policy with a nonce, superseding report-only", () => {
    const response = new Response();
    // Simulate a response that somehow already carries the report-only header,
    // to pin the exactly-one-CSP-header invariant.
    response.headers.set("Content-Security-Policy-Report-Only", "stale");
    withSecurityHeaders(response, false, "abc123");
    const { enforcing, reportOnly } = cspHeaders(response);
    expect(enforcing).toContain("'nonce-abc123'");
    expect(enforcing).toContain("'strict-dynamic'");
    expect(reportOnly).toBeNull();
  });

  it("adds HSTS only when asked", () => {
    const response = withSecurityHeaders(new Response(), true, null);
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      STRICT_TRANSPORT_SECURITY,
    );
  });

  it("preserves the status and target of a redirect response", () => {
    const redirect = new Response(null, {
      status: 307,
      headers: { location: "https://sweepza.test/sign-in" },
    });
    const response = withSecurityHeaders(redirect, false, "n0nce");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://sweepza.test/sign-in");
    expect(cspHeaders(response).enforcing).toContain("'nonce-n0nce'");
  });
});

describe("middleware CSP flag branch", () => {
  it("flag off: report-only response header, no nonce touches the request", async () => {
    const middleware = await loadMiddleware({ enforce: false });
    const request = new NextRequest("https://sweepza.test/");
    const response = await middleware(request, EVENT);
    const { enforcing, reportOnly } = cspHeaders(response);
    expect(reportOnly).toBe(CONTENT_SECURITY_POLICY);
    expect(enforcing).toBeNull();
    expect(request.headers.get("x-nonce")).toBeNull();
    expect(request.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("flag on: enforcing response header and nonce forwarded to the app on both request headers", async () => {
    const middleware = await loadMiddleware({ enforce: true });
    const request = new NextRequest("https://sweepza.test/");
    const response = await middleware(request, EVENT);
    const { enforcing, reportOnly } = cspHeaders(response);
    expect(enforcing).toContain("'strict-dynamic'");
    expect(reportOnly).toBeNull();

    const nonce = request.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(enforcing).toContain(`'nonce-${nonce}'`);
    // Next reads the nonce for its own inline scripts from the CSP request header.
    expect(request.headers.get("Content-Security-Policy")).toContain(
      `'nonce-${nonce}'`,
    );
  });

  it("flag on + Clerk configured: the nonce'd request reaches Clerk and the pass-through response is stamped", async () => {
    clerk.impl.mockResolvedValue(undefined);
    const middleware = await loadMiddleware({
      enforce: true,
      clerkConfigured: true,
    });
    const request = new NextRequest("https://sweepza.test/");
    const response = await middleware(request, EVENT);

    expect(clerk.impl).toHaveBeenCalledTimes(1);
    const seenRequest = clerk.impl.mock.calls[0][0];
    expect(seenRequest.headers.get("x-nonce")).toBe(
      request.headers.get("x-nonce"),
    );

    const { enforcing, reportOnly } = cspHeaders(response);
    expect(enforcing).toContain(`'nonce-${request.headers.get("x-nonce")}'`);
    expect(reportOnly).toBeNull();
  });

  it("flag off + Clerk configured: report-only stamped onto Clerk's own response (e.g. a redirect)", async () => {
    clerk.impl.mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: "https://sweepza.test/sign-in" },
      }),
    );
    const middleware = await loadMiddleware({
      enforce: false,
      clerkConfigured: true,
    });
    const response = await middleware(
      new NextRequest("https://sweepza.test/dashboard"),
      EVENT,
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://sweepza.test/sign-in",
    );
    const { enforcing, reportOnly } = cspHeaders(response);
    expect(reportOnly).toBe(CONTENT_SECURITY_POLICY);
    expect(enforcing).toBeNull();
  });

  it("sends HSTS only on the canonical host", async () => {
    const middleware = await loadMiddleware({
      enforce: false,
      appUrl: "https://sweepza.com",
    });
    const canonical = await middleware(
      new NextRequest("https://sweepza.com/"),
      EVENT,
    );
    expect(canonical.headers.get("Strict-Transport-Security")).toBe(
      STRICT_TRANSPORT_SECURITY,
    );

    const preview = await middleware(
      new NextRequest("https://sweepza-git-branch.vercel.app/"),
      EVENT,
    );
    expect(preview.headers.get("Strict-Transport-Security")).toBeNull();
  });
});
