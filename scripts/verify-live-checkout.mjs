#!/usr/bin/env node
// Post-payment live-revenue verification for Sweepza. Cross-checks the live
// Stripe account against the production Supabase database and prints a clear
// PASS/FAIL summary. Prints NO secret values (only object ids, statuses, and
// counts). Safe to run repeatedly.
//
// Run:
//   doppler run --project sweepza --config prd -- node scripts/verify-live-checkout.mjs \
//     --expected-account acct_...
//
// Reads from env (provided by Doppler): STRIPE_SECRET_KEY (live),
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// STRIPE_PRICE_HOST_BASELINE, STRIPE_PRICE_ADDITIONAL_LISTING.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import {
  BASELINE_INCLUDED_ACTIVE_LISTINGS,
  inspectSubscriptionEntitlement,
  isExpectedRecurringPrice,
  toLocalSubscriptionStatus,
} from "./verify-live-checkout-helpers.mjs";
import {
  SWEEPZA_SUPABASE_PROJECT_REF,
  getApprovedStripeAccountId,
  getStripeKeyMode,
  isExpectedSupabaseProjectUrl,
} from "./stripe-operator-safety.mjs";

const SWEEPZA_WEBHOOK_URL = "https://sweepza.com/api/webhooks/stripe";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg, index, all) =>
      arg.startsWith("--") ? [arg.slice(2), all[index + 1]] : [],
    )
    .filter((pair) => pair.length),
);

const stripeKey = process.env.STRIPE_SECRET_KEY;
const expectedAccountId = args["expected-account"];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baselinePrice = process.env.STRIPE_PRICE_HOST_BASELINE;
const additionalPrice = process.env.STRIPE_PRICE_ADDITIONAL_LISTING;

const missingEnv = [
  ["STRIPE_SECRET_KEY", stripeKey],
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", supabaseKey],
  ["STRIPE_PRICE_HOST_BASELINE", baselinePrice],
  ["STRIPE_PRICE_ADDITIONAL_LISTING", additionalPrice],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnv.length > 0) {
  console.error(`Missing required env: ${missingEnv.join(", ")} (run under doppler).`);
  process.exit(1);
}

if (getStripeKeyMode(stripeKey) !== "live") {
  console.error(
    "FAIL  Stripe mode — a live Stripe key is required; no provider checks were run.",
  );
  process.exit(1);
}

const approvedLiveAccountId = getApprovedStripeAccountId("live");
if (!approvedLiveAccountId) {
  console.error(
    "FAIL  Stripe account binding — no live account is approved in the checked-in Sweepza allowlist; no provider checks were run.",
  );
  process.exit(1);
}

if (expectedAccountId !== approvedLiveAccountId) {
  console.error(
    "FAIL  Stripe account binding — --expected-account must equal the checked-in approved live account; no provider checks were run.",
  );
  process.exit(1);
}

if (!isExpectedSupabaseProjectUrl(supabaseUrl, SWEEPZA_SUPABASE_PROJECT_REF)) {
  console.error(
    `FAIL  Supabase binding — expected exact project ${SWEEPZA_SUPABASE_PROJECT_REF}; no provider checks were run.`,
  );
  process.exit(1);
}

const stripe = new Stripe(stripeKey);
const account = await stripe.accounts.retrieve();
if (account.id !== approvedLiveAccountId) {
  console.error(
    `FAIL  Stripe account binding — authenticated ${account.id}, expected ${approvedLiveAccountId}; no further provider or database checks were run.`,
  );
  process.exit(1);
}
const sb = createClient(supabaseUrl, supabaseKey);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

console.log("\n=== Sweepza live-checkout verification (Stripe mode: LIVE) ===\n");

// 1. Stripe account is charge-ready
check(
  "Stripe account KYC/charges ready",
  account.charges_enabled && account.details_submitted,
  `acct ${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled}`,
);

// 2. Both Sweepza prices are live, active, recurring, and venture-scoped.
async function verifyPrice(label, priceId, unitAmount, lookupKey) {
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    check(
      label,
      isExpectedRecurringPrice(price, { unitAmount, lookupKey }),
      `${price.id} live=${price.livemode} active=${price.active} ${price.unit_amount} ${price.currency}/${price.recurring?.interval}`,
    );
    return price;
  } catch (e) {
    check(label, false, e instanceof Error ? e.message : "price lookup failed");
    return null;
  }
}

const [verifiedBaselinePrice, verifiedAdditionalPrice] = await Promise.all([
  verifyPrice(
    "Baseline price live + $19/mo + Sweepza-owned",
    baselinePrice,
    1900,
    "sweepza_host_baseline",
  ),
  verifyPrice(
    "Add-on price live + $5/mo + Sweepza-owned",
    additionalPrice,
    500,
    "sweepza_additional_listing",
  ),
]);
check(
  "Baseline and add-on use distinct prices/products",
  Boolean(verifiedBaselinePrice) &&
    Boolean(verifiedAdditionalPrice) &&
    verifiedBaselinePrice.id !== verifiedAdditionalPrice.id &&
    (typeof verifiedBaselinePrice.product === "object"
      ? verifiedBaselinePrice.product.id
      : verifiedBaselinePrice.product) !==
      (typeof verifiedAdditionalPrice.product === "object"
        ? verifiedAdditionalPrice.product.id
        : verifiedAdditionalPrice.product),
  `${baselinePrice} / ${additionalPrice}`,
);

