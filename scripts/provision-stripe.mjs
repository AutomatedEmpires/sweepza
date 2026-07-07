#!/usr/bin/env node
// Provisions the Stripe objects Sweepza's billing code expects
// (lib/billing/plans.ts): the baseline host plan and the extra-listing
// add-on, plus the subscription webhook endpoint. Idempotent — looks up by
// metadata key before creating. Run under Doppler so the key never touches
// disk or logs:
//   doppler run --project sweepza --config dev -- node scripts/provision-stripe.mjs \
//     --webhook-url https://sweepza.vercel.app/api/webhooks/stripe
//
// Prints ONLY non-secret identifiers (product/price/endpoint ids). The
// webhook signing secret is written to the path given via --secret-out
// (mode 0600) for the caller to store in the secret manager, never stdout.

import Stripe from "stripe";
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) =>
    a.startsWith("--") ? [a.slice(2), all[i + 1]] : [],
  ).filter((p) => p.length),
);

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY missing from environment (run under doppler run).");
  process.exit(1);
}
const mode = key.startsWith("sk_live_") ? "live" : "test";
const stripe = new Stripe(key);

const WEBHOOK_URL = args["webhook-url"];
const SECRET_OUT = args["secret-out"] ?? "/tmp/stripe-whsec";

// Pricing: add-on $5/mo matches the amount already hardcoded in
// lib/db/host-dashboard.ts (addSlotPriceMonthly: 5). Baseline $19/mo for the
// 3 included slots (HOST_BASELINE_PLAN.includedActiveListings) — adjustable
// later in the Stripe Dashboard by creating a new price and swapping the env
// var; no code change needed.
const PLANS = [
  {
    lookup: "sweepza_host_baseline",
    name: "Sweepza Host Plan",
    description:
      "Baseline Sweepza host subscription — includes 3 active listing slots, host dashboard, analytics, and promotion tools.",
    unitAmount: 1900,
    envVar: "STRIPE_PRICE_HOST_BASELINE",
  },
  {
    lookup: "sweepza_additional_listing",
    name: "Sweepza Extra Active Listing",
    description:
      "Adds one active listing slot on top of the baseline Sweepza host plan. Quantity adjustable.",
    unitAmount: 500,
    envVar: "STRIPE_PRICE_ADDITIONAL_LISTING",
  },
];

async function ensureProductAndPrice(plan) {
  const existing = await stripe.products.search({
    query: `metadata["sweepza_key"]:"${plan.lookup}" AND active:"true"`,
  });
  let product = existing.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { sweepza_key: plan.lookup, venture: "sweepza" },
    });
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
  let price = prices.data.find(
    (p) => p.recurring?.interval === "month" && p.unit_amount === plan.unitAmount,
  );
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: { interval: "month" },
      metadata: { sweepza_key: plan.lookup },
    });
  }
  return { product: product.id, price: price.id, envVar: plan.envVar, amount: plan.unitAmount };
}

async function ensureWebhook(url) {
  if (!url) return null;
  const events = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ];
  const endpoints = await stripe.webhookEndpoints.list({ limit: 50 });
  const existing = endpoints.data.find((e) => e.url === url && e.status === "enabled");
  if (existing) {
    // Signing secret is only returned at creation; if it already exists we
    // can't re-read it — report and let the operator rotate if needed.
    return { id: existing.id, url: existing.url, secretWritten: false, note: "existing endpoint reused; secret not re-readable" };
  }
  const created = await stripe.webhookEndpoints.create({
    url,
    enabled_events: events,
    description: "Sweepza subscription sync",
  });
  writeFileSync(SECRET_OUT, created.secret, { mode: 0o600 });
  return { id: created.id, url: created.url, secretWritten: true };
}

const results = [];
for (const plan of PLANS) {
  results.push(await ensureProductAndPrice(plan));
}
const webhook = await ensureWebhook(WEBHOOK_URL);

console.log(JSON.stringify({ mode, plans: results, webhook }, null, 2));
