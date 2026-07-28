import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { MobileShell } from "@/components/mobile-shell";
import { ObservabilityProviders } from "@/components/observability-providers";
import { PublicShell } from "@/components/public-shell";
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

// One contemporary variable family keeps the marketing site and daily utility
// coherent while retaining excellent legibility at dense card sizes.
const manrope = localFont({
  src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "200 800",
  fallback: ["Arial", "sans-serif"],
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
    { media: "(prefers-color-scheme: light)", color: "#fffaf4" },
    { media: "(prefers-color-scheme: dark)", color: "#111916" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Only read the per-request nonce when CSP enforcement is active: headers()
// makes every route dynamic, and in the default report-only mode the static
// marketing pages should stay static. Flipping CSP_ENFORCE requires a
// redeploy (docs/runbooks/csp-enforcement.md).
const CSP_ENFORCE = process.env.CSP_ENFORCE === "true";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = CSP_ENFORCE
    ? ((await headers()).get("x-nonce") ?? undefined)
    : undefined;
  const authUser = await ensureCurrentAppUser();
  const initialSeekerState = authUser
    ? await getSeekerStateSnapshotForAppUser(authUser.appUserId)
    : { primary: {}, saved: {}, activity: {} };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={manrope.variable}
    >
      <body>
        <script
          nonce={nonce}
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
            {authUser ? (
              <MobileShell utility={<ShellUtilityBar authUser={authUser} />}>
                {children}
              </MobileShell>
            ) : (
              <PublicShell>{children}</PublicShell>
            )}
          </SweepzaProviders>
        </ObservabilityProviders>
      </body>
    </html>
  );
}
