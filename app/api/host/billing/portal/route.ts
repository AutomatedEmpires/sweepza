import { NextResponse } from "next/server";
import {
  isPaymentsEnabled,
  PAYMENTS_DISABLED_REASON,
} from "@/lib/billing/payment-gate";
import { createHostBillingPortalUrl, HostAccessError } from "@/lib/db/host-dashboard";

export async function POST(): Promise<NextResponse> {
  if (!isPaymentsEnabled()) {
    return NextResponse.json(
      { error: "Payments are disabled.", code: PAYMENTS_DISABLED_REASON },
      { status: 503 },
    );
  }

  try {
    const url = await createHostBillingPortalUrl();
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof HostAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unexpected error creating billing portal session." }, { status: 500 });
  }
}
