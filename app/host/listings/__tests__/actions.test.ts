import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deactivateListing: vi.fn(),
  reactivateListing: vi.fn(),
  submitForReview: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListings: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db/host-dashboard", () => ({
  deactivateListing: mocks.deactivateListing,
  reactivateListing: mocks.reactivateListing,
  submitForReview: mocks.submitForReview,
}));
vi.mock("@/lib/db/listings-cache", () => ({
  revalidatePublicListings: mocks.revalidatePublicListings,
}));

import {
  deactivateListingAction,
  reactivateListingAction,
} from "@/app/host/listings/actions";

function formWith(listingId: string): FormData {
  const form = new FormData();
  if (listingId) form.set("listingId", listingId);
  return form;
}

beforeEach(() => {
  mocks.deactivateListing.mockReset();
  mocks.reactivateListing.mockReset();
  mocks.submitForReview.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.revalidatePublicListings.mockReset();
});

describe("deactivateListingAction", () => {
  it("busts the public feed after taking a listing down", async () => {
    mocks.deactivateListing.mockResolvedValue(undefined);

    await deactivateListingAction(formWith("listing-1"));

    expect(mocks.deactivateListing).toHaveBeenCalledWith("listing-1");
    expect(mocks.revalidatePublicListings).toHaveBeenCalledOnce();
  });

  it("no-ops without a listing id", async () => {
    await deactivateListingAction(formWith(""));

    expect(mocks.deactivateListing).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListings).not.toHaveBeenCalled();
  });
});

describe("reactivateListingAction", () => {
  it("reactivates the owned listing and refreshes host and public reads", async () => {
    mocks.reactivateListing.mockResolvedValue(undefined);

    await reactivateListingAction(formWith("listing-2"));

    expect(mocks.reactivateListing).toHaveBeenCalledWith("listing-2");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host");
    expect(mocks.revalidatePublicListings).toHaveBeenCalledOnce();
  });

  it("no-ops without a listing id", async () => {
    await reactivateListingAction(formWith(""));

    expect(mocks.reactivateListing).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListings).not.toHaveBeenCalled();
  });
});
