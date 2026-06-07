import type { Metadata, Viewport } from "next";
import { Patrick_Hand } from "next/font/google";
import "./globals.css";
import { MobileShell } from "@/components/mobile-shell";
import { ShellUtilityBar } from "@/components/shell-utility-bar";
import { SweepzaProviders } from "@/components/sweepza-providers";
import { ensureCurrentAppUser } from "@/lib/auth";
import { getSeekerStateSnapshotForAppUser } from "@/lib/db/seeker-state";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  SITE_URL,
} from "@/lib/site";

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
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  metadataBase: SITE_URL,
  openGraph: {
    title: APP_NAME,
    description: APP_TAGLINE,
    url: SITE_URL,
    siteName: APP_NAME,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#e2622f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await ensureCurrentAppUser();
  const initialSeekerState = authUser
    ? await getSeekerStateSnapshotForAppUser(authUser.appUserId)
    : { primary: {}, saved: {} };

  return (
    <html lang="en" className={display.variable}>
      <body>
        <SweepzaProviders
          clerkPublishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
          initialSeekerState={initialSeekerState}
          persistenceMode={authUser ? "remote" : "local"}
        >
          <MobileShell utility={<ShellUtilityBar authUser={authUser} />}>
            {children}
          </MobileShell>
        </SweepzaProviders>
      </body>
    </html>
  );
}