// 3. Sweepza-namespaced subscriptions in Stripe, including canceled ones so
// the same command proves both activation and cancellation synchronization.
const subs = await stripe.subscriptions.list({ status: "all", limit: 100 });
const sweepzaSubs = subs.data.filter(
  (s) =>
    s.metadata?.venture === "sweepza" ||
    s.items.data.some((i) => i.price.id === baselinePrice),
);
check(
  "Sweepza subscription in Stripe (active or canceled)",
  sweepzaSubs.length > 0,
  sweepzaSubs.length === 0
    ? "none yet — run AFTER a real checkout"
    : sweepzaSubs
        .map(
          (s) =>
            `${s.id}(${s.status}${s.cancel_at_period_end ? ", cancel_at_period_end" : ""})`,
        )
        .join(", "),
);
check(
  "Sweepza subscription objects are live",
  sweepzaSubs.length > 0 && sweepzaSubs.every((s) => s.livemode === true),
  sweepzaSubs.length === 0
    ? "no Sweepza subscription objects"
    : `checked=${sweepzaSubs.length}`,
);

// 4. Cross-check each Stripe sub against the production DB
for (const s of sweepzaSubs) {
  const entitlement = inspectSubscriptionEntitlement(
    s,
    baselinePrice,
    additionalPrice,
  );
  check(
    `Stripe entitlement metadata matches line items ${s.id}`,
    entitlement.valid,
    `baseline_qty=${entitlement.baselineQuantity} included=${entitlement.included} additional_qty=${entitlement.additionalQuantity} purchased=${entitlement.purchased} max=${entitlement.max}`,
  );

  const customerId = typeof s.customer === "string" ? s.customer : s.customer.id;
  const { data: host, error: hostError } = await sb
    .from("host")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  check(
    `DB host matches customer ${customerId}`,
    !hostError && Boolean(host),
    hostError
      ? `host lookup failed: ${hostError.message}`
      : host
        ? `host ${host.id}`
        : "no host row — webhook desync",
  );
  if (!host) continue;

  const { data: row, error: rowError } = await sb
    .from("subscription")
    .select(
      "host_id, status, stripe_subscription_id, max_active_listings, included_active_listings, purchased_additional_listings",
    )
    .eq("stripe_subscription_id", s.id)
    .maybeSingle();
  const localStatus = toLocalSubscriptionStatus(s.status);
  check(
    `DB subscription synced for host ${host.id}`,
    !rowError &&
      Boolean(row) &&
      row.host_id === host.id &&
      row.stripe_subscription_id === s.id &&
      row.status === localStatus,
    rowError
      ? `subscription lookup failed: ${rowError.message}`
      : row
        ? `stripe status=${s.status} local status=${row.status} sub=${row.stripe_subscription_id}`
        : "no local subscription row — webhook did not sync",
  );
  check(
    `DB slot entitlement synced for host ${host.id}`,
    !rowError &&
      Boolean(row) &&
      row.included_active_listings === BASELINE_INCLUDED_ACTIVE_LISTINGS &&
      row.purchased_additional_listings === entitlement.additionalQuantity &&
      row.max_active_listings === entitlement.expectedMax,
    row
      ? `included=${row.included_active_listings} purchased=${row.purchased_additional_listings} max=${row.max_active_listings} expected_max=${entitlement.expectedMax}`
      : "no local subscription row — entitlement unavailable",
  );
}

// 5. Webhook endpoint is registered + enabled
const endpoints = await stripe.webhookEndpoints.list({ limit: 50 });
const wh = endpoints.data.find((e) => e.url === SWEEPZA_WEBHOOK_URL);
check(
  "Sweepza live webhook endpoint enabled",
  Boolean(wh) && wh.status === "enabled" && wh.livemode === true,
  wh
    ? `${wh.id} live=${wh.livemode} events=${wh.enabled_events.length}`
    : "not registered",
);

// 6. Recent subscription events + pending-webhook backlog
const events = await stripe.events.list({
  type: "customer.subscription.created",
  limit: 3,
});
const backlog = events.data.reduce((n, e) => n + (e.pending_webhooks || 0), 0);
check(
  "No stuck live subscription webhook deliveries",
  events.data.every((event) => event.livemode === true) && backlog === 0,
  events.data.length === 0
    ? "no subscription.created events yet"
    : `recent=${events.data.length} pending_webhooks=${backlog}`,
);

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== ${failed.length === 0 ? "ALL CHECKS PASSED" : failed.length + " CHECK(S) FAILED"} ===`,
);
process.exit(failed.length === 0 ? 0 : 1);
