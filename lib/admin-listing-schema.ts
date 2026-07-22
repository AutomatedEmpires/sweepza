import { z } from "zod";
import { ENTRY_FREQUENCIES } from "@/lib/db/enums";
import {
  optionalPublicHttpUrlSchema,
  publicHttpUrlSchema,
} from "@/lib/http-url-schema";

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
  eligibilityStates: z.array(z.string().trim().min(2).max(3)).max(60).default([]),
  ageRequirement: z.coerce.number().int().min(13).max(120),
  noPurchaseNecessary: z.literal(true),
  sponsorName: z.string().trim().min(2).max(120),
  sponsorUrl: optionalPublicHttpUrlSchema,
  winnerCount: z.coerce.number().int().positive().max(10000).nullable().optional(),
  tagCodes: z.array(z.string()).max(12).default([]),
  publish: z.boolean().default(true),
  verified: z.boolean().default(false),
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
  if (input.publish && !input.mainImageUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mainImageUrl"],
      message: "A main image is required to publish.",
    });
  }
});

export type AdminListingImportInput = z.infer<typeof adminListingImportSchema>;
