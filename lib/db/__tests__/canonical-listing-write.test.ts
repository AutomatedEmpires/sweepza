import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  CanonicalListingConflictError,
  CanonicalListingPendingReviewError,
  createCanonicalListing,
  type CanonicalListingWriteInput,
} from "@/lib/db/canonical-listing-write";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";

const input: CanonicalListingWriteInput = {
  title: "Official summer prize sweepstakes",
  shortDescription: "Enter at the official sponsor source for a summer prize.",
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
};

beforeEach(() => {
  mocks.createServiceRoleClient.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockReset();

  const categoryQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { code: "cash" },
      error: null,
    }),
  };
  categoryQuery.select.mockReturnValue(categoryQuery);
  categoryQuery.eq.mockReturnValue(categoryQuery);
  mocks.from.mockImplementation((table: string) => {
    if (table === "category") return categoryQuery;
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.createServiceRoleClient.mockReturnValue({
    from: mocks.from,
    rpc: mocks.rpc,
  });
});

describe("createCanonicalListing duplicate outcomes", () => {
  it("identifies a committed fuzzy match as a created pending-review listing", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        listing_id: LISTING_ID,
        slug: "official-summer-prize-sweepstakes",
        created: true,
        idempotent: false,
        published: false,
        suspected_duplicate_ids: [
          "22222222-2222-4222-8222-222222222222",
        ],
      },
      error: null,
    });

    const result = createCanonicalListing(input, {
      kind: "host_submission",
      actorAppUserId: "33333333-3333-4333-8333-333333333333",
      hostId: "44444444-4444-4444-8444-444444444444",
    });

    await expect(result).rejects.toMatchObject({
      name: "CanonicalListingPendingReviewError",
      code: "canonical_listing_pending_review",
      listingId: LISTING_ID,
      slug: "official-summer-prize-sweepstakes",
      created: true,
    });
    await expect(result).rejects.toBeInstanceOf(
      CanonicalListingPendingReviewError,
    );
  });

  it("keeps a pre-existing canonical row on the genuine conflict path", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        listing_id: LISTING_ID,
        slug: null,
        created: false,
        idempotent: false,
        published: false,
        suspected_duplicate_ids: [],
      },
      error: null,
    });

    const result = createCanonicalListing(input, {
      kind: "host_submission",
      actorAppUserId: "33333333-3333-4333-8333-333333333333",
      hostId: "44444444-4444-4444-8444-444444444444",
    });

    await expect(result).rejects.toBeInstanceOf(CanonicalListingConflictError);
    await expect(result).rejects.not.toBeInstanceOf(
      CanonicalListingPendingReviewError,
    );
  });

  it("preserves an idempotent pending-review retry as not newly created", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        listing_id: LISTING_ID,
        slug: "official-summer-prize-sweepstakes",
        created: false,
        idempotent: true,
        published: false,
        suspected_duplicate_ids: [
          "22222222-2222-4222-8222-222222222222",
        ],
      },
      error: null,
    });

    const result = createCanonicalListing(input, {
      kind: "host_submission",
      actorAppUserId: "33333333-3333-4333-8333-333333333333",
      hostId: "44444444-4444-4444-8444-444444444444",
    });

    await expect(result).rejects.toMatchObject({
      name: "CanonicalListingPendingReviewError",
      listingId: LISTING_ID,
      created: false,
    });
  });
});
