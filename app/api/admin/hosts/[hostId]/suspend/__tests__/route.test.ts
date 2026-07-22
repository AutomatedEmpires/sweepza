import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  suspendHost: vi.fn(),
  revalidatePublicListings: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));
vi.mock("@/lib/db/admin", () => ({ suspendHost: mocks.suspendHost }));
vi.mock("@/lib/db/listings-cache", () => ({
  revalidatePublicListings: mocks.revalidatePublicListings,
}));

import { POST } from "@/app/api/admin/hosts/[hostId]/suspend/route";

const HOST_ID = "11111111-1111-1111-1111-111111111111";

function suspendRequest(): Request {
  return new Request("http://test.local/api/admin/hosts/x/suspend", {
    method: "POST",
    body: JSON.stringify({ notes: "Authority evidence was invalid." }),
  });
}

beforeEach(() => {
  mocks.requireAdminApi.mockReset();
  mocks.ensureCurrentAppUser.mockReset();
  mocks.suspendHost.mockReset();
  mocks.revalidatePublicListings.mockReset();
  mocks.ensureCurrentAppUser.mockResolvedValue({ appUserId: "reviewer-1" });
});

describe("POST /api/admin/hosts/[hostId]/suspend", () => {
  it("busts the public feed after a successful suspension", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true });
    mocks.suspendHost.mockResolvedValue(undefined);

    const response = await POST(suspendRequest(), {
      params: Promise.resolve({ hostId: HOST_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.suspendHost).toHaveBeenCalledWith({
      hostId: HOST_ID,
      actorUserId: "reviewer-1",
      notes: "Authority evidence was invalid.",
    });
    expect(mocks.revalidatePublicListings).toHaveBeenCalledOnce();
  });

  it("leaves the cache untouched when authorization fails", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: false,
      status: 403,
      message: "Forbidden",
    });

    const response = await POST(suspendRequest(), {
      params: Promise.resolve({ hostId: HOST_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.suspendHost).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListings).not.toHaveBeenCalled();
  });
});
