"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Root-level error boundary: catches render failures in the root layout
// itself, so it must provide its own <html>/<body> and inline styling.
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
          background: "#fdf6ec",
          color: "#2f2a25",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Sweepza hit a snag
          </h1>
          <p style={{ opacity: 0.7, maxWidth: "40ch", margin: "0 auto 1rem" }}>
            Something broke while loading the app. It&apos;s been reported.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "none",
              borderRadius: "999px",
              background: "#5a7d5a",
              color: "#fdf6ec",
              padding: "10px 22px",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
