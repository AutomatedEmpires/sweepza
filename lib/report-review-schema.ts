import { z } from "zod";

// Report triage actions.
// - open: move (back) into active admin review
// - resolve: close as handled (stamps resolved_at)
// - dismiss: close as no-action (stamps resolved_at)
export const REPORT_REVIEW_ACTIONS = ["open", "resolve", "dismiss"] as const;
export type ReportReviewAction = (typeof REPORT_REVIEW_ACTIONS)[number];

export const reportReviewSchema = z.object({
  reportId: z.string().uuid("A valid report id is required."),
  action: z.enum(REPORT_REVIEW_ACTIONS),
  resolutionNotes: z
    .string()
    .trim()
    .max(1000, "Resolution notes must be 1000 characters or fewer.")
    .nullable()
    .optional(),
});

export type ReportReviewInput = z.infer<typeof reportReviewSchema>;
