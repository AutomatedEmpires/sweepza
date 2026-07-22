import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { getHostIdentity, HostAccessError } from "@/lib/db/host-dashboard";
import { createListingClaim } from "@/lib/db/listing-claims";
import { listingClaimSchema } from "@/lib/listing-claim-schema";
import { clientKey, rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = await rateLimitShared(clientKey(request), {
    namespace: "listing-claims",
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many claim requests." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }
  let host;
  try {
    host = await getHostIdentity();
  } catch (error) {
    const status = error instanceof HostAccessError ? error.status : 500;
    return NextResponse.json({ error: "Verified host access is required." }, { status });
  }
  if (host.host.verification_status !== "admin_verified") {
    return NextResponse.json({ error: "Host verification is required before claiming a listing." }, { status: 403 });
  }
  const parsed = listingClaimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Complete authority evidence is required." }, { status: 400 });
  }
  try {
    const claim = await createListingClaim({ hostId: host.hostId, input: parsed.data });
    return NextResponse.json(claim, { status: 201 });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "This listing is not claimable or already has a claim." }, { status: 409 });
  }
}
