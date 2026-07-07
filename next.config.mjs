import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Keep this list in sync with OPTIMIZED_IMAGE_HOSTS in lib/image.ts.
    // Deliberately NOT a wildcard: the image optimizer is an open proxy for
    // any allowlisted host, so only hosts we control or trust belong here.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" }, // listing/host media in Supabase storage
      { protocol: "https", hostname: "img.clerk.com" }, // account avatars
      { protocol: "https", hostname: "picsum.photos" }, // dev-seed placeholders
    ],
  },
};

export default withSentryConfig(nextConfig, { silent: true });
