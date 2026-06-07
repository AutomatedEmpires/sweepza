import { z } from "zod";
import { ENTRY_FREQUENCIES, SOURCE_LABELS } from "@/lib/db/enums";

export const adminListingImportSchema = z.object({
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
  sourceLabel: z.enum(SOURCE_LABELS).default("found_by_sweepza"),
  publish: z.boolean().default(true),
  verified: z.boolean().default(false),
});

export type AdminListingImportInput = z.infer<typeof adminListingImportSchema>;
