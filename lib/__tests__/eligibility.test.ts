import { describe, expect, it } from "vitest";
import { describeEligibility } from "@/lib/eligibility";

describe("describeEligibility — unknown means unknown", () => {
  it("marks a missing region as 'Not stated', never as open-to-all", () => {
    const summary = describeEligibility({});
    const region = summary.facets.find((f) => f.label === "Region");
    expect(region?.value).toBe("Not stated");
    expect(region?.certainty).toBe("unknown");
    // The whole point: absence of a restriction is not a grant of eligibility.
    expect(region?.value).not.toMatch(/all|everyone|worldwide|any/i);
  });

  it("states a known country", () => {
    const region = describeEligibility({ eligibilityCountry: "US" }).facets.find(
      (f) => f.label === "Region",
    );
    expect(region).toMatchObject({ value: "US", certainty: "known" });
  });

  it("combines country and states", () => {
    const region = describeEligibility({
      eligibilityCountry: "US",
      eligibilityStates: ["CA", "NY"],
    }).facets.find((f) => f.label === "Region");
    expect(region?.value).toBe("US — CA, NY");
    expect(region?.certainty).toBe("known");
  });

  it("treats a missing or zero age as unknown, not as 'no age limit'", () => {
    for (const input of [{}, { ageRequirement: 0 }, { ageRequirement: null }]) {
      const age = describeEligibility(input).facets.find((f) => f.label === "Minimum age");
      expect(age).toMatchObject({ value: "Not stated", certainty: "unknown" });
    }
  });

  it("states a known minimum age", () => {
    const age = describeEligibility({ ageRequirement: 18 }).facets.find(
      (f) => f.label === "Minimum age",
    );
    expect(age).toMatchObject({ value: "18+", certainty: "known" });
  });

  it("only affirms no-purchase-necessary when the source did", () => {
    expect(
      describeEligibility({ noPurchaseNecessary: true }).facets.find(
        (f) => f.label === "No purchase necessary",
      ),
    ).toMatchObject({ value: "Confirmed", certainty: "known" });

    for (const npn of [false, null, undefined]) {
      const facet = describeEligibility({ noPurchaseNecessary: npn }).facets.find(
        (f) => f.label === "No purchase necessary",
      );
      expect(facet).toMatchObject({ value: "Not stated", certainty: "unknown" });
    }
  });

  it("counts unknowns so the card can show an honesty note", () => {
    const summary = describeEligibility({ eligibilityCountry: "US", ageRequirement: 18 });
    // purchase + entry limits still unknown.
    expect(summary.hasUnknowns).toBe(true);
    expect(summary.unknownCount).toBe(2);
  });

  it("has no unknowns when everything is stated", () => {
    const summary = describeEligibility({
      eligibilityCountry: "US",
      ageRequirement: 18,
      noPurchaseNecessary: true,
      entryLimitNotes: "One entry per day",
    });
    expect(summary.hasUnknowns).toBe(false);
    expect(summary.unknownCount).toBe(0);
  });
});
