import { z } from "zod";
import { optionalPublicHttpsUrlSchema, publicHttpsUrlSchema } from "@/lib/http-url-schema";

export const hostApplicationSchema = z.object({
  legalOrganizationName: z.string().trim().min(2).max(160),
  publicDisplayName: z.string().trim().min(2).max(100),
  websiteUrl: publicHttpsUrlSchema,
  officialEmail: z.string().trim().email().max(320),
  authorityBasis: z.enum(["owner", "employee", "agency", "administrator"]),
  authorityEvidence: z.string().trim().min(20).max(2000),
  authorityEvidenceUrl: optionalPublicHttpsUrlSchema,
  authorityAttested: z.literal(true),
});

export type HostApplicationInput = z.infer<typeof hostApplicationSchema>;
