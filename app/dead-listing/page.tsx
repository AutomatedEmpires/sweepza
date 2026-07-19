import type { Metadata } from "next";
import { SweepsNotFound } from "@/components/sweeps-not-found";

// Render target for middleware's hard-404 rewrite. Direct requests are
// intercepted in middleware and sent to the generic 404, so this is not a
// public 200 route.
export const metadata: Metadata = {
  title: "Sweepstakes unavailable",
  robots: { index: false, follow: false },
};

export default function DeadListingPage() {
  return <SweepsNotFound />;
}
