// Sweepza offline navigation fallback.
//
// Deliberately cache-free: this worker never stores responses, so it can
// never serve a stale deploy, hold onto old chunks, or fight the CDN. Its
// only job is answering a FAILED page navigation (offline, captive portal,
// dead radio) with a self-contained branded page instead of the browser
// error screen. Assets and data requests pass through untouched.
//
// The fallback document inlines all of its styling and ships zero scripts,
// so it renders with no network and stays valid under the enforcing
// nonce-based CSP (style-src allows 'unsafe-inline'; script-src does not
// need to apply).

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Offline · Sweepza</title>
<style>
  :root {
    --paper: #f5f0e7; --surface: #ffffff; --ink: #17130f;
    --graphite: #6e655a; --ember: #c13e19; --line: rgba(23, 19, 15, 0.12);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #0e0b14; --surface: #1a1622; --ink: #f3eee6;
      --graphite: #b0a7bd; --ember: #f0633a; --line: rgba(243, 238, 230, 0.14);
    }
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: var(--paper); color: var(--ink); padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    text-align: center;
  }
  main { max-width: 22rem; }
  .mark {
    width: 58px; height: 58px; border-radius: 16px; background: var(--ember);
    color: #f5f0e7; font-size: 32px; font-weight: 800; line-height: 58px;
    margin: 0 auto 20px;
  }
  h1 { font-size: 28px; line-height: 1.15; letter-spacing: -0.02em; }
  p { margin-top: 12px; font-size: 14px; line-height: 1.6; color: var(--graphite); }
  a.retry {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; margin-top: 24px; padding: 10px 22px; border-radius: 12px;
    background: var(--ember); color: #fff; font-size: 14px; font-weight: 600;
    text-decoration: none;
  }
  .hint { margin-top: 20px; font-size: 12px; }
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true">S</div>
  <h1>You&rsquo;re offline</h1>
  <p>Sweepza couldn&rsquo;t reach the network. Your saved and entered sweeps are safe &mdash; they&rsquo;ll be right where you left them.</p>
  <a class="retry" href="">Try again</a>
  <p class="hint">Reconnect and retry &mdash; nothing on your account is lost while you&rsquo;re away.</p>
</main>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
    ),
  );
});
