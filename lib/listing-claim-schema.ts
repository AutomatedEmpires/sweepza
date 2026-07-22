import { z } from "zod";
import { optionalPublicHttpsUrlSchema } from "@/lib/http-url-schema";

export const listingClaimSchema = z.object({
  listingId: z.string().uuid(),
  authorityBasis: z.string().trim().min(5).max(120),
  authorityEvidence: z.string().trim().min(20).max(2000),
  authorityEvidenceUrl: optionalPublicHttpsUrlSchema,
  authorityAttested: z.literal(true),
});

export type ListingClaimInput = z.infer<typeof listingClaimSchema>;
