"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ensurePosthog } from "@/lib/posthog/client";

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const url = `${pathname}${searchParams?.toString() ? `?${searchParams}` : ""}`;
    void (async () => {
      const { capture } = await import("@/lib/posthog/client");
      capture("$pageview", { $current_url: url });
    })();
  }, [pathname, searchParams]);

  return null;
}

export function ObservabilityProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensurePosthog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  );
}
