const US_COUNTRY_ALIASES = [
  "US",
  "USA",
  "UNITEDSTATES",
  "UNITEDSTATESOFAMERICA",
] as const;

const CANADA_COUNTRY_ALIASES = ["CA", "CAN", "CANADA"] as const;

const US_COUNTRY_NAMES = new Set<string>(US_COUNTRY_ALIASES);
const CANADA_COUNTRY_NAMES = new Set<string>(CANADA_COUNTRY_ALIASES);
const US_CANADA_COUNTRY_NAMES = new Set(
  US_COUNTRY_ALIASES.flatMap((us) =>
    CANADA_COUNTRY_ALIASES.flatMap((canada) => [
      `${us}${canada}`,
      `${us}AND${canada}`,
      `${canada}${us}`,
      `${canada}AND${us}`,
    ]),
  ),
);

export function normalizeEligibilityCountry(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

export function isUnitedStatesCountry(value: string): boolean {
  return US_COUNTRY_NAMES.has(normalizeEligibilityCountry(value));
}

export function isCanadaCountry(value: string): boolean {
  return CANADA_COUNTRY_NAMES.has(normalizeEligibilityCountry(value));
}

export function isUnitedStatesAndCanadaCountry(value: string): boolean {
  return US_CANADA_COUNTRY_NAMES.has(normalizeEligibilityCountry(value));
}

export function countryIncludesUnitedStates(value: string): boolean {
  return (
    isUnitedStatesCountry(value) ||
    isUnitedStatesAndCanadaCountry(value)
  );
}
