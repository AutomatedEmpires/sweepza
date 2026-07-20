// Honest eligibility modeling.
//
// The founder honesty invariant, applied to eligibility: unknown means unknown.
// The single most tempting and most harmful mistake a sweepstakes directory can
// make is to treat "no restriction was extracted" as "open to everyone" — that
// tells a seeker in Quebec they can enter a US-only sweep, or a 17-year-old that
// an 18+ sweep is fine. Every field here is tri-state: stated-and-known,
// stated-as-none, or genuinely unknown, and the UI renders the difference.
//
// Pure and presentational: it reads the canonical listing fields and produces a
// structured, display-ready summary. It never infers a restriction that the
// source did not state, and never implies eligibility the source did not grant.

export interface EligibilityInput {
  eligibilityCountry?: string | null;
  eligibilityStates?: string[] | null;
  ageRequirement?: number | null;
  noPurchaseNecessary?: boolean | null;
  entryLimitNotes?: string | null;
}

export type EligibilityCertainty = "known" | "unknown";

export interface EligibilityFacet {
  label: string;
  /** The stated value, or a neutral "Not stated" when unknown. */
  value: string;
  certainty: EligibilityCertainty;
}

export interface EligibilitySummary {
  facets: EligibilityFacet[];
  /** True when at least one facet is unknown — the card shows an honesty note. */
  hasUnknowns: boolean;
  /** Count of unknown facets, for ranking data quality. */
  unknownCount: number;
}

const NOT_STATED = "Not stated";

function region(input: EligibilityInput): EligibilityFacet {
  const country = input.eligibilityCountry?.trim();
  const states = (input.eligibilityStates ?? [])
    .map((state) => state.trim())
    .filter(Boolean);

  if (!country && states.length === 0) {
    return { label: "Region", value: NOT_STATED, certainty: "unknown" };
  }
  if (country && states.length > 0) {
    return {
      label: "Region",
      value: `${country} — ${states.join(", ")}`,
      certainty: "known",
    };
  }
  if (country) {
    return {
      label: "Region",
      value: `${country} — State/province restrictions not stated`,
      certainty: "unknown",
    };
  }
  return {
    label: "Region",
    value: `Country not stated — ${states.join(", ")}`,
    certainty: "unknown",
  };
}

function age(input: EligibilityInput): EligibilityFacet {
  if (
    input.ageRequirement == null
    || !Number.isFinite(input.ageRequirement)
    || input.ageRequirement <= 0
  ) {
    return { label: "Minimum age", value: NOT_STATED, certainty: "unknown" };
  }
  return { label: "Minimum age", value: `${input.ageRequirement}+`, certainty: "known" };
}

function purchase(input: EligibilityInput): EligibilityFacet {
  // Only `true` is an affirmative fact (the page said so). Both `false` and null
  // are unknown here: we never assert "purchase required" from a missing
  // affirmation, and Sweepza's hard gate already blocks anything not affirmed.
  if (input.noPurchaseNecessary === true) {
    return { label: "No purchase necessary", value: "Confirmed", certainty: "known" };
  }
  return { label: "No purchase necessary", value: NOT_STATED, certainty: "unknown" };
}

function entryLimit(input: EligibilityInput): EligibilityFacet {
  const notes = input.entryLimitNotes?.trim();
  if (!notes) {
    return { label: "Entry limits", value: NOT_STATED, certainty: "unknown" };
  }
  return { label: "Entry limits", value: notes, certainty: "known" };
}

/**
 * Build the honest eligibility summary for a listing. The order is the order a
 * seeker cares about: can I enter from here, am I old enough, is it free, how
 * often. Every facet declares whether it is known — the card must render an
 * unknown facet as an explicit "Not stated", never omit it (omission reads as
 * "no restriction").
 */
export function describeEligibility(input: EligibilityInput): EligibilitySummary {
  const facets = [region(input), age(input), purchase(input), entryLimit(input)];
  const unknownCount = facets.filter((f) => f.certainty === "unknown").length;
  return { facets, hasUnknowns: unknownCount > 0, unknownCount };
}
