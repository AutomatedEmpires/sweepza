import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendOfficialDestinationPolicyEvent: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  requireAdminApi: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));
vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));
vi.mock("@/lib/db/official-destination-policy", () => ({
  appendOfficialDestinationPolicyEvent:
    mocks.appendOfficialDestinationPolicyEvent,
}));

import { POST } from "@/app/api/admin/ingestion/destinations/route";

function request(body: unknown): Request {
  return new Request("https://sweepza.test/api/admin/ingestion/destinations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function draftDecision(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    expectedCurrentId: null,
    expectedLedgerVersion: null,
    hostname: "Sponsor.Example.com.",
    pathPrefix: "/rules/",
    includeSubdomains: false,
    complianceState: "draft",
    robotsPosture: "unknown",
    tosPosture: "unreviewed",
    termsUrl: "",
    robotsUrl: "",
    reason: "Initial destination review is not complete.",
    reviewExpiresAt: null,
    productionApprovalConfirmed: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.appendOfficialDestinationPolicyEvent.mockReset();
  mocks.ensureCurrentAppUser.mockReset();
  mocks.requireAdminApi.mockReset();
  mocks.requireAdminApi.mockResolvedValue({ ok: true });
  mocks.ensureCurrentAppUser.mockResolvedValue({
    appUserId: "33333333-3333-4333-8333-333333333333",
    appUser: { is_admin: true, is_owner: false },
  });
  mocks.appendOfficialDestinationPolicyEvent.mockResolvedValue({
    id: 42,
    idempotent: false,
  });
});

describe("POST /api/admin/ingestion/destinations", () => {
  it("requires the server-side admin or owner gate", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: false,
      status: 403,
      message: "Admin access required.",
    });

    const response = await POST(request(draftDecision()));

    expect(response.status).toBe(403);
    expect(mocks.ensureCurrentAppUser).not.toHaveBeenCalled();
    expect(mocks.appendOfficialDestinationPolicyEvent).not.toHaveBeenCalled();
  });

  it("rechecks the operator role before the service-role write", async () => {
    mocks.ensureCurrentAppUser.mockResolvedValue({
      appUserId: "33333333-3333-4333-8333-333333333333",
      appUser: { is_admin: false, is_owner: false },
    });

    const response = await POST(request(draftDecision()));

    expect(response.status).toBe(403);
    expect(mocks.appendOfficialDestinationPolicyEvent).not.toHaveBeenCalled();
  });

  it("canonicalizes host and path and attributes the authenticated operator", async () => {
    const response = await POST(request(draftDecision()));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: 42,
      idempotent: false,
    });
    expect(mocks.appendOfficialDestinationPolicyEvent).toHaveBeenCalledWith({
      actorUserId: "33333333-3333-4333-8333-333333333333",
      decision: expect.objectContaining({
        hostname: "sponsor.example.com",
        pathPrefix: "/rules",
      }),
    });
  });

  it("refuses production approval without evidence and explicit confirmation", async () => {
    const response = await POST(
      request(
        draftDecision({
          complianceState: "approved_for_production",
          robotsPosture: "permissive",
          tosPosture: "permits_use",
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.appendOfficialDestinationPolicyEvent).not.toHaveBeenCalled();
  });

  it("accepts an explicitly confirmed production decision with HTTPS evidence", async () => {
    const response = await POST(
      request(
        draftDecision({
          complianceState: "approved_for_production",
          robotsPosture: "permissive_with_delay",
          tosPosture: "permits_use",
          termsUrl: "https://sponsor.example.com/terms",
          robotsUrl: "https://sponsor.example.com/robots.txt",
          reviewExpiresAt: "2026-12-31T23:59:59.999Z",
          productionApprovalConfirmed: true,
        }),
      ),
    );

    expect(response.status).toBe(201);
    expect(mocks.appendOfficialDestinationPolicyEvent).toHaveBeenCalledTimes(1);
  });

  it("returns a successful replay without creating another policy event", async () => {
    mocks.appendOfficialDestinationPolicyEvent.mockResolvedValue({
      id: 42,
      idempotent: true,
    });

    const response = await POST(request(draftDecision()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: 42,
      idempotent: true,
    });
  });

  it.each([
    ["40001", "changed while you were reviewing"],
    ["23505", "submission key was already used"],
  ])("maps database conflict %s to a safe retry response", async (code, copy) => {
    mocks.appendOfficialDestinationPolicyEvent.mockRejectedValue({ code });

    const response = await POST(request(draftDecision()));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain(copy);
  });
});
