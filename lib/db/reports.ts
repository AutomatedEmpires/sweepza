import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ReportReason, ReportTargetType } from "./enums";

export interface CreatedReport {
  id: string;
  status: string;
  created: boolean;
}

export async function createReport(args: {
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReason;
  details?: string | null;
}): Promise<CreatedReport> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("create_validated_report", {
    p_reporter_user_id: args.reporterUserId,
    p_target_type: args.targetType,
    p_target_id: args.targetId,
    p_reason_code: args.reasonCode,
    p_details: args.details ?? null,
  });

  if (error) {
    throw new Error(`createReport failed: ${error.message}`);
  }

  return data as CreatedReport;
}
