import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const winnerSubmissionSchema = z.object({
  listingId: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().uuid().optional().nullable(),
  ),
  // Caption and attachments are nullable in winner_post and optional in the UI.
  caption: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().max(500).optional().nullable(),
  ),
  photoUrl: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().url().optional().nullable(),
  ),
});

export type WinnerSubmissionInput = z.infer<typeof winnerSubmissionSchema>;
