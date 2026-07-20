import { headers } from "next/headers";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import {
  isPaymentsEnabled,
  PAYMENTS_DISABLED_REASON,
} from "@/lib/billing/payment-gate";
import { getHostByStripeCustomerId, upsertSubscriptionFromStripe } from "@/lib/db/subscriptions";
import { env } from "@/lib/env";
import { createStripeServerClient } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

function getStripeWebhookSecret(): string | null {
  return env.STRIPE_WEBHOOK_SECRET ?? null;
}

function isSubscriptionEvent(
  eventType: string,
): eventType is
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted" {
  return (
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated" ||
    eventType === "customer.subscription.deleted"
  );
}

export async function POST(request: Request) {
  if (!isPaymentsEnabled()) {
    return NextResponse.json(
      {
        error: "Payments are disabled; retry after an authorized activation.",
        disabled: true,
        reason: PAYMENTS_DISABLED_REASON,
      },
      { status: 503 },
    );
  }

  const secret = getStripeWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured." },
      { status: 503 },
    );
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const payload = await request.text();
  const stripe = createStripeServerClient();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Webhook verification failed.",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 400 },
    );
  }

  if (!isSubscriptionEvent(event.type)) {
    return NextResponse.json({
      ok: true,
      action: "ignored",
      eventType: event.type,
    });
  }

  try {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const host = await getHostByStripeCustomerId(customerId);

    if (!host) {
      // A paying Stripe customer with no matching host means entitlements
      // have desynced — this must page someone, not just 404 quietly.
      Sentry.captureMessage("Stripe webhook: no host for customer", {
        level: "error",
        extra: { eventType: event.type, customerId },
      });
      return NextResponse.json(
        {
          error: "No Sweepza host matches the Stripe customer on this event.",
          eventType: event.type,
          customerId,
        },
        { status: 404 },
      );
    }

    const synced = await upsertSubscriptionFromStripe(host.id, subscription);

    return NextResponse.json({
      ok: true,
      action: "subscription_synced",
      eventType: event.type,
      hostId: host.id,
      subscriptionId: synced.id,
      stripeSubscriptionId: synced.stripe_subscription_id,
      status: synced.status,
    });
  } catch (error) {
    // 500 makes Stripe retry; Sentry makes the failure visible to us. A
    // silent billing-sync failure would strand a paying host without slots.
    Sentry.captureException(error, {
      extra: { eventType: event.type, source: "stripe-webhook" },
    });
    return NextResponse.json(
      {
        error: "Stripe webhook processing failed.",
        message: error instanceof Error ? error.message : "unknown error",
        eventType: event.type,
      },
      { status: 500 },
    );
  }
}
