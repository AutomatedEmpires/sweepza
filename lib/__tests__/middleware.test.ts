import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
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
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clerk.impl.mockReset();
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

  it("rewrites a confirmed missing sweep before streaming can commit a 200", async () => {
    const probe = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", probe);
    const middleware = await loadMiddleware({
      enforce: false,
      appUrl: "https://sweepza.com",
    });
    const response = await middleware(
      new NextRequest("https://sweepza.com/sweeps/gone-sweep"),
      EVENT,
    );

    expect(probe).toHaveBeenCalledWith(
      new URL("https://sweepza.com/api/listings/gone-sweep"),
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://sweepza.com/dead-listing",
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      STRICT_TRANSPORT_SECURITY,
    );
  });

  it("continues normally when the listing exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    const middleware = await loadMiddleware({ enforce: false });
    const response = await middleware(
      new NextRequest("https://sweepza.test/sweeps/live-sweep"),
      EVENT,
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(cspHeaders(response).reportOnly).toBe(CONTENT_SECURITY_POLICY);
  });

  it("does not expose the dead-listing render target as a direct 200 route", async () => {
    const middleware = await loadMiddleware({ enforce: false });
    const response = await middleware(
      new NextRequest("https://sweepza.test/dead-listing"),
      EVENT,
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://sweepza.test/_sweepza/dead-listing",
    );
  });

  it("preserves Clerk context and the enforcing nonce on a missing-sweep rewrite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    clerk.impl.mockImplementation(async (request) => {
      const clerkHeaders = new Headers(request.headers);
      clerkHeaders.set("x-test-clerk-context", "signed-in");
      // Clerk 7's decorateRequest() represents pass-through as a rewrite to
      // the original URL, not x-middleware-next.
      return NextResponse.rewrite(request.nextUrl, {
        request: { headers: clerkHeaders },
      });
    });
    const middleware = await loadMiddleware({
      enforce: true,
      clerkConfigured: true,
    });
    const request = new NextRequest(
      "https://sweepza.test/sweeps/signed-in-missing-sweep",
    );
    request.headers.set("cookie", "_vercel_jwt=preview-session");
    request.headers.set("x-vercel-protection-bypass", "preview-bypass");
    request.headers.set("authorization", "Bearer do-not-forward");
    request.headers.set("x-unrelated", "do-not-forward");
    const response = await middleware(request, EVENT);

    expect(clerk.impl).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const probeHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers;
    expect(probeHeaders.get("cookie")).toBe("_vercel_jwt=preview-session");
    expect(probeHeaders.get("x-vercel-protection-bypass")).toBe(
      "preview-bypass",
    );
    expect(probeHeaders.get("authorization")).toBeNull();
    expect(probeHeaders.get("x-unrelated")).toBeNull();
    expect(response.status).toBe(404);
    const nonce = request.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(response.headers.get("Content-Security-Policy")).toContain(
      `'nonce-${nonce}'`,
    );
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(
      response.headers.get("x-middleware-request-x-test-clerk-context"),
    ).toBe("signed-in");
  });

  it("fails open after a bounded availability-probe timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
      ),
    );
    const middleware = await loadMiddleware({ enforce: false });
    const pending = middleware(
      new NextRequest("https://sweepza.test/sweeps/slow-probe"),
      EVENT,
    );
    await vi.advanceTimersByTimeAsync(2_500);
    const response = await pending;

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(cspHeaders(response).reportOnly).toBe(CONTENT_SECURITY_POLICY);
  });

  it("fails open when the availability probe errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const middleware = await loadMiddleware({ enforce: false });
    const response = await middleware(
      new NextRequest("https://sweepza.test/sweeps/maybe-live"),
      EVENT,
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(cspHeaders(response).reportOnly).toBe(CONTENT_SECURITY_POLICY);
  });
});
