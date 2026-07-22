import { z } from "zod";

/** Two-letter USPS codes for the 50 states and District of Columbia. */
export const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

/** Two-letter Canada Post abbreviations for provinces and territories. */
export const CANADA_PROVINCE_CODES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

const ELIGIBILITY_REGION_CODES = [
  ...US_STATE_CODES,
  ...CANADA_PROVINCE_CODES,
] as const;

const eligibilityRegionCodeSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  z.enum(ELIGIBILITY_REGION_CODES, {
    errorMap: () => ({
      message: "Use a valid U.S. state/DC or Canadian province/territory code.",
    }),
  }),
);

export const eligibilityRegionCodesSchema = z
  .array(eligibilityRegionCodeSchema)
  .max(64)
  .default([])
  .transform((codes) => [...new Set(codes)]);

const US_COUNTRY_NAMES = new Set([
  "US",
  "USA",
  "UNITEDSTATES",
  "UNITEDSTATESOFAMERICA",
]);
const CANADA_COUNTRY_NAMES = new Set(["CA", "CAN", "CANADA"]);
const US_CODES = new Set<string>(US_STATE_CODES);
const CANADA_CODES = new Set<string>(CANADA_PROVINCE_CODES);
const NORTH_AMERICA_CODES = new Set<string>(ELIGIBILITY_REGION_CODES);
const US_CANADA_COUNTRY_NAMES = new Set([
  "USCA",
  "USCANADA",
  "UNITEDSTATESANDCANADA",
  "CANADAANDUNITEDSTATES",
]);

function normalizedCountry(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

/** Keep region restrictions consistent with the listing's stated country. */
export function validateEligibilityRegionCountry(
  country: string,
  codes: readonly string[],
  context: z.RefinementCtx,
  path: string,
): void {
  if (codes.length === 0) return;
  const normalized = normalizedCountry(country);
  const allowed = US_COUNTRY_NAMES.has(normalized)
    ? US_CODES
    : CANADA_COUNTRY_NAMES.has(normalized)
      ? CANADA_CODES
      : US_CANADA_COUNTRY_NAMES.has(normalized)
        ? NORTH_AMERICA_CODES
        : null;
  if (allowed && codes.every((code) => allowed.has(code))) return;

  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [path],
    message: allowed
      ? "Region codes must belong to the stated eligibility country."
      : "Region codes are supported only for U.S. or Canadian eligibility.",
  });
}
