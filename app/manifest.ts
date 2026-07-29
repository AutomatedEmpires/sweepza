import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/generated/theme-colors";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/site";

// Web app manifest — Sweepza is a daily-routine product, so installability
// (Add to Home Screen) is a first-class retention surface. Next serves this at
// /manifest.webmanifest and links it from every page automatically.
//
// Colors are the Midnight tokens by design: the manifest format has no theme
// awareness, and the splash/title-bar chrome should match the dark first paint.
// Icons are generated from app/icon.svg — the
// rounded mark with transparency for launchers that keep shapes, plus a
// full-bleed maskable tile whose mark sits inside the safe zone so circular
// and squircle masks never clip it (app/apple-icon.png covers iOS the same
// way via the Next file convention).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_COLORS.midnight.paper,
    theme_color: THEME_COLORS.midnight.paper,
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
      {
        src: "/icons/maskable-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
