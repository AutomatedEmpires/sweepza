import type { Metadata, Viewport } from "next";
import { Patrick_Hand } from "next/font/google";
import "./globals.css";
import { MobileShell } from "@/components/mobile-shell";
import { SeekerStateProvider } from "@/lib/seeker-state";
import { MOCK_LISTINGS } from "@/lib/mock/listings";
import type { SeekerUiState } from "@/lib/types/listing";

// Hand-drawn marker face for sweeps-card titles and ribbons. Exposed as the
// `font-display` Tailwind token via the --font-display CSS variable. Body copy
// continues to use the system sans stack.
const display = Patrick_Hand({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sweepza — Sweepstakes | Simplified",
    template: "%s · Sweepza",
  },
  description:
    "Sweepza is a fast, photo-first way to discover sweepstakes worth entering.",
  metadataBase: new URL("https://sweepza.com"),
  openGraph: {
    title: "Sweepza",
    description: "Sweepstakes | Simplified",
    url: "https://sweepza.com",
    siteName: "Sweepza",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#e2622f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Seed the seeker-state store from mock data so Discover and Saved share state
// within a session. Replaced by Supabase-backed state in Lane B.
const initialSeekerState: Record<string, SeekerUiState> = Object.fromEntries(
  MOCK_LISTINGS.filter((l) => l.seekerState).map((l) => [
    l.id,
    l.seekerState!.primaryUiState,
  ]),
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <body>
        <SeekerStateProvider initial={initialSeekerState}>
          <MobileShell>{children}</MobileShell>
        </SeekerStateProvider>
      </body>
    </html>
  );
}
