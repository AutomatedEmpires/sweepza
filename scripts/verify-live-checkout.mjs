#!/usr/bin/env node
// Post-payment live-revenue verification for Sweepza. Cross-checks the live
// Stripe account against the production Supabase database and prints a clear
// PASS/FAIL summary. Prints NO secret values (only object ids, statuses, and
// counts). Safe to run repeatedly.
//
// Run:
//   doppler run --project sweepza --config prd -- node scripts/verify-live-checkout.mjs
//
// Reads from env (provided by Doppler): STRIPE_SECRET_KEY (live),
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// STRIPE_PRICE_HOST_BASELINE, STRIPE_PRICE_ADDITIONAL_LISTING.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const SWEEPZA_WEBHOOK_URL = "https://sweepza.com/api/webhooks/stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baselinePrice = process.env.STRIPE_PRICE_HOST_BASELINE;

if (!stripeKey || !supabaseUrl || !supabaseKey) {
  console.error("Missing STRIPE_SECRET_KEY / Supabase env (run under doppler).");
  process.exit(1);
}

const mode = stripeKey.startsWith("sk_live_") ? "LIVE" : "TEST";
const stripe = new Stripe(stripeKey);
const sb = createClient(supabaseUrl, supabaseKey);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

console.log(`\n=== Sweepza live-checkout verification (Stripe mode: ${mode}) ===\n`);

// 1. Stripe account is charge-ready
const account = await stripe.accounts.retrieve();
check(
  "Stripe account KYC/charges ready",
  account.charges_enabled && account.details_submitted,
  `acct ${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled}`,
);

// 2. Sweepza baseline price is live and $19/mo
if (baselinePrice) {
  try {
    const price = await stripe.prices.retrieve(baselinePrice);
    check(
      "Baseline price live + $19/mo",
      price.active && price.unit_amount === 1900 && price.recurring?.interval === "month",
      `${price.id} ${price.unit_amount} ${price.currency}/${price.recurring?.interval}`,
    );
  } catch (e) {
    check("Baseline price live + $19/mo", false, e.message);
  }
}

// 3. Sweepza-namespaced active subscriptions in Stripe
const subs = await stripe.subscriptions.list({ status: "active", limit: 100 });
const sweepzaSubs = subs.data.filter(
  (s) =>
    s.metadata?.venture === "sweepza" ||
    s.items.data.some((i) => i.price.id === baselinePrice),
);
check(
  "Active Sweepza subscription in Stripe",
  sweepzaSubs.length > 0,
  sweepzaSubs.length === 0
    ? "none yet — run AFTER a real checkout"
    : sweepzaSubs.map((s) => `${s.id}(${s.status})`).join(", "),
);

// 4. Cross-check each Stripe sub against the production DB
for (const s of sweepzaSubs) {
  const customerId = typeof s.customer === "string" ? s.customer : s.customer.id;
  const { data: host } = await sb
    .from("host")
    .select("id, display_name")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  check(
    `DB host matches customer ${customerId}`,
    Boolean(host),
    host ? `host ${host.id} (${host.display_name})` : "no host row — webhook desync",
  );
  if (!host) continue;

  const { data: row } = await sb
    .from("subscription")
    .select("status, stripe_subscription_id, max_active_listings, included_active_listings")
    .eq("host_id", host.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const localStatus =
    s.status === "active" || s.status === "trialing" ? "active" : row?.status;
  check(
    `DB subscription synced for host ${host.id}`,
    Boolean(row) &&
      row.stripe_subscription_id === s.id &&
      row.status === localStatus,
    row
      ? `local status=${row.status} sub=${row.stripe_subscription_id} max_slots=${row.max_active_listings}`
      : "no local subscription row — webhook did not sync",
  );
}

// 5. Webhook endpoint is registered + enabled
const endpoints = await stripe.webhookEndpoints.list({ limit: 50 });
const wh = endpoints.data.find((e) => e.url === SWEEPZA_WEBHOOK_URL);
check(
  "Sweepza webhook endpoint enabled",
  Boolean(wh) && wh.status === "enabled",
  wh ? `${wh.id} events=${wh.enabled_events.length}` : "not registered",
);

// 6. Recent subscription events + pending-webhook backlog
const events = await stripe.events.list({
  type: "customer.subscription.created",
  limit: 3,
});
const backlog = events.data.reduce((n, e) => n + (e.pending_webhooks || 0), 0);
check(
  "No stuck subscription webhook deliveries",
  backlog === 0,
  events.data.length === 0
    ? "no subscription.created events yet"
    : `recent=${events.data.length} pending_webhooks=${backlog}`,
);

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== ${failed.length === 0 ? "ALL CHECKS PASSED" : failed.length + " CHECK(S) FAILED"} ===`,
);
process.exit(failed.length === 0 ? 0 : 1);
