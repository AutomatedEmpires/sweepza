import type { Config } from "tailwindcss";

// Sweepza design system — the "editorial memory" identity.
// Warm paper canvas, real white surfaces for contrast, one confident ember
// action, and a small, deliberate state palette (urgency / trust / won / new).
// Prize photography is the hero; color supports content, never buries it.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core neutrals
        ink: "#17130f", // primary text — deep warm near-black
        graphite: "#6e655a", // secondary text — AA on paper/surface
        paper: "#f5f0e7", // app canvas — warm, calm
        surface: "#ffffff", // card/sheet surface — contrast against paper
        line: "#e7dfd0", // hairline borders

        // Legacy aliases (kept so existing components adopt the new palette
        // without a rename sweep). cream≈paper, sand≈line, moss→pine, sky→ocean.
        cream: "#f5f0e7",
        sand: "#e7dfd0",
        moss: "#3e6b52", // trust / verified / positive (premium pine)
        sky: "#35506b", // information / new (cool accent)

        // Action + state
        ember: "#e0532b", // primary action (confident warm)
        flame: "#c9381f", // urgency — ends today / tonight
        gold: "#b0812a", // won / celebration
        ocean: "#35506b", // new / info
        pine: "#3e6b52", // trust / verified
      },
      borderRadius: {
        card: "1.1rem",
        sheet: "1.75rem",
        pill: "999px",
      },
      boxShadow: {
        e1: "0 1px 2px rgba(23,19,15,0.04), 0 2px 8px rgba(23,19,15,0.05)",
        e2: "0 4px 14px rgba(23,19,15,0.08), 0 2px 6px rgba(23,19,15,0.05)",
        e3: "0 18px 48px rgba(23,19,15,0.16), 0 6px 16px rgba(23,19,15,0.08)",
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
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(62,107,82,0)" },
          "50%": { boxShadow: "0 0 0 4px rgba(62,107,82,0.14)" },
        },
        // Won — a single slow sheen sweep across the action on the moment
        // the win lands.
        sheen: {
          "0%": { transform: "translateX(-130%) skewX(-12deg)" },
          "100%": { transform: "translateX(240%) skewX(-12deg)" },
        },
      },
      animation: {
        "settle-in": "settle-in 0.35s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-urgent": "pulse-urgent 2s ease-in-out infinite",
        "save-pop": "save-pop 0.34s cubic-bezier(0.34,1.56,0.64,1)",
        "pop-in": "pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
        "ready-glow": "ready-glow 2.6s ease-in-out infinite",
        sheen: "sheen 2.4s ease-in-out 0.15s",
      },
    },
  },
  plugins: [],
};

export default config;
