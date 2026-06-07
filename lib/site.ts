import { env } from "@/lib/env";

export const APP_NAME = "Sweepza";
export const APP_TAGLINE = "Photo-first sweepstakes discovery";
export const APP_DESCRIPTION =
  "Sweepza is a photo-first sweepstakes discovery app with visual browse, fast entry, and transparent odds.";

export const APP_URL = env.NEXT_PUBLIC_APP_URL ?? "https://sweepza.com";
export const SITE_URL = new URL(APP_URL);
