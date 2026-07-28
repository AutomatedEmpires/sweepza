const US_COUNTRY_NAMES = new Set([
  "US",
  "USA",
  "UNITEDSTATES",
  "UNITEDSTATESOFAMERICA",
]);

const CANADA_COUNTRY_NAMES = new Set(["CA", "CAN", "CANADA"]);

const US_CANADA_COUNTRY_NAMES = new Set([
  "USCA",
  "USCANADA",
  "UNITEDSTATESANDCANADA",
  "CANADAANDUNITEDSTATES",
]);

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
