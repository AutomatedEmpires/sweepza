import { z } from "zod";

// Host self-serve profile fields. Mirrors lib/host-listing-schema.ts style.
// display_name is required; the rest are optional and map to nullable columns
// on the canonical `host` row. short_description is capped at 300 to match the
// host_desc_len check constraint in supabase/migrations.
export const hostProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(80, "Display name must be 80 characters or fewer."),
  websiteUrl: z
    .string()
    .trim()
    .url("Enter a valid website URL.")
    .max(300, "Website URL is too long.")
    .nullable()
    .optional(),
  shortDescription: z
    .string()
    .trim()
    .max(300, "Short description must be 300 characters or fewer.")
    .nullable()
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .url("Enter a valid logo URL.")
    .max(500, "Logo URL is too long.")
    .nullable()
    .optional(),
});

export type HostProfileInput = z.infer<typeof hostProfileSchema>;
