import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  createCanonicalListing: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  isClerkConfigured: vi.fn(),
  revalidatePublicListings: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));
vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
  isClerkConfigured: mocks.isClerkConfigured,
}));
vi.mock("@/lib/db/listings-cache", () => ({
  revalidatePublicListings: mocks.revalidatePublicListings,
}));
vi.mock("@/lib/db/canonical-listing-write", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/db/canonical-listing-write")
  >();
  return {
    ...actual,
    createCanonicalListing: mocks.createCanonicalListing,
  };
});

import { CanonicalListingPendingReviewError } from "@/lib/db/canonical-listing-write";
import { POST } from "@/app/api/admin/listings/route";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const SLUG = "official-summer-prize-sweepstakes";

function listingRequest(): Request {
  return new Request("http://test.local/api/admin/listings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Official summer prize sweepstakes",
      shortDescription:
        "Enter at the official sponsor source for a summer prize.",
      prizeName: "Summer prize",
      prizeCategory: "cash",
      mainImageUrl: "https://sponsor.example/promotion.png",
      entryUrl: "https://sponsor.example/enter",
      officialRulesUrl: "https://sponsor.example/rules",
      endDate: "2999-08-31",
      entryFrequency: "one_time",
      eligibilityCountry: "US",
      eligibilityStates: [],
      ageRequirement: 18,
      noPurchaseNecessary: true,
      sponsorName: "Official Sponsor",
      tagCodes: [],
      publish: true,
      verified: false,
    }),
  });
}

beforeEach(() => {
  mocks.captureException.mockReset();
  mocks.createCanonicalListing.mockReset();
  mocks.ensureCurrentAppUser.mockReset();
  mocks.isClerkConfigured.mockReset();
  mocks.revalidatePublicListings.mockReset();

  mocks.isClerkConfigured.mockReturnValue(true);
  mocks.ensureCurrentAppUser.mockResolvedValue({
    appUserId: "33333333-3333-4333-8333-333333333333",
    appUser: { is_admin: true, is_owner: false },
  });
});

describe("POST /api/admin/listings pending duplicate review", () => {
  it("keeps a committed fuzzy match on the accurate moderation response", async () => {
    mocks.createCanonicalListing.mockRejectedValue(
      new CanonicalListingPendingReviewError(
        "Potential duplicate evidence requires review before this listing can publish.",
        LISTING_ID,
        SLUG,
        true,
      ),
    );

    const response = await POST(listingRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "Potential duplicate evidence requires review before this listing can publish.",
      listingId: LISTING_ID,
      slug: SLUG,
      pendingReview: true,
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListings).not.toHaveBeenCalled();
  });
});
