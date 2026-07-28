"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { analyticsPathname } from "@/lib/analytics-path";
import { ensurePosthog } from "@/lib/posthog/client";

function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    void (async () => {
      const { capture } = await import("@/lib/posthog/client");
      capture("$pageview", {
        $current_url: analyticsPathname(pathname),
      });
    })();
  }, [pathname]);

  return null;
}

export function ObservabilityProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensurePosthog();
  }, []);

  return (
    <>
      <PageViewTracker />
      {children}
    </>
  );
}
