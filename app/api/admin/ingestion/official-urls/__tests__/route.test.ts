import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  enqueueOfficialUrlIntake: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  requireAdminApi: vi.fn(),
  OfficialUrlIntakeIdempotencyConflictError: class extends Error {},
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));
vi.mock("@/lib/admin-guard", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));
vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));
vi.mock("@/lib/db/official-url-intake", () => ({
  enqueueOfficialUrlIntake: mocks.enqueueOfficialUrlIntake,
  OfficialUrlIntakeIdempotencyConflictError:
    mocks.OfficialUrlIntakeIdempotencyConflictError,
}));

import { POST } from "@/app/api/admin/ingestion/official-urls/route";

const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

function request(entries: unknown): Request {
  return new Request(
    "https://sweepza.test/api/admin/ingestion/official-urls",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    },
  );
}

function entry(index = 1) {
  return {
    idempotencyKey: `partner-feed:promotion-${index}`,
    officialUrl: `https://sponsor.example.com/rules/${index}#terms`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminApi.mockResolvedValue({ ok: true });
  mocks.ensureCurrentAppUser.mockResolvedValue({
    appUserId: ACTOR_ID,
    appUser: { is_admin: true, is_owner: false },
  });
  mocks.enqueueOfficialUrlIntake.mockImplementation(
    async ({ entries }: { entries: unknown[] }) => ({
      accepted: entries.length,
      replayed: 0,
    }),
  );
});

describe("POST /api/admin/ingestion/official-urls", () => {
  it("requires the server-side admin boundary", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: false,
      status: 403,
      message: "Admin access required.",
    });

    const response = await POST(request([entry()]));

    expect(response.status).toBe(403);
    expect(mocks.ensureCurrentAppUser).not.toHaveBeenCalled();
    expect(mocks.enqueueOfficialUrlIntake).not.toHaveBeenCalled();
  });

  it("rechecks the operator role before the service-role queue write", async () => {
    mocks.ensureCurrentAppUser.mockResolvedValue({
      appUserId: ACTOR_ID,
      appUser: { is_admin: false, is_owner: false },
    });

    const response = await POST(request([entry()]));

    expect(response.status).toBe(403);
    expect(mocks.enqueueOfficialUrlIntake).not.toHaveBeenCalled();
  });

  it("queues validated HTTPS URLs with authenticated operator attribution", async () => {
    const response = await POST(request([entry(1), entry(2)]));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      accepted: 2,
      replayed: 0,
      status: "queued_for_private_draft_review",
    });
    expect(mocks.enqueueOfficialUrlIntake).toHaveBeenCalledWith({
      actorAppUserId: ACTOR_ID,
      entries: [
        {
          idempotencyKey: "partner-feed:promotion-1",
          officialUrl: "https://sponsor.example.com/rules/1",
        },
        {
          idempotencyKey: "partner-feed:promotion-2",
          officialUrl: "https://sponsor.example.com/rules/2",
        },
      ],
    });
  });

  it("accepts the bounded 500-item maximum", async () => {
    const entries = Array.from({ length: 500 }, (_, index) =>
      entry(index + 1),
    );

    const response = await POST(request(entries));

    expect(response.status).toBe(202);
    expect(mocks.enqueueOfficialUrlIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            idempotencyKey: "partner-feed:promotion-500",
          }),
        ]),
      }),
    );
  });

  it.each([
    {
      name: "an empty batch",
      entries: [],
    },
    {
      name: "more than 500 URLs",
      entries: Array.from({ length: 501 }, (_, index) => entry(index + 1)),
    },
    {
      name: "a non-HTTPS URL",
      entries: [
        {
          ...entry(),
          officialUrl: "http://sponsor.example.com/rules",
        },
      ],
    },
    {
      name: "credentials in a URL",
      entries: [
        {
          ...entry(),
          officialUrl: "https://user:password@sponsor.example.com/rules",
        },
      ],
    },
    {
      name: "a non-default HTTPS port",
      entries: [
        {
          ...entry(),
          officialUrl: "https://sponsor.example.com:8443/rules",
        },
      ],
    },
    {
      name: "an IP-literal destination",
      entries: [
        {
          ...entry(),
          officialUrl: "https://127.0.0.1/rules",
        },
      ],
    },
    {
      name: "a public suffix without a registrable domain",
      entries: [
        {
          ...entry(),
          officialUrl: "https://co.uk/rules",
        },
      ],
    },
    {
      name: "duplicate idempotency keys",
      entries: [entry(), { ...entry(), officialUrl: "https://other.example.com/rules" }],
    },
  ])("rejects $name without writing", async ({ entries }) => {
    const response = await POST(request(entries));

    expect(response.status).toBe(400);
    expect(mocks.enqueueOfficialUrlIntake).not.toHaveBeenCalled();
  });

  it("fails closed without implying any listing was published", async () => {
    mocks.enqueueOfficialUrlIntake.mockRejectedValue(
      new Error("queue unavailable"),
    );

    const response = await POST(request([entry()]));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Official URLs could not be queued safely. No listing was published.",
    });
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it("returns 409 without reporting an expected idempotency conflict", async () => {
    mocks.enqueueOfficialUrlIntake.mockRejectedValue(
      new mocks.OfficialUrlIntakeIdempotencyConflictError(),
    );

    const response = await POST(request([entry()]));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "An idempotency key was already used for a different official URL. Use a new key for new work.",
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});
