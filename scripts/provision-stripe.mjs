#!/usr/bin/env node
// Provisions the Stripe objects Sweepza's billing code expects
// (lib/billing/plans.ts): the baseline host plan and the extra-listing
// add-on, plus the subscription webhook endpoint. Idempotent — looks up by
// metadata key before creating. Run under Doppler so the key never touches
// disk or logs:
//   doppler run --project sweepza --config dev -- node scripts/provision-stripe.mjs \
//     --expected-account acct_... \
//     --webhook-url https://sweepza.vercel.app/api/webhooks/stripe
// Live mode additionally requires: --confirm-live-account acct_...
//
// Prints ONLY non-secret identifiers (product/price/endpoint ids). The
// webhook signing secret is written to the path given via --secret-out
// (mode 0600) for the caller to store in the secret manager, never stdout.

import Stripe from "stripe";
import { writeFileSync } from "node:fs";
import {
  REQUIRED_STRIPE_WEBHOOK_EVENTS,
  getSweepzaMetadataState,
  inspectProvisioningPreflight,
  isOwnedSweepzaAccountWebhook,
  mergeRequiredWebhookEvents,
  releaseSecretOutput,
  reserveSecretOutput,
  selectSweepzaPriceCandidate,
} from "./stripe-operator-safety.mjs";
import {
  listAllStripePages,
  persistWebhookSecretWithRollback,
  runProvisioningWorkflow,
} from "./provision-stripe-workflow.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) =>
    a.startsWith("--") ? [a.slice(2), all[i + 1]] : [],
  ).filter((p) => p.length),
);

const key = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_URL = args["webhook-url"];
const SECRET_OUT = args["secret-out"] ?? "/tmp/stripe-whsec";
const EXPECTED_ACCOUNT = args["expected-account"];
const LIVE_CONFIRMATION = args["confirm-live-account"];

const preflight = inspectProvisioningPreflight({
  key,
  expectedAccountId: EXPECTED_ACCOUNT,
  liveConfirmation: LIVE_CONFIRMATION,
  webhookUrl: WEBHOOK_URL,
  secretOutputPath: SECRET_OUT,
});
let stripe;

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

async function discoverProductAndPrice(plan) {
  const activeProducts = await listAllStripePages(
    (startingAfter) =>
      stripe.products.list({
        active: true,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    { label: "active product" },
  );
  const keyedProducts = activeProducts.filter(
    (product) => product.metadata?.sweepza_key === plan.lookup,
  );
  const productStates = keyedProducts.map((product) => ({
    product,
    state: getSweepzaMetadataState(product.metadata, plan.lookup),
  }));
  if (productStates.some(({ state }) => state !== "exact")) {
    throw new Error(
      `Refusing ambiguous product key ${plan.lookup}: matching product is not venture=sweepza.`,
    );
  }
  if (productStates.length > 1) {
    throw new Error(
      `Refusing ambiguous product key ${plan.lookup}: multiple active products match.`,
    );
  }
  const productMatch = productStates[0] ?? null;
  const product = productMatch?.product ?? null;
  if (!product) {
    return {
      plan,
      product: null,
      price: null,
      priceNeedsMetadataUpgrade: false,
    };
  }

  const activePrices = await listAllStripePages(
    (startingAfter) =>
      stripe.prices.list({
        product: product.id,
        active: true,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    { label: `active price for ${plan.lookup}` },
  );
  const priceMatch = selectSweepzaPriceCandidate(activePrices, {
    unitAmount: plan.unitAmount,
    lookup: plan.lookup,
  });
  return {
    plan,
    product,
    price: priceMatch?.price ?? null,
    priceNeedsMetadataUpgrade: priceMatch?.state === "legacy",
  };
}

async function applyProductAndPrice(discovery) {
  const { plan } = discovery;
  let product = discovery.product;
  if (!product) {
    product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { sweepza_key: plan.lookup, venture: "sweepza" },
    });
  }
  let price = discovery.price;
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
      metadata: { sweepza_key: plan.lookup, venture: "sweepza" },
    });
  } else if (discovery.priceNeedsMetadataUpgrade) {
    price = await stripe.prices.update(price.id, {
      metadata: { ...price.metadata, venture: "sweepza" },
    });
  }
  return {
    product: product.id,
    price: price.id,
    envVar: plan.envVar,
    amount: plan.unitAmount,
  };
}

