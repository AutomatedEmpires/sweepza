"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
  const [now, setNow] = useState(value);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 60_000);
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") update();
    };

    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", updateWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, []);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

/** Shared render clock: frozen for hydration, then advanced after mount. */
export function useNow(): Date {
  const value = useContext(NowContext);
  return value !== null ? new Date(value) : new Date();
}
