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
      },
      animation: {
        "settle-in": "settle-in 0.35s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-urgent": "pulse-urgent 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
