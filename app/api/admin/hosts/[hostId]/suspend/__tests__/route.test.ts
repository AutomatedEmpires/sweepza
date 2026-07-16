import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  suspendHost: vi.fn(),
  revalidatePublicListings: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/lib/db/admin", () => ({ suspendHost: mocks.suspendHost }));
vi.mock("@/lib/db/listings-cache", () => ({
  revalidatePublicListings: mocks.revalidatePublicListings,
}));

import { POST } from "@/app/api/admin/hosts/[hostId]/suspend/route";

const HOST_ID = "11111111-1111-1111-1111-111111111111";

function suspendRequest(): Request {
  return new Request("http://test.local/api/admin/hosts/x/suspend", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

beforeEach(() => {
  mocks.requireAdminApi.mockReset();
  mocks.suspendHost.mockReset();
  mocks.revalidatePublicListings.mockReset();
});

describe("POST /api/admin/hosts/[hostId]/suspend", () => {
  it("busts the public feed after a successful suspension", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true });
    mocks.suspendHost.mockResolvedValue(undefined);

    const response = await POST(suspendRequest(), {
      params: Promise.resolve({ hostId: HOST_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.suspendHost).toHaveBeenCalledWith(HOST_ID);
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
