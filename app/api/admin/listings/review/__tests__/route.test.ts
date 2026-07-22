import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCurrentAppUser: vi.fn(),
  getReviewListingById: vi.fn(),
  isClerkConfigured: vi.fn(),
  revalidatePublicListings: vi.fn(),
  rpc: vi.fn(),
  sendHostNotification: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
  isClerkConfigured: mocks.isClerkConfigured,
}));
vi.mock("@/lib/db/listing-review", () => ({
  getReviewListingById: mocks.getReviewListingById,
}));
vi.mock("@/lib/db/listings-cache", () => ({
  revalidatePublicListings: mocks.revalidatePublicListings,
}));
vi.mock("@/lib/email/notifications", () => ({
  sendHostNotification: mocks.sendHostNotification,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "@/app/api/admin/listings/review/route";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";

function reviewRequest(): Request {
  return new Request("http://test.local/api/admin/listings/review", {
    method: "POST",
    body: JSON.stringify({ listingId: LISTING_ID, action: "approve" }),
  });
}

beforeEach(() => {
  mocks.ensureCurrentAppUser.mockReset();
  mocks.getReviewListingById.mockReset();
  mocks.isClerkConfigured.mockReset();
  mocks.revalidatePublicListings.mockReset();
  mocks.rpc.mockReset();
  mocks.sendHostNotification.mockReset();

  mocks.isClerkConfigured.mockReturnValue(true);
  mocks.ensureCurrentAppUser.mockResolvedValue({
    appUserId: "reviewer-1",
    appUser: { is_admin: true, is_owner: false },
  });
  mocks.rpc.mockResolvedValue({ data: { id: LISTING_ID }, error: null });
});

describe("POST /api/admin/listings/review", () => {
  it("reviews claimed-host listings through the same canonical RPC", async () => {
    mocks.getReviewListingById.mockResolvedValue({
      id: LISTING_ID,
      source_type: "claimed_host",
      host_id: null,
      slug: "claimed-promotion",
      title: "Claimed promotion",
    });

    const response = await POST(reviewRequest());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("review_canonical_listing", {
      p_listing_id: LISTING_ID,
      p_reviewer_user_id: "reviewer-1",
      p_action: "approve",
      p_review_notes: null,
    });
    expect(mocks.revalidatePublicListings).toHaveBeenCalledOnce();
  });

  it("still rejects sources outside the canonical review workflow", async () => {
    mocks.getReviewListingById.mockResolvedValue({
      id: LISTING_ID,
      source_type: "unsupported_source",
      host_id: null,
      slug: "unsupported",
      title: "Unsupported",
    });

    const response = await POST(reviewRequest());

    expect(response.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListings).not.toHaveBeenCalled();
  });
});
