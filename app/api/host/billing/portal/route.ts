import { NextResponse } from "next/server";
import { createHostBillingPortalUrl } from "@/lib/db/host-dashboard";

export async function POST() {
  const url = await createHostBillingPortalUrl();
  return NextResponse.json({ url });
}
