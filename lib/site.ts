import { env } from "@/lib/env";

export const APP_NAME = "Sweepza";
export const APP_TAGLINE = "The sweepstakes operating system";
export const APP_DESCRIPTION =
  "Sweepza remembers your sweepstakes so you don't have to — discover, enter, re-enter, track, and win, all from one daily screen.";

export const APP_URL = env.NEXT_PUBLIC_APP_URL ?? "https://sweepza.com";
export const SITE_URL = new URL(APP_URL);
