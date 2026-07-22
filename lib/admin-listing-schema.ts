import { z } from "zod";
import { ENTRY_FREQUENCIES } from "@/lib/db/enums";
import {
  optionalPublicHttpUrlSchema,
  publicHttpUrlSchema,
} from "@/lib/http-url-schema";
import {
  eligibilityRegionCodesSchema,
  validateEligibilityRegionCountry,
} from "@/lib/us-state-codes";
import { dateOnlyVisibilityFloor } from "@/lib/ingestion/lifecycle";

export const adminListingImportSchema = z.object({
  title: z.string().min(5).max(70),
  shortDescription: z.string().min(10).max(140),
  longDescription: z.string().max(2000).nullable().optional(),
  prizeName: z.string().min(3).max(120),
  prizeValue: z.coerce.number().nonnegative().nullable().optional(),
  prizeCategory: z.string().min(1),
  mainImageUrl: optionalPublicHttpUrlSchema,
  imageAltText: z.string().max(160).nullable().optional(),
  entryUrl: publicHttpUrlSchema,
  officialRulesUrl: publicHttpUrlSchema,
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date(),
  entryFrequency: z.enum(ENTRY_FREQUENCIES),
  entryLimitNotes: z.string().max(240).nullable().optional(),
  eligibilityCountry: z.string().min(2).max(40),
  eligibilityStates: eligibilityRegionCodesSchema,
  ageRequirement: z.coerce.number().int().min(13).max(120),
  noPurchaseNecessary: z.literal(true),
  sponsorName: z.string().trim().min(2).max(120),
  sponsorUrl: optionalPublicHttpUrlSchema,
  winnerCount: z.coerce.number().int().positive().max(10000).nullable().optional(),
  tagCodes: z.array(z.string()).max(12).default([]),
  publish: z.boolean().default(true),
  verified: z.boolean().default(false),
}).superRefine((input, context) => {
  if (input.endDate < dateOnlyVisibilityFloor()) {
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
  if (input.publish && !input.mainImageUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mainImageUrl"],
      message: "A main image is required to publish.",
    });
  }
}).superRefine((listing, context) => {
  validateEligibilityRegionCountry(
    listing.eligibilityCountry,
    listing.eligibilityStates,
    context,
    "eligibilityStates",
  );
});

export type AdminListingImportInput = z.infer<typeof adminListingImportSchema>;
