import { z } from "zod";

export const REVIEW_ACTIONS = ["approve", "reject", "keep_pending"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const listingReviewSchema = z.object({
  listingId: z.string().uuid("A valid listing id is required."),
  action: z.enum(REVIEW_ACTIONS),
  reviewNotes: z
    .string()
    .trim()
    .max(1000, "Review notes must be 1000 characters or fewer.")
    .nullable()
    .optional(),
});

export type ListingReviewInput = z.infer<typeof listingReviewSchema>;
