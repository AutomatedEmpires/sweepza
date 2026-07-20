import "server-only";

import { env } from "@/lib/env";

export const PAYMENTS_DISABLED_REASON = "payments_disabled" as const;

export class PaymentsDisabledError extends Error {
  readonly code = PAYMENTS_DISABLED_REASON;

  constructor() {
    super(
      "Payments are disabled. PAYMENTS_ENABLED must equal the literal \"true\" before any Stripe operation is allowed.",
    );
    this.name = "PaymentsDisabledError";
  }
}

export function isPaymentsEnabled(): boolean {
  return env.PAYMENTS_ENABLED === "true";
}

export function assertPaymentsEnabled(): void {
  if (!isPaymentsEnabled()) {
    throw new PaymentsDisabledError();
  }
}
