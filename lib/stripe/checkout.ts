import "server-only";

import Stripe from "stripe";
import { env } from "@/lib/env";

export async function createStripePortalSession(args: {
  customerId: string;
  returnUrl?: string;
}): Promise<string> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe not configured.");

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const session = await stripe.billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.returnUrl ?? `${env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/host`,
  });
  return session.url;
}
