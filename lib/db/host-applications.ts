import "server-only";

import type { HostApplicationInput } from "@/lib/host-application-schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const HOST_APPLICATION_TERMS_VERSION = "host-authority-2026-07-21";

export interface HostApplicationRow {
  id: string;
  applicant_user_id: string;
  legal_organization_name: string;
  public_display_name: string;
  website_url: string;
  official_email: string;
  authority_basis: HostApplicationInput["authorityBasis"];
  authority_evidence: string;
  authority_evidence_url: string | null;
  status: "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  authority_attested: boolean;
  terms_version: string;
  reviewer_user_id: string | null;
  review_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HostApplicationQueueItem extends HostApplicationRow {
  applicantName: string;
  accountEmail: string | null;
}

type HostApplicationJoinRow = HostApplicationRow & {
  applicant: { display_name: string | null; email: string | null } | null;
};

export async function getLatestHostApplicationForUser(
  appUserId: string,
): Promise<HostApplicationRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("host_application")
    .select("*")
    .eq("applicant_user_id", appUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<HostApplicationRow>();
  if (error) {
    throw new Error(`getLatestHostApplicationForUser failed: ${error.message}`);
  }
  return data;
}

export async function submitHostApplication(args: {
  appUserId: string;
  input: HostApplicationInput;
}): Promise<HostApplicationRow> {
  const current = await getLatestHostApplicationForUser(args.appUserId);
  if (current && ["submitted", "under_review", "approved"].includes(current.status)) {
    throw new Error("A host application is already active for this account.");
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("host_application")
    .insert({
      applicant_user_id: args.appUserId,
      legal_organization_name: args.input.legalOrganizationName,
      public_display_name: args.input.publicDisplayName,
      website_url: args.input.websiteUrl,
      official_email: args.input.officialEmail,
      authority_basis: args.input.authorityBasis,
      authority_evidence: args.input.authorityEvidence,
      authority_evidence_url: args.input.authorityEvidenceUrl ?? null,
      authority_attested: true,
      terms_version: HOST_APPLICATION_TERMS_VERSION,
      status: "submitted",
    })
    .select("*")
    .single<HostApplicationRow>();
  if (error) throw new Error(`submitHostApplication failed: ${error.message}`);
  return data;
}

export async function listPendingHostApplications(): Promise<HostApplicationQueueItem[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("host_application")
    .select("*, applicant:applicant_user_id(display_name, email)")
    .in("status", ["submitted", "under_review"])
    .order("submitted_at", { ascending: true })
    .returns<HostApplicationJoinRow[]>();
  if (error) throw new Error(`listPendingHostApplications failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    applicantName: row.applicant?.display_name ?? "Sweepza member",
    accountEmail: row.applicant?.email ?? null,
  }));
}

export async function reviewHostApplication(args: {
  applicationId: string;
  reviewerUserId: string;
  action: "approve" | "reject";
  reviewNotes: string;
}): Promise<{ application_id: string; status: "approved" | "rejected"; host_id: string | null }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("review_host_application", {
    p_application_id: args.applicationId,
    p_reviewer_user_id: args.reviewerUserId,
    p_action: args.action,
    p_review_notes: args.reviewNotes,
  });
  if (error) throw new Error(`reviewHostApplication failed: ${error.message}`);
  return data as {
    application_id: string;
    status: "approved" | "rejected";
    host_id: string | null;
  };
}
