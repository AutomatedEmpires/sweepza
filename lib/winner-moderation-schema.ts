import { z } from "zod";

// Moderation actions for Winner Wall submissions.
// - approve: publish onto the public Winner Wall
// - reject: keep private (rejected)
// - hide: unpublish a post that is already visible
export const WINNER_MODERATION_ACTIONS = ["approve", "reject", "hide"] as const;
export type WinnerModerationAction = (typeof WINNER_MODERATION_ACTIONS)[number];

export const winnerModerationSchema = z.object({
  winnerPostId: z.string().uuid("A valid winner post id is required."),
  action: z.enum(WINNER_MODERATION_ACTIONS),
});

export type WinnerModerationInput = z.infer<typeof winnerModerationSchema>;
