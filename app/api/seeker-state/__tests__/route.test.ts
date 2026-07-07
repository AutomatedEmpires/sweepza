import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isClerkConfigured: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  getSeekerStateSnapshotForAppUser: vi.fn(),
  updateSeekerState: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  isClerkConfigured: mocks.isClerkConfigured,
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));

vi.mock("@/lib/db/seeker-state", () => ({
  getSeekerStateSnapshotForAppUser: mocks.getSeekerStateSnapshotForAppUser,
  updateSeekerState: mocks.updateSeekerState,
}));

import { GET, POST } from "@/app/api/seeker-state/route";

const LISTING_ID = "1a2b3c4d-1111-4222-8333-444455556666";
const SNAPSHOT = { primary: {}, saved: {}, activity: {} };

function postRequest(body: unknown): Request {
  return new Request("http://test.local/api/seeker-state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.isClerkConfigured.mockReturnValue(true);
  mocks.ensureCurrentAppUser.mockResolvedValue({ appUserId: "user-1" });
  mocks.getSeekerStateSnapshotForAppUser.mockResolvedValue(SNAPSHOT);
  mocks.updateSeekerState.mockResolvedValue(undefined);
});

describe("GET /api/seeker-state", () => {
  it("returns 503 when Clerk is not configured", async () => {
    mocks.isClerkConfigured.mockReturnValue(false);
    const response = await GET();
    expect(response.status).toBe(503);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.ensureCurrentAppUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the snapshot for the signed-in user", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: SNAPSHOT });
    expect(mocks.getSeekerStateSnapshotForAppUser).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/seeker-state", () => {
  it("returns 401 when unauthenticated (never writes)", async () => {
    mocks.ensureCurrentAppUser.mockResolvedValue(null);
    const response = await POST(
      postRequest({ listingId: LISTING_ID, primaryUiState: "saved" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.updateSeekerState).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid listing id", async () => {
    const response = await POST(
      postRequest({ listingId: "not-a-uuid", primaryUiState: "saved" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.updateSeekerState).not.toHaveBeenCalled();
  });

  it("rejects an unknown primary state", async () => {
    const response = await POST(
      postRequest({ listingId: LISTING_ID, primaryUiState: "hoarded" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.updateSeekerState).not.toHaveBeenCalled();
  });

  it("persists a valid mutation scoped to the signed-in user", async () => {
    const response = await POST(
      postRequest({ listingId: LISTING_ID, primaryUiState: "entered", saved: true }),
    );
    expect(response.status).toBe(200);
    expect(mocks.updateSeekerState).toHaveBeenCalledWith({
      appUserId: "user-1",
      listingId: LISTING_ID,
      primaryUiState: "entered",
      saved: true,
    });
    expect(await response.json()).toMatchObject({ ok: true, data: SNAPSHOT });
  });
});
