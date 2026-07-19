import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_ROUTES, isLocalBase, runSmoke } from "../smoke.mjs";

// Drives the smoke harness against fixture HTTP servers so its WARN/FAIL
// branching can't silently weaken: a fully healthy deployment yields zero
// failures, and each guarded regression (missing permissions directive,
// wrong-origin canonical, divergent og:url, malformed manifest, cached
// service worker, non-404 dead slug) flips the required-failure count.

interface Fixture {
  server: Server;
  base: string;
}

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) => new Promise((resolve) => server.close(resolve)),
    ),
  );
});

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy-report-only": "default-src 'self'",
};

interface FixtureOptions {
  headers?: Record<string, string>;
  canonicalOrigin?: string | ((base: string) => string);
  ogUrl?: "match" | "divergent" | "missing";
  manifestBody?: string;
  swBody?: string;
  deadSlugStatus?: number;
}

function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = new URL(req.url ?? "/", "http://fixture").pathname;
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const headers = { ...SECURITY_HEADERS, ...options.headers };

      const page = (route: string) => {
        const origin =
          typeof options.canonicalOrigin === "function"
            ? options.canonicalOrigin(base)
            : options.canonicalOrigin ?? base;
        const canonical = `${origin}${route}`;
        const ogMode = options.ogUrl ?? "match";
        const og =
          ogMode === "missing"
            ? ""
            : `<meta property="og:url" content="${ogMode === "match" ? canonical : `${origin}/`}"/>`;
        res.writeHead(200, { ...headers, "content-type": "text/html" });
        res.end(
          `<html><head><link rel="canonical" href="${canonical}"/>${og}</head><body>ok</body></html>`,
        );
      };

      if (path === "/") {
        res.writeHead(200, { ...headers, "content-type": "text/html" });
        res.end("<html><head></head><body>home</body></html>");
      } else if (CANONICAL_ROUTES.includes(path)) {
        page(path);
      } else if (path === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\n");
      } else if (path === "/sitemap.xml") {
        res.writeHead(200, { "content-type": "application/xml" });
        res.end('<?xml version="1.0"?><urlset></urlset>');
      } else if (path === "/manifest.webmanifest") {
        res.writeHead(200, { "content-type": "application/manifest+json" });
        res.end(options.manifestBody ?? JSON.stringify({ name: "Sweepza" }));
      } else if (path === "/sw.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(options.swBody ?? "self.addEventListener('fetch', () => {});");
      } else if (path.startsWith("/sweeps/")) {
        res.writeHead(options.deadSlugStatus ?? 404, { "content-type": "text/html" });
        res.end("<html><body>gone</body></html>");
      } else {
        res.writeHead(404, { "content-type": "text/html" });
        res.end("nope");
      }
    });
    openServers.push(server);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function failures(summary: Awaited<ReturnType<typeof runSmoke>>): string[] {
  return summary.results
    .filter((r) => !r.ok && r.level === "required")
    .map((r) => r.name);
}

describe("isLocalBase", () => {
  it("treats localhost and loopback as local, real hosts as remote", () => {
    expect(isLocalBase("http://localhost:3000")).toBe(true);
    expect(isLocalBase("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalBase("https://sweepza.com")).toBe(false);
    expect(isLocalBase("https://preview.vercel.app")).toBe(false);
  });
});

describe("runSmoke against fixture deployments", () => {
  it("passes a fully healthy remote-strict deployment with zero failures", async () => {
    const { base } = await startFixture();
    const summary = await runSmoke(base, { treatAsLocal: false });
    expect(failures(summary)).toEqual([]);
    expect(summary.failed).toBe(0);
  });

  it("fails when a permissions-policy directive is dropped", async () => {
    const { base } = await startFixture({
      headers: { "permissions-policy": "camera=(), geolocation=()" },
    });
    const summary = await runSmoke(base, { treatAsLocal: false });
    expect(failures(summary)).toContain("header permissions-policy");
  });

  it("fails a wrong-origin canonical on a remote deployment but tolerates it locally", async () => {
    const { base } = await startFixture({
      canonicalOrigin: "https://sweepza.com",
    });
    const remote = await runSmoke(base, { treatAsLocal: false });
    expect(failures(remote).some((name) => name.includes("canonical is exact"))).toBe(true);

    const local = await runSmoke(base, { treatAsLocal: true });
    expect(failures(local).some((name) => name.includes("canonical is exact"))).toBe(false);
  });

  it("fails an og:url that diverges from the canonical", async () => {
    const { base } = await startFixture({ ogUrl: "divergent" });
    const summary = await runSmoke(base, { treatAsLocal: false });
    expect(failures(summary).some((name) => name.includes("og:url matches canonical"))).toBe(true);
  });

  it("fails a route with a canonical but no route-level og:url", async () => {
    const { base } = await startFixture({ ogUrl: "missing" });
    const summary = await runSmoke(base, { treatAsLocal: false });
    expect(failures(summary).some((name) => name.includes("og:url matches canonical"))).toBe(true);
  });

  it("fails a malformed manifest even when it contains the word name", async () => {
    const { base } = await startFixture({ manifestBody: '{"name": "Sweepza"' });
    const summary = await runSmoke(base, { treatAsLocal: false });
    expect(failures(summary)).toContain("web app manifest parses with a name");
  });

  it("fails a service worker that reintroduces caching", async () => {
    const { base } = await startFixture({
      swBody: "caches.open('v1').then(() => {});",
    });
    const summary = await runSmoke(base, { treatAsLocal: false });
    expect(failures(summary)).toContain("offline service worker is cache-free");
  });

  it("requires dead-slug 404s remotely but only warns locally", async () => {
    const { base } = await startFixture({ deadSlugStatus: 200 });
    const remote = await runSmoke(base, { treatAsLocal: false });
    expect(failures(remote)).toContain("dead /sweeps slug is a real 404");

    const local = await runSmoke(base, { treatAsLocal: true });
    expect(failures(local)).not.toContain("dead /sweeps slug is a real 404");
    expect(local.warned).toBeGreaterThan(0);
  });
});
