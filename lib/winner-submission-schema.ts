import { z } from "zod";

export const winnerSubmissionSchema = z.object({
  listingId: z.string().trim().uuid("Select a sweepstakes you entered."),
  caption: z
    .string()
    .trim()
    .min(10, "Tell the community what you won.")
    .max(500),
}).strict();

export type WinnerSubmissionInput = z.infer<typeof winnerSubmissionSchema>;
