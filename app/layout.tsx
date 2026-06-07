import type { Metadata, Viewport } from "next";
import { Patrick_Hand } from "next/font/google";
import "./globals.css";
import { MobileShell } from "@/components/mobile-shell";
import { ObservabilityProviders } from "@/components/observability-providers";
import { SeekerStateProvider } from "@/lib/seeker-state";
import { MOCK_LISTINGS } from "@/lib/mock/listings";
import type { SeekerUiState } from "@/lib/types/listing";

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
        <ObservabilityProviders>
          <SeekerStateProvider initial={initialSeekerState}>
            <MobileShell>{children}</MobileShell>
          </SeekerStateProvider>
        </ObservabilityProviders>
      </body>
    </html>
  );
}
