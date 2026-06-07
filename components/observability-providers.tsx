"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ensurePosthog } from "@/lib/posthog/client";

export function ObservabilityProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    ensurePosthog();
  }, []);

  useEffect(() => {
    // Page view capture via App Router changes. Avoid PII.
    const url = `${pathname}${searchParams?.toString() ? `?${searchParams}` : ""}`;
    // Lazy import to avoid hard dependency during SSR.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const { capture } = await import("@/lib/posthog/client");
      capture("$pageview", { $current_url: url });
    })();
  }, [pathname, searchParams]);

  return children;
}
