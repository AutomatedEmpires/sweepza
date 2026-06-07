import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ReportReason, ReportTargetType } from "./enums";
import type { ReportRow } from "./types";

export async function createReport(args: {
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReason;
  details?: string | null;
}): Promise<ReportRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("report")
    .insert({
      reporter_user_id: args.reporterUserId,
      target_type: args.targetType,
      target_id: args.targetId,
      reason_code: args.reasonCode,
      details: args.details ?? null,
      status: "submitted",
    })
    .select("*")
    .single<ReportRow>();

  if (error) {
    throw new Error(`createReport failed: ${error.message}`);
  }

  return data;
}
