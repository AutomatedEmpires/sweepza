import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
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
