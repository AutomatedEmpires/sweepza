import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  clientKey: vi.fn(),
  createReport: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  isClerkConfigured: vi.fn(),
  rateLimitShared: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));
vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
  isClerkConfigured: mocks.isClerkConfigured,
}));
vi.mock("@/lib/db/reports", () => ({
  createReport: mocks.createReport,
}));
vi.mock("@/lib/rate-limit", () => ({
  clientKey: mocks.clientKey,
  rateLimitShared: mocks.rateLimitShared,
}));

import { POST } from "@/app/api/reports/route";

const APP_USER_ID = "11111111-1111-4111-8111-111111111111";
const WINNER_POST_ID = "22222222-2222-4222-8222-222222222222";

function reportRequest(body: unknown): Request {
  return new Request("http://test.local/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.captureException.mockReset();
  mocks.clientKey.mockReset();
  mocks.createReport.mockReset();
  mocks.ensureCurrentAppUser.mockReset();
  mocks.isClerkConfigured.mockReset();
  mocks.rateLimitShared.mockReset();

  mocks.clientKey.mockReturnValue("test-client");
  mocks.rateLimitShared.mockResolvedValue({ ok: true, retryAfterSec: 0 });
  mocks.isClerkConfigured.mockReturnValue(true);
  mocks.ensureCurrentAppUser.mockResolvedValue({ appUserId: APP_USER_ID });
  mocks.createReport.mockResolvedValue({
    id: "33333333-3333-4333-8333-333333333333",
    status: "submitted",
    created: true,
  });
});

describe("POST /api/reports winner post authorization", () => {
  it("sends an authenticated winner report through the validated report service", async () => {
    const response = await POST(
      reportRequest({
        targetType: "winner_post",
        targetId: WINNER_POST_ID,
        reasonCode: "fake_winner_claim",
        details: "The story appears copied.",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createReport).toHaveBeenCalledWith({
      reporterUserId: APP_USER_ID,
      targetType: "winner_post",
      targetId: WINNER_POST_ID,
      reasonCode: "fake_winner_claim",
      details: "The story appears copied.",
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "submitted",
      created: true,
    });
  });

  it("rejects a signed-out report before touching persistence", async () => {
    mocks.ensureCurrentAppUser.mockResolvedValue(null);

    const response = await POST(
      reportRequest({
        targetType: "winner_post",
        targetId: WINNER_POST_ID,
        reasonCode: "spam",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createReport).not.toHaveBeenCalled();
  });

  it("rejects malformed winner targets before touching persistence", async () => {
    const response = await POST(
      reportRequest({
        targetType: "winner_post",
        targetId: "not-a-uuid",
        reasonCode: "fake_winner_claim",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createReport).not.toHaveBeenCalled();
  });
});
