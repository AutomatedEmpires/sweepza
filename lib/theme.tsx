"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Sweepza theming — the day/night hybrid engine.
//
// `auto` (the default) follows the user's local clock: Midnight (dark) from
// 8pm to 6am, Sunrise (light) otherwise. The user can pin `light` or `dark`
// at any time and switch back to `auto` just as easily. The chosen preference
// persists in localStorage; the applied theme lives on <html data-theme>.
//
// An inline script in app/layout.tsx sets data-theme before first paint using
// the exact same rule below, so there is never a flash of the wrong theme.

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sweepza-theme";
const DARK_START_HOUR = 20; // 8pm local — switch to Midnight
const DARK_END_HOUR = 6; // 6am local — switch back to Sunrise

export function isNightAt(date: Date): boolean {
  const hour = date.getHours();
  return hour >= DARK_START_HOUR || hour < DARK_END_HOUR;
}

function resolveTheme(preference: ThemePreference, date: Date): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return isNightAt(date) ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") {
      return stored;
    }
  } catch {
    // localStorage unavailable (private mode / blocked) — use the default.
  }
  return "auto";
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
}

interface ThemeContextValue {
  /** What the user chose: auto, light, or dark. */
  preference: ThemePreference;
  /** What is actually applied right now. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("auto");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Hydrate from storage + the current clock on mount. This matches the inline
  // anti-flash script, so there is no visual jump.
  useEffect(() => {
    const nextPreference = readStoredPreference();
    const nextResolved = resolveTheme(nextPreference, new Date());
    setPreferenceState(nextPreference);
    setResolved(nextResolved);
    applyTheme(nextResolved);
  }, []);

  // While on `auto`, re-check the clock every minute (and when the tab regains
  // focus) so the theme flips live at 8pm / 6am without a reload.
  useEffect(() => {
    if (preference !== "auto") return;
    const tick = () => {
      const next = resolveTheme("auto", new Date());
      setResolved((prev) => {
        if (prev !== next) applyTheme(next);
        return next;
      });
    };
    const interval = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage blocked — keep the choice in memory for this session only.
    }
    const nextResolved = resolveTheme(next, new Date());
    setResolved(nextResolved);
    applyTheme(nextResolved);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return context;
}
