import "server-only";

import { env } from "@/lib/env";

export async function createStripePortalSession(args: {
  customerId: string;
  returnUrl?: string;
}): Promise<string> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe not configured.");

  const body = new URLSearchParams({
    customer: args.customerId,
    return_url: args.returnUrl ?? `${env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/host`,
  });

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message ?? "Failed to create Stripe portal session.");
  }

  return payload.url;
}
