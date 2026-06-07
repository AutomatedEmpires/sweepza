import { NextResponse } from "next/server";
import { getHostIdentity } from "@/lib/db/host-dashboard";

export async function GET() {
  const identity = await getHostIdentity();
  return NextResponse.json({ hostId: identity.hostId, appUserId: identity.appUserId });
}