async function discoverWebhook(url) {
  const events = REQUIRED_STRIPE_WEBHOOK_EVENTS;
  const endpoints = await listAllStripePages(
    (startingAfter) =>
      stripe.webhookEndpoints.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    { label: "webhook endpoint" },
  );
  const matches = endpoints.filter((endpoint) => endpoint.url === url);
  if (matches.length > 1) {
    throw new Error("Refusing ambiguous webhook state: multiple endpoints match.");
  }
  const existing = matches[0] ?? null;
  if (existing && !isOwnedSweepzaAccountWebhook(existing)) {
    throw new Error(
      "Refusing unowned, unscoped, or Connect/application webhook; an explicitly tagged Sweepza account endpoint is required.",
    );
  }
  if (existing && existing.status !== "enabled") {
    throw new Error("Refusing disabled matching webhook; operator review is required.");
  }
  const hasWildcard = existing?.enabled_events.includes("*") ?? false;
  const missingEvents = existing
    ? hasWildcard
      ? []
      : events.filter((event) => !existing.enabled_events.includes(event))
    : events;
  return { url, events, existing, missingEvents };
}

async function applyWebhook(discovery, secretFd) {
  const { existing, events, missingEvents, url } = discovery;
  if (existing) {
    if (missingEvents.length > 0) {
      const updated = await stripe.webhookEndpoints.update(existing.id, {
        enabled_events: mergeRequiredWebhookEvents(
          existing.enabled_events,
          events,
        ),
      });
      return {
        id: updated.id,
        url: updated.url,
        secretWritten: false,
        note: "existing endpoint reused and event subscriptions updated; secret not re-readable",
      };
    }

    // Signing secret is only returned at creation; if it already exists we
    // can't re-read it — report and let the operator rotate if needed.
    return { id: existing.id, url: existing.url, secretWritten: false, note: "existing endpoint reused; secret not re-readable" };
  }
  if (secretFd === null) {
    throw new Error("Refusing webhook creation without a reserved secret output.");
  }
  const created = await stripe.webhookEndpoints.create({
    url,
    enabled_events: events,
    connect: false,
    description: "Sweepza subscription sync",
    metadata: { venture: "sweepza", endpoint_scope: "account" },
  });
  await persistWebhookSecretWithRollback({
    endpoint: created,
    secretFd,
    writeSecret: writeFileSync,
    deleteEndpoint: (endpointId) => stripe.webhookEndpoints.del(endpointId),
  });
  return { id: created.id, url: created.url, secretWritten: true };
}

try {
  const result = await runProvisioningWorkflow({
    preflight,
    expectedAccountId: EXPECTED_ACCOUNT,
    retrieveAccount: async () => {
      stripe = new Stripe(key);
      return stripe.accounts.retrieve();
    },
    discover: async () => {
      const plans = [];
      for (const plan of PLANS) plans.push(await discoverProductAndPrice(plan));
      const webhook = await discoverWebhook(WEBHOOK_URL);
      return { plans, webhook };
    },
    needsSecretOutput: (discovery) => discovery.webhook.existing === null,
    reserveSecretOutput: () => reserveSecretOutput(SECRET_OUT),
    mutate: async (discovery, secretFd) => {
      const plans = [];
      for (const plan of discovery.plans) {
        plans.push(await applyProductAndPrice(plan));
      }
      const webhook = await applyWebhook(discovery.webhook, secretFd);
      return {
        keepSecretOutput: webhook.secretWritten,
        plans,
        webhook,
      };
    },
    releaseSecretOutput: (secretFd, options) =>
      releaseSecretOutput(secretFd, SECRET_OUT, options),
  });
  console.log(
    JSON.stringify(
      {
        accountId: result.account.id,
        plans: result.plans,
        webhook: result.webhook,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `REFUSED: ${error instanceof Error ? error.message : "Stripe provisioning failed."}`,
  );
  process.exit(1);
}
