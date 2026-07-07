import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getPublicListings: vi.fn(),
  getSeekerHistoryListingsByIds: vi.fn(),
}));

vi.mock("@/lib/db/listings", () => ({
  getPublicListings: mocks.getPublicListings,
  getSeekerHistoryListingsByIds: mocks.getSeekerHistoryListingsByIds,
}));

import { GET } from "@/app/api/listings/route";

const UUID_A = "aaaaaaaa-1111-4222-8333-444455556666";
const UUID_B = "bbbbbbbb-1111-4222-8333-444455556666";

function request(query: string): NextRequest {
  return new NextRequest(`http://test.local/api/listings${query}`);
}

beforeEach(() => {
  mocks.getPublicListings.mockResolvedValue([]);
  mocks.getSeekerHistoryListingsByIds.mockResolvedValue([]);
});

describe("GET /api/listings?ids=", () => {
  it("routes id lookups through the seeker-history query", async () => {
    const response = await GET(request(`?ids=${UUID_A},${UUID_B}`));
    expect(response.status).toBe(200);
    expect(mocks.getSeekerHistoryListingsByIds).toHaveBeenCalledWith([
      UUID_A,
      UUID_B,
    ]);
    expect(mocks.getPublicListings).not.toHaveBeenCalled();
  });

  it("drops values that are not UUIDs", async () => {
    await GET(request(`?ids=${UUID_A},<script>,1,--`));
    expect(mocks.getSeekerHistoryListingsByIds).toHaveBeenCalledWith([UUID_A]);
  });

  it("caps the id set at 100", async () => {
    const ids = Array.from({ length: 150 }, (_, i) =>
      `${i.toString(16).padStart(8, "0")}-1111-4222-8333-444455556666`,
    );
    await GET(request(`?ids=${ids.join(",")}`));
    const passed = mocks.getSeekerHistoryListingsByIds.mock.calls[0][0];
    expect(passed).toHaveLength(100);
  });

  it("ignores an all-invalid ids param and serves the public feed", async () => {
    await GET(request("?ids=nope,also-nope"));
    expect(mocks.getSeekerHistoryListingsByIds).not.toHaveBeenCalled();
    expect(mocks.getPublicListings).toHaveBeenCalled();
  });
});

describe("GET /api/listings (public feed)", () => {
  it("clamps limit into [1, 100] and defaults invalid sorts", async () => {
    const response = await GET(request("?limit=5000&sort=chaotic"));
    expect(response.status).toBe(200);
    expect(mocks.getPublicListings).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
    const payload = await response.json();
    expect(payload.meta.sort).toBe("recommended");
  });

  it("passes through search query and verified flag", async () => {
    await GET(request("?q=truck&verifiedOnly=true"));
    expect(mocks.getPublicListings).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: "truck", verifiedOnly: true }),
    );
  });

  it("filters entry frequencies to known enum values", async () => {
    await GET(request("?entryFrequency=daily,bogus,weekly"));
    expect(mocks.getPublicListings).toHaveBeenCalledWith(
      expect.objectContaining({ entryFrequencies: ["daily", "weekly"] }),
    );
  });
});
