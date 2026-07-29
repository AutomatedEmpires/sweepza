"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { THEME_COLORS } from "@/lib/generated/theme-colors";

// Sweepza is Midnight-first. Dark is the default casino experience; signed-in
// users can explicitly choose Sunrise from the Appearance control. The choice
// persists in localStorage and app/layout.tsx mirrors this rule before paint.

export type ThemePreference = "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sweepza-theme";

export function normalizeThemePreference(
  stored: string | null | undefined,
): ThemePreference {
  return stored === "light" ? "light" : "dark";
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const preference = normalizeThemePreference(stored);
    // Migrate the retired `auto` value (and any invalid value) so future
    // sessions have one unambiguous preference.
    if (stored !== preference) {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
    return preference;
  } catch {
    // localStorage unavailable (private mode / blocked) — remain Midnight.
  }
  return "dark";
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
  let themeColor = document.head.querySelector<HTMLMetaElement>(
    "meta[data-sweepza-theme-color]",
  );
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.dataset.sweepzaThemeColor = "";
    document.head.append(themeColor);
  }
  themeColor.dataset.sweepzaSunrise = THEME_COLORS.sunrise.paper;
  themeColor.dataset.sweepzaMidnight = THEME_COLORS.midnight.paper;
  themeColor.content =
    resolved === "dark"
      ? THEME_COLORS.midnight.paper
      : THEME_COLORS.sunrise.paper;
}

interface ThemeContextValue {
  /** What the user chose in the dashboard. */
  preference: ThemePreference;
  /** What is actually applied right now. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  // Hydrate the explicit dashboard choice. This matches the inline anti-flash
  // script, so there is no visual jump.
  useEffect(() => {
    const nextPreference = readStoredPreference();
    setPreferenceState(nextPreference);
    setResolved(nextPreference);
    applyTheme(nextPreference);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage blocked — keep the choice in memory for this session only.
    }
    setResolved(next);
    applyTheme(next);
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
