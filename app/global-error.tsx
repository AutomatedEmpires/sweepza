"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Icon } from "@/components/icon";

// Root-level error boundary: catches render failures in the root layout
// itself, so it must provide its own <html>/<body> and inline styling —
// the compiled Tailwind stylesheet is not guaranteed to load here since the
// root layout (which imports globals.css) is bypassed. Colors below are the
// locked design tokens' hex values, hard-coded for that reason.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f5f0e7" /* paper */,
          color: "#17130f" /* ink */,
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            maxWidth: "360px",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              height: "56px",
              width: "56px",
              borderRadius: "9999px",
              background: "rgba(224,83,43,0.1)" /* ember/10 */,
              color: "#c13e19" /* ember */,
            }}
          >
            <Icon name="flag" size={26} />
          </span>
          <div>
            <h1
              style={{
                fontFamily: "Georgia, serif" /* font-display fallback */,
                fontSize: "1.75rem",
                margin: 0,
                color: "#17130f" /* ink */,
              }}
            >
              Sweepza hit a snag
            </h1>
            <p
              style={{
                color: "#6e655a" /* graphite */,
                maxWidth: "40ch",
                margin: "8px auto 0",
                fontSize: "0.9rem",
                lineHeight: 1.6,
              }}
            >
              Something broke while loading the app. It&apos;s been reported.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: "none",
                borderRadius: "0.75rem" /* rounded-xl */,
                background: "#c13e19" /* ember */,
                color: "#ffffff",
                padding: "10px 22px",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Try again
            </button>
            {/* Plain anchor: global-error renders its own <html> outside the
                app router, so next/link is not appropriate here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "44px",
                borderRadius: "0.75rem" /* rounded-xl */,
                border: "1px solid #e7dfd0" /* line */,
                color: "rgba(23,19,15,0.75)" /* ink/75 */,
                padding: "10px 22px",
                fontSize: "0.9rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Go to Today
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
