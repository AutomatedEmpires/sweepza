import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  actOnReport: vi.fn(),
  revalidatePublicListings: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));
vi.mock("@/lib/db/admin", () => ({ actOnReport: mocks.actOnReport }));
vi.mock("@/lib/db/listings-cache", () => ({
  revalidatePublicListings: mocks.revalidatePublicListings,
}));

import { POST } from "@/app/api/admin/reports/[reportId]/act/route";

const REPORT_ID = "22222222-2222-2222-2222-222222222222";

function actRequest(): Request {
  return new Request("http://test.local/api/admin/reports/x/act", {
    method: "POST",
    body: JSON.stringify({ reviewNotes: "Confirmed against the supplied evidence." }),
  });
}

beforeEach(() => {
  mocks.requireAdminApi.mockReset();
  mocks.actOnReport.mockReset();
  mocks.revalidatePublicListings.mockReset();
  mocks.requireAdminApi.mockResolvedValue({ ok: true });
  mocks.ensureCurrentAppUser.mockResolvedValue({ appUserId: "reviewer-1" });
});

describe("POST /api/admin/reports/[reportId]/act", () => {
  it("busts the public feed when the acted-on report targets a listing", async () => {
    mocks.actOnReport.mockResolvedValue({
      target_type: "listing",
      target_id: "listing-id",
    });

    const response = await POST(actRequest(), {
      params: Promise.resolve({ reportId: REPORT_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.actOnReport).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      reviewerUserId: "reviewer-1",
      reviewNotes: "Confirmed against the supplied evidence.",
    });
    expect(mocks.revalidatePublicListings).toHaveBeenCalledOnce();
  });

  it("does not bust the feed for non-listing report targets", async () => {
    mocks.actOnReport.mockResolvedValue({
      target_type: "winner_post",
      target_id: "winner-id",
    });

    const response = await POST(actRequest(), {
      params: Promise.resolve({ reportId: REPORT_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.revalidatePublicListings).not.toHaveBeenCalled();
  });
});
