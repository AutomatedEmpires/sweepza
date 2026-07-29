import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  appendOfficialDestinationPolicyEvent,
  getOfficialDestinationPolicyReadiness,
  listCurrentOfficialDestinationPolicies,
} from "@/lib/db/official-destination-policy";

function clientWith(result: { data: unknown[] | null; error: unknown }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          order: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    hostname: "sponsor.example.com",
    path_prefix: "/",
    include_subdomains: false,
    compliance_state: "approved_for_production",
    robots_posture: "permissive",
    tos_posture: "permits_use",
    terms_url: "https://sponsor.example.com/terms",
    robots_url: "https://sponsor.example.com/robots.txt",
    approved_by: "33333333-3333-4333-8333-333333333333",
    approved_at: "2026-07-29T00:00:00.000Z",
    review_expires_at: "2026-12-31T23:59:59.999Z",
    ...overrides,
  };
}

function draftDecision() {
  return {
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    expectedCurrentId: null,
    expectedLedgerVersion: null,
    hostname: "sponsor.example.com",
    pathPrefix: "/rules",
    includeSubdomains: false,
    complianceState: "draft" as const,
    robotsPosture: "unknown" as const,
    tosPosture: "unreviewed" as const,
    termsUrl: null,
    robotsUrl: null,
    reason: "The destination still requires a compliance review.",
    reviewExpiresAt: null,
    productionApprovalConfirmed: false,
  };
}

beforeEach(() => {
  mocks.createServiceRoleClient.mockReset();
});

describe("official destination policy persistence", () => {
  it("throws when destination authority cannot be read", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        data: null,
        error: { message: "relation unavailable" },
      }),
    );

    await expect(listCurrentOfficialDestinationPolicies()).rejects.toThrow(
      "relation unavailable",
    );
  });

  it("counts only currently executable destinations as ready", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        data: [
          row(),
          row({
            id: 2,
            hostname: "draft.example.com",
            compliance_state: "draft",
            approved_by: null,
            approved_at: null,
          }),
          row({
            id: 3,
            hostname: "expired.example.com",
            review_expires_at: "2026-07-29T01:00:00.000Z",
          }),
        ],
        error: null,
      }),
    );

    await expect(
      getOfficialDestinationPolicyReadiness(
        new Date("2026-07-29T12:00:00.000Z"),
      ),
    ).resolves.toEqual({
      configuredDestinationCount: 3,
      approvedDestinationCount: 1,
      ready: true,
    });
  });

  it.each(["paused", "blocked", "revoked"] as const)(
    "does not count an older narrow approval under a newer broad %s stop",
    async (complianceState) => {
      mocks.createServiceRoleClient.mockReturnValue(
        clientWith({
          data: [
            row({
              id: 10,
              path_prefix: "/promotions",
            }),
            row({
              id: 20,
              path_prefix: "/",
              compliance_state: complianceState,
              approved_by: null,
              approved_at: null,
              review_expires_at: null,
            }),
          ],
          error: null,
        }),
      );

      await expect(
        getOfficialDestinationPolicyReadiness(
          new Date("2026-07-29T12:00:00.000Z"),
        ),
      ).resolves.toEqual({
        configuredDestinationCount: 2,
        approvedDestinationCount: 0,
        ready: false,
      });
    },
  );

  it("counts a newer narrow reapproval after a broad containment stop", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        data: [
          row({
            id: 20,
            path_prefix: "/",
            compliance_state: "paused",
            approved_by: null,
            approved_at: null,
            review_expires_at: null,
          }),
          row({
            id: 30,
            path_prefix: "/promotions",
          }),
        ],
        error: null,
      }),
    );

    await expect(
      getOfficialDestinationPolicyReadiness(
        new Date("2026-07-29T12:00:00.000Z"),
      ),
    ).resolves.toEqual({
      configuredDestinationCount: 2,
      approvedDestinationCount: 1,
      ready: true,
    });
  });

  it("keeps an empty but readable ledger dark", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({ data: [], error: null }),
    );

    await expect(getOfficialDestinationPolicyReadiness()).resolves.toEqual({
      configuredDestinationCount: 0,
      approvedDestinationCount: 0,
      ready: false,
    });
  });

  it("uses the atomic append RPC with concurrency and idempotency inputs", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 42, idempotent: false },
      error: null,
    });
    const rpc = vi.fn(() => ({ single }));
    mocks.createServiceRoleClient.mockReturnValue({ rpc });
    const decision = draftDecision();

    await expect(
      appendOfficialDestinationPolicyEvent({
        actorUserId: "33333333-3333-4333-8333-333333333333",
        decision,
      }),
    ).resolves.toEqual({ id: 42, idempotent: false });

    expect(rpc).toHaveBeenCalledWith(
      "append_official_destination_policy_event",
      {
        p_actor_user_id: "33333333-3333-4333-8333-333333333333",
        p_decision: decision,
        p_expected_current_id: null,
        p_idempotency_key: decision.idempotencyKey,
      },
    );
  });

  it("preserves the database conflict code for the API boundary", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "40001", message: "stale policy" },
    });
    mocks.createServiceRoleClient.mockReturnValue({
      rpc: vi.fn(() => ({ single })),
    });

    await expect(
      appendOfficialDestinationPolicyEvent({
        actorUserId: "33333333-3333-4333-8333-333333333333",
        decision: draftDecision(),
      }),
    ).rejects.toMatchObject({ code: "40001" });
  });
});
