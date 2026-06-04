import type { Config } from "tailwindcss";

// NOTE: Placeholder warm/premium-adventure tokens. Refined in the Design System lane
// against the locked Design System spec.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f1a17",
        cream: "#fbf7f0",
        sand: "#efe4d2",
        ember: "#e2622f",
        moss: "#5c7a5a",
        sky: "#3b6ea5",
      },
      borderRadius: {
        card: "1.25rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
