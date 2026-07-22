import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  createCanonicalListing: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  getHostByAppUserId: vi.fn(),
  isClerkConfigured: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));
vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
  isClerkConfigured: mocks.isClerkConfigured,
}));
vi.mock("@/lib/db/hosts", () => ({
  getHostByAppUserId: mocks.getHostByAppUserId,
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

import {
  CanonicalListingConflictError,
  CanonicalListingPendingReviewError,
} from "@/lib/db/canonical-listing-write";
import { POST } from "@/app/api/host/listings/route";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const SLUG = "official-summer-prize-sweepstakes";

function listingRequest(): Request {
  return new Request("http://test.local/api/host/listings", {
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
    }),
  });
}

beforeEach(() => {
  mocks.captureException.mockReset();
  mocks.createCanonicalListing.mockReset();
  mocks.ensureCurrentAppUser.mockReset();
  mocks.getHostByAppUserId.mockReset();
  mocks.isClerkConfigured.mockReset();

  mocks.isClerkConfigured.mockReturnValue(true);
  mocks.ensureCurrentAppUser.mockResolvedValue({
    appUserId: "33333333-3333-4333-8333-333333333333",
    appUser: { is_host: true },
  });
  mocks.getHostByAppUserId.mockResolvedValue({
    id: "44444444-4444-4444-8444-444444444444",
  });
});

describe("POST /api/host/listings duplicate outcomes", () => {
  it("returns a created pending-review result for a committed fuzzy match", async () => {
    mocks.createCanonicalListing.mockRejectedValue(
      new CanonicalListingPendingReviewError(
        "Potential duplicate evidence requires review before this listing can publish.",
        LISTING_ID,
        SLUG,
        true,
      ),
    );

    const response = await POST(listingRequest());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: LISTING_ID,
      slug: SLUG,
      url: "/host/listings",
      pendingReview: true,
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("returns success for an idempotent retry of the pending-review draft", async () => {
    mocks.createCanonicalListing.mockRejectedValue(
      new CanonicalListingPendingReviewError(
        "Potential duplicate evidence requires review before this listing can publish.",
        LISTING_ID,
        SLUG,
        false,
      ),
    );

    const response = await POST(listingRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      id: LISTING_ID,
      slug: SLUG,
      pendingReview: true,
    });
  });

  it("keeps a pre-existing canonical listing on the 409 claim path", async () => {
    mocks.createCanonicalListing.mockRejectedValue(
      new CanonicalListingConflictError(
        "A listing with the same official source and promotion cycle already exists.",
        LISTING_ID,
      ),
    );

    const response = await POST(listingRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "This promotion already exists in Sweepza. Use the claim workflow instead of creating a duplicate.",
      listingId: LISTING_ID,
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});
