"use client";

import { createContext, useContext, type ReactNode } from "react";

// Shared render clock. Time-relative UI (countdowns, "ends today", freshness,
// routine buckets) must render identically during SSR and the first client
// hydration, or React throws a hydration mismatch (#418). Both use the SAME
// server instant, captured once per request in the root layout and passed in
// here. Falls back to the live clock when no provider is mounted (e.g. an
// isolated card in a test) — acceptable because there is no server HTML to
// match in that case.

const NowContext = createContext<number | null>(null);

export function NowProvider({
  value,
  children,
}: {
  value: number;
  children: ReactNode;
}) {
  return <NowContext.Provider value={value}>{children}</NowContext.Provider>;
}

/** Frozen render instant as a Date. Stable across SSR + first hydration. */
export function useNow(): Date {
  const value = useContext(NowContext);
  return value !== null ? new Date(value) : new Date();
}
