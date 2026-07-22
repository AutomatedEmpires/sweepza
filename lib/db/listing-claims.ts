import "server-only";

import type { ListingClaimInput } from "@/lib/listing-claim-schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface HostListingClaim {
  id: string;
  listing_id: string;
  requesting_host_id: string;
  status: "requested" | "approved" | "rejected" | "unclaimed";
  authority_basis: string | null;
  authority_evidence: string | null;
  authority_evidence_url: string | null;
  review_notes: string | null;
  requested_at: string;
  reviewed_at: string | null;
  listing: { title: string; slug: string } | null;
  host?: { display_name: string; verification_status: string } | null;
}

export async function createListingClaim(args: {
  hostId: string;
  input: ListingClaimInput;
}): Promise<{ id: string; status: string }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("create_listing_claim_request", {
    p_listing_id: args.input.listingId,
    p_host_id: args.hostId,
    p_authority_basis: args.input.authorityBasis,
    p_authority_evidence: args.input.authorityEvidence,
    p_authority_evidence_url: args.input.authorityEvidenceUrl ?? null,
    p_authority_attested: true,
  });
  if (error) throw new Error(`createListingClaim failed: ${error.message}`);
  return data as { id: string; status: string };
}

export async function listHostListingClaims(hostId: string): Promise<HostListingClaim[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing_claim")
    .select("*, listing:listing_id(title, slug)")
    .eq("requesting_host_id", hostId)
    .order("requested_at", { ascending: false })
    .returns<HostListingClaim[]>();
  if (error) throw new Error(`listHostListingClaims failed: ${error.message}`);
  return data ?? [];
}

export async function listPendingListingClaims(): Promise<HostListingClaim[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing_claim")
    .select("*, listing:listing_id(title, slug), host:requesting_host_id(display_name, verification_status)")
    .eq("status", "requested")
    .order("requested_at", { ascending: true })
    .returns<HostListingClaim[]>();
  if (error) throw new Error(`listPendingListingClaims failed: ${error.message}`);
  return data ?? [];
}

export async function reviewListingClaim(args: {
  claimId: string;
  reviewerUserId: string;
  action: "approve" | "reject";
  reviewNotes: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("review_listing_claim", {
    p_claim_id: args.claimId,
    p_reviewer_user_id: args.reviewerUserId,
    p_action: args.action,
    p_review_notes: args.reviewNotes,
  });
  if (error) throw new Error(`reviewListingClaim failed: ${error.message}`);
}
