import { z } from "zod";

export const REVIEW_ACTIONS = ["approve", "reject", "needs_changes"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const listingReviewSchema = z
  .object({
    listingId: z.string().uuid("A valid listing id is required."),
    action: z.enum(REVIEW_ACTIONS),
    reviewNotes: z
      .string()
      .trim()
      .max(1000, "Review notes must be 1000 characters or fewer.")
      .nullable()
      .optional(),
  })
  .superRefine((value, context) => {
    if (["reject", "needs_changes"].includes(value.action) && !value.reviewNotes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewNotes"],
        message: "Host-visible review notes are required for this action.",
      });
    }
  });

export type ListingReviewInput = z.infer<typeof listingReviewSchema>;
