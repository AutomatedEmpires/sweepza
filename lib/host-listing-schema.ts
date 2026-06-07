import { z } from "zod";
import { ENTRY_FREQUENCIES } from "@/lib/db/enums";

export const hostListingSubmissionSchema = z.object({
  title: z.string().min(5).max(70),
  shortDescription: z.string().min(10).max(140),
  prizeName: z.string().min(3).max(120),
  prizeValue: z.coerce.number().nonnegative().nullable().optional(),
  prizeCategory: z.string().min(1),
  mainImageUrl: z.string().url().nullable().optional(),
  imageAltText: z.string().max(160).nullable().optional(),
  entryUrl: z.string().url(),
  officialRulesUrl: z.string().url(),
  endDate: z.string().min(1),
  entryFrequency: z.enum(ENTRY_FREQUENCIES),
  eligibilityCountry: z.string().min(2).max(40),
  sponsorName: z.string().max(120).nullable().optional(),
  tagCodes: z.array(z.string()).max(12).default([]),
});

// Host-editable fields for the draft/held edit flow. Admin-only fields
// (moderation_status, verification_status, is_featured, source_label) are
// intentionally excluded.
export const hostListingEditSchema = z.object({
  title: z.string().trim().min(5).max(70),
  short_description: z.string().trim().min(10).max(140),
  prize_name: z.string().trim().min(3).max(120),
  prize_value: z.coerce.number().nonnegative().nullable().optional(),
  entry_url: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.string().trim().url().nullable().optional(),
  ),
});

export type HostListingSubmissionInput = z.infer<
  typeof hostListingSubmissionSchema
>;
export type HostListingEditInput = z.infer<typeof hostListingEditSchema>;
