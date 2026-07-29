"use client";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";

// Dashboard-only theme control. Midnight is the product default; this explicit
// choice switches between Midnight and the optional Sunrise palette.

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "light",
};

const META: Record<ThemePreference, { icon: IconName; label: string }> = {
  light: { icon: "sun", label: "Light" },
  dark: { icon: "moon", label: "Dark" },
};

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const meta = META[preference];

  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[preference])}
      aria-label={`Theme: ${meta.label}. Tap to switch.`}
      title={`Theme: ${meta.label}`}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-pill border border-line text-graphite transition hover:bg-ink/5 hover:text-ink",
        className,
      )}
    >
      <Icon name={meta.icon} size={18} />
    </button>
  );
}
