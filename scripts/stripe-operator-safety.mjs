import {
  closeSync,
  constants,
  openSync,
  unlinkSync,
} from "node:fs";

export const SWEEPZA_LIVE_WEBHOOK_URL =
  "https://sweepza.com/api/webhooks/stripe";
export const SWEEPZA_SUPABASE_PROJECT_REF = "ojwhsntcpmoxnzisuomq";
export const APPROVED_STRIPE_ACCOUNT_IDS = Object.freeze({
  test: "acct_1TeqgHD7Yqq488pB",
  live: null,
});

export function getStripeKeyMode(key) {
  const match = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/.exec(key ?? "");
  return match?.[1] ?? null;
}

export function isValidStripeAccountId(accountId) {
  return /^acct_[A-Za-z0-9]+$/.test(accountId ?? "");
}

export function getApprovedStripeAccountId(mode) {
  return mode === "test" || mode === "live"
    ? APPROVED_STRIPE_ACCOUNT_IDS[mode]
    : null;
}

export function isExpectedSupabaseProjectUrl(url, projectRef) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname === `${projectRef}.supabase.co`
    );
  } catch {
    return false;
  }
}

export function isAllowedSweepzaWebhookUrl(url, mode) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/api/webhooks/stripe" ||
      parsed.search ||
      parsed.hash
    ) {
      return false;
    }
    if (mode === "live") return parsed.href === SWEEPZA_LIVE_WEBHOOK_URL;
    return parsed.href === "https://sweepza.vercel.app/api/webhooks/stripe";
  } catch {
    return false;
  }
}

export function isAllowedSecretOutputPath(outputPath) {
  return (
    typeof outputPath === "string" &&
    /^\/tmp\/stripe-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(outputPath)
  );
}

export function reserveSecretOutput(outputPath) {
  if (!isAllowedSecretOutputPath(outputPath)) {
    throw new Error("Secret output path is outside the allowed /tmp/stripe-* boundary.");
  }
  return openSync(
    outputPath,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
}

export function releaseSecretOutput(fd, outputPath, { keepSecretOutput }) {
  closeSync(fd);
  if (!keepSecretOutput) unlinkSync(outputPath);
}

export function hasExpectedRecurringPriceEconomics(price, expected) {
  return Boolean(
    price?.active === true &&
      price.currency === "usd" &&
      price.unit_amount === expected.unitAmount &&
      price.recurring?.interval === "month" &&
      price.recurring?.interval_count === 1,
  );
}

export function isReusableSweepzaPrice(price, expected) {
  return Boolean(
    hasExpectedRecurringPriceEconomics(price, expected) &&
      price.metadata?.venture === "sweepza" &&
      price.metadata?.sweepza_key === expected.lookup,
  );
}

export function mergeRequiredWebhookEvents(existingEvents, requiredEvents) {
  if (existingEvents.includes("*")) return [...existingEvents];
  return [...new Set([...existingEvents, ...requiredEvents])];
}

/**
 * @param {{
 *   key?: string,
 *   expectedAccountId?: string,
 *   liveConfirmation?: string,
 *   webhookUrl?: string,
 *   secretOutputPath?: string
 * }} input
 */
export function inspectProvisioningPreflight({
  key,
  expectedAccountId,
  liveConfirmation = undefined,
  webhookUrl = undefined,
  secretOutputPath = undefined,
}) {
  const mode = getStripeKeyMode(key);
  const approvedAccountId = getApprovedStripeAccountId(mode);
  const errors = [];

  if (!mode) errors.push("STRIPE_SECRET_KEY must be an sk/rk test or live key.");
  if (!isValidStripeAccountId(expectedAccountId)) {
    errors.push("Provide a valid --expected-account acct_... binding.");
  }
  if (mode && !approvedAccountId) {
    errors.push(
      `No ${mode} Stripe account is approved in the checked-in Sweepza allowlist.`,
    );
  } else if (approvedAccountId && expectedAccountId !== approvedAccountId) {
    errors.push(
      `Expected account must equal the checked-in ${mode} Sweepza account.`,
    );
  }
  if (
    mode === "live" &&
    approvedAccountId &&
    liveConfirmation !== approvedAccountId
  ) {
    errors.push(
      "Live mutation requires --confirm-live-account with the exact approved account id.",
    );
  }
  if (!webhookUrl) {
    errors.push("Provide an explicit --webhook-url for the Sweepza endpoint.");
  } else if (mode && !isAllowedSweepzaWebhookUrl(webhookUrl, mode)) {
    errors.push("Webhook URL is not an allowed Sweepza Stripe endpoint.");
  }
  if (!isAllowedSecretOutputPath(secretOutputPath)) {
    errors.push(
      "Secret output must be a new /tmp/stripe-* file with no subdirectories.",
    );
  }

  return { ok: errors.length === 0, mode, approvedAccountId, errors };
}
