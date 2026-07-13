import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { MobileShell } from "@/components/mobile-shell";
import { ObservabilityProviders } from "@/components/observability-providers";
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

// Editorial display face — high-contrast, optical-sizing serif for headlines,
// prize values, and large numerals. Authoritative, not handwritten.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

// UI face — clean, legible grotesque for all functional text and data.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0b14" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await ensureCurrentAppUser();
  const initialSeekerState = authUser
    ? await getSeekerStateSnapshotForAppUser(authUser.appUserId)
    : { primary: {}, saved: {}, activity: {} };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable}`}
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=localStorage.getItem('sweepza-theme')||'auto';var h=new Date().getHours();var d=p==='dark'||(p==='auto'&&(h>=20||h<6));document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
          }}
        />
        <ObservabilityProviders>
          <SweepzaProviders
            clerkPublishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
            initialSeekerState={initialSeekerState}
            persistenceMode={authUser ? "remote" : "local"}
            serverNow={Date.now()}
          >
            <MobileShell utility={<ShellUtilityBar authUser={authUser} />}>
              {children}
            </MobileShell>
          </SweepzaProviders>
        </ObservabilityProviders>
      </body>
    </html>
  );
}
