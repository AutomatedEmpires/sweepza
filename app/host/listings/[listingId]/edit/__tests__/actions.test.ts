import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  revalidatePublicListings: vi.fn(),
  saveHostListingEdit: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db/host-dashboard", () => ({
  saveHostListingEdit: mocks.saveHostListingEdit,
}));
vi.mock("@/lib/db/listings-cache", () => ({
  revalidatePublicListings: mocks.revalidatePublicListings,
}));

import { editHostListingAction } from "@/app/host/listings/[listingId]/edit/actions";

beforeEach(() => {
  mocks.redirect.mockReset();
  mocks.revalidatePublicListings.mockReset();
  mocks.saveHostListingEdit.mockReset();
});

describe("editHostListingAction", () => {
  it("invalidates formerly public reads after material edits return a listing to draft", async () => {
    const form = new FormData();
    form.set("listingId", "active-listing");
    mocks.saveHostListingEdit.mockResolvedValue(undefined);

    await editHostListingAction(form);

    expect(mocks.saveHostListingEdit).toHaveBeenCalledWith(form);
    expect(mocks.revalidatePublicListings).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/host/listings?updated=1");
  });

  it("does not invalidate or redirect when persistence fails", async () => {
    const form = new FormData();
    mocks.saveHostListingEdit.mockRejectedValue(new Error("write failed"));

    await expect(editHostListingAction(form)).rejects.toThrow("write failed");

    expect(mocks.revalidatePublicListings).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
