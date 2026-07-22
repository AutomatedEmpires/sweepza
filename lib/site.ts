import { env } from "@/lib/env";

export const APP_NAME = "Sweepza";
export const APP_TAGLINE = "Sweepstakes Simplified";
export const APP_DESCRIPTION =
  "Discover legitimate sweepstakes, review official sponsor details, and track what you save, enter, and can enter again.";

export const APP_URL = env.NEXT_PUBLIC_APP_URL ?? "https://sweepza.com";
export const SITE_URL = new URL(APP_URL);
