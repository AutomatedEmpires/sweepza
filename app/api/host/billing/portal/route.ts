import { NextResponse } from "next/server";
import { createHostBillingPortalUrl, HostAccessError } from "@/lib/db/host-dashboard";

export async function POST(): Promise<NextResponse> {
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
