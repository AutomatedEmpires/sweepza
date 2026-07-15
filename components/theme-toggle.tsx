"use client";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "@/lib/theme";

// A compact, always-reachable control that cycles the theme preference:
// Auto (follow the local clock) -> Light (Sunrise) -> Dark (Midnight) -> Auto.
// Icon-only to sit cleanly in the top bar; state is announced via aria-label.

const NEXT: Record<ThemePreference, ThemePreference> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};

const META: Record<ThemePreference, { icon: IconName; label: string }> = {
  auto: { icon: "themeAuto", label: "Auto" },
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
