"use client";

import { useEffect } from "react";

// Registers the offline-fallback worker (public/sw.js). Production builds
// only: in dev a registered worker outlives the dev server and confuses hot
// reload. The worker is cache-free (it only answers failed navigations), so
// registration is safe to fire-and-forget — nothing to invalidate between
// deploys.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (private mode, unsupported) just means the
      // browser error page on offline navigations — never worth surfacing.
    });
  }, []);

  return null;
}
