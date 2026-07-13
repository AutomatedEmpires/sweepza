import type { Config } from "tailwindcss";

// Sweepza design system. Every color, radius, and shadow below is backed by a
// themeable CSS variable declared in app/tokens.css — this file only maps the
// semantic Tailwind names onto those tokens. To retune the brand or the two
// themes (Sunrise / Midnight), edit app/tokens.css, not this file.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // Theme is driven by [data-theme="dark"] on <html> (see lib/theme.tsx), so
  // any future `dark:` utilities key off that attribute rather than the OS.
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // `<alpha-value>` keeps Tailwind opacity modifiers (e.g. bg-ember/10)
        // working in both themes, since each token is stored as RGB channels.
        ink: "rgb(var(--color-text) / <alpha-value>)",
        graphite: "rgb(var(--color-text-muted) / <alpha-value>)",
        paper: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-2) / <alpha-value>)",
        line: "rgb(var(--color-border) / <alpha-value>)",

        // Legacy aliases kept so existing components need no rename sweep.
        cream: "rgb(var(--color-bg) / <alpha-value>)",
        sand: "rgb(var(--color-border) / <alpha-value>)",
        moss: "rgb(var(--color-trust) / <alpha-value>)",
        sky: "rgb(var(--color-info) / <alpha-value>)",

        // Action + state
        ember: "rgb(var(--color-accent) / <alpha-value>)",
        flame: "rgb(var(--color-urgent) / <alpha-value>)",
        gold: "rgb(var(--color-won) / <alpha-value>)",
        ocean: "rgb(var(--color-info) / <alpha-value>)",
        pine: "rgb(var(--color-trust) / <alpha-value>)",
        "on-accent": "rgb(var(--color-on-accent) / <alpha-value>)",
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        sheet: "var(--radius-sheet)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        e1: "var(--shadow-e1)",
        e2: "var(--shadow-e2)",
        e3: "var(--shadow-e3)",
      },
      fontFamily: {
        // Inter for UI/body; Fraunces for editorial display + numerals.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      keyframes: {
        "settle-in": {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.99)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-urgent": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        // Memory lifecycle motion — the signature interactions around
        // remembering, recurrence, and winning.
        "save-pop": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(0.82)" },
          "100%": { transform: "scale(1)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "60%": { transform: "scale(1.12)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // "Ready again" recurrence — a calm breathing ring that invites
        // re-entry without shouting. This is the memory engine made visible.
        "ready-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(var(--color-trust) / 0)" },
          "50%": { boxShadow: "0 0 0 4px rgb(var(--color-trust) / 0.14)" },
        },
        // Won — a single slow sheen sweep across the action on the moment
        // the win lands.
        sheen: {
          "0%": { transform: "translateX(-130%) skewX(-12deg)" },
          "100%": { transform: "translateX(240%) skewX(-12deg)" },
        },
        // Contained celebration — coins rise over the prize on entry; a win
        // adds falling confetti. Both are clipped to the card cover.
        "coin-rise": {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.5)" },
          "20%": { opacity: "1" },
          "100%": {
            opacity: "0",
            transform: "translate(var(--drift, 0px), -64px) scale(1)",
          },
        },
        "confetti-fall": {
          "0%": { opacity: "0", transform: "translateY(-6px) rotate(0deg)" },
          "15%": { opacity: "1" },
          "100%": {
            opacity: "0",
            transform: "translate(var(--drift, 0px), 54px) rotate(200deg)",
          },
        },
      },
      animation: {
        "settle-in": "settle-in 0.35s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-urgent": "pulse-urgent 2s ease-in-out infinite",
        "save-pop": "save-pop 0.34s cubic-bezier(0.34,1.56,0.64,1)",
        "pop-in": "pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
        "ready-glow": "ready-glow 2.6s ease-in-out infinite",
        sheen: "sheen 2.4s ease-in-out 0.15s",
        "coin-rise": "coin-rise 1.05s cubic-bezier(0.22,1,0.36,1) both",
        "confetti-fall": "confetti-fall 1.1s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
