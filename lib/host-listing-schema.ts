import { z } from "zod";

export const hostListingSchema = z.object({
  title: z.string().trim().min(1).max(70),
  short_description: z.string().trim().min(1).max(140),
  prize_name: z.string().trim().min(1),
  prize_value: z.coerce.number().nonnegative().nullable().optional(),
  entry_url: z.string().trim().url().nullable().optional().or(z.literal("")),
});

export type HostListingInput = z.infer<typeof hostListingSchema>;
