import { z } from "zod";
import { ENTRY_FREQUENCIES } from "@/lib/db/enums";
import {
  optionalPublicHttpUrlSchema,
  publicHttpUrlSchema,
} from "@/lib/http-url-schema";

export const hostListingSubmissionSchema = z.object({
  title: z.string().min(5).max(70),
  shortDescription: z.string().min(10).max(140),
  longDescription: z.string().max(2000).nullable().optional(),
  prizeName: z.string().min(3).max(120),
  prizeValue: z.coerce.number().nonnegative().nullable().optional(),
  prizeCategory: z.string().min(1),
  mainImageUrl: publicHttpUrlSchema,
  imageAltText: z.string().max(160).nullable().optional(),
  entryUrl: publicHttpUrlSchema,
  officialRulesUrl: publicHttpUrlSchema,
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date(),
  entryFrequency: z.enum(ENTRY_FREQUENCIES),
  entryLimitNotes: z.string().max(240).nullable().optional(),
  eligibilityCountry: z.string().min(2).max(40),
  eligibilityStates: z.array(z.string().trim().min(2).max(3)).max(60).default([]),
  ageRequirement: z.coerce.number().int().min(13).max(120),
  noPurchaseNecessary: z.literal(true),
  sponsorName: z.string().trim().min(2).max(120),
  sponsorUrl: optionalPublicHttpUrlSchema,
  winnerCount: z.coerce.number().int().positive().max(10000).nullable().optional(),
  tagCodes: z.array(z.string()).max(12).default([]),
}).superRefine((input, context) => {
  const today = new Date().toISOString().slice(0, 10);
  if (input.endDate < today) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date cannot be in the past.",
    });
  }
  if (input.startDate && input.startDate > input.endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startDate"],
      message: "Start date cannot be after the end date.",
    });
  }
});

// Host-editable fields for the draft/held edit flow. Admin-only fields
// (moderation_status, verification_status, is_featured, source_label) are
// intentionally excluded.
export const hostListingEditSchema = z.object({
  title: z.string().trim().min(5).max(70),
  short_description: z.string().trim().min(10).max(140),
  long_description: z.string().trim().max(2000).nullable().optional(),
  prize_name: z.string().trim().min(3).max(120),
  prize_value: z.coerce.number().nonnegative().nullable().optional(),
  prize_category: z.string().trim().min(1),
  winner_count: z.coerce.number().int().positive().max(10000).nullable().optional(),
  main_image_url: publicHttpUrlSchema,
  image_alt_text: z.string().trim().max(160).nullable().optional(),
  entry_url: publicHttpUrlSchema,
  official_rules_url: publicHttpUrlSchema,
  start_date: z.string().date().nullable().optional(),
  end_date: z.string().date(),
  entry_frequency: z.enum(ENTRY_FREQUENCIES),
  entry_limit_notes: z.string().trim().max(240).nullable().optional(),
  eligibility_country: z.string().trim().min(2).max(40),
  eligibility_states: z.array(z.string().trim().min(2).max(3)).max(60).default([]),
  age_requirement: z.coerce.number().int().min(13).max(120),
  no_purchase_necessary: z.literal(true),
  sponsor_name: z.string().trim().min(2).max(120),
  sponsor_url: optionalPublicHttpUrlSchema,
  tag_codes: z.array(z.string()).max(12).default([]),
}).superRefine((input, context) => {
  const today = new Date().toISOString().slice(0, 10);
  if (input.end_date < today) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end_date"],
      message: "End date cannot be in the past.",
    });
  }
  if (input.start_date && input.start_date > input.end_date) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["start_date"],
      message: "Start date cannot be after the end date.",
    });
  }
});

export type HostListingSubmissionInput = z.infer<
  typeof hostListingSubmissionSchema
>;
export type HostListingEditInput = z.infer<typeof hostListingEditSchema>;
