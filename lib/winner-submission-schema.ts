import { z } from "zod";

export const winnerSubmissionSchema = z.object({
  listingId: z.string().uuid().optional().nullable(),
  caption: z.string().min(10).max(500),
  photoUrl: z.string().url().optional().nullable(),
});

export type WinnerSubmissionInput = z.infer<typeof winnerSubmissionSchema>;
