import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileShell } from "@/components/mobile-shell";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MobileShell>{children}</MobileShell>
      </body>
    </html>
  );
}
