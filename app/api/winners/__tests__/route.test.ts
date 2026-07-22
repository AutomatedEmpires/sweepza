import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  createServiceRoleClient: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
  from: vi.fn(),
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

vi.mock("@/lib/rate-limit", () => ({
  clientKey: () => "test-client",
  rateLimitShared: mocks.rateLimitShared,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { POST } from "@/app/api/winners/route";

const LISTING_ID = "1a2b3c4d-1111-4222-8333-444455556666";

function postRequest(): Request {
  return new Request("http://test.local/api/winners", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      listingId: LISTING_ID,
      caption: "I won a surprise prize!",
    }),
  });
}

function selectQuery(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function insertQuery(result: unknown) {
  const query = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  query.insert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function setUpSupabase(insertError: { code: string; message: string }) {
  const seekerStateQuery = selectQuery({
    data: {
      listing_id: LISTING_ID,
      entered_at: "2026-07-21T12:00:00.000Z",
      won_at: null,
    },
    error: null,
  });
  const listingQuery = selectQuery({
    data: { id: LISTING_ID, listing_verification_status: "reviewed" },
    error: null,
  });
  const duplicateQuery = selectQuery({ data: null, error: null });
  const winnerInsertQuery = insertQuery({ data: null, error: insertError });
  let winnerPostQueryCount = 0;

  mocks.from.mockImplementation((table: string) => {
    if (table === "listing_seeker_state") return seekerStateQuery;
    if (table === "listing") return listingQuery;
    if (table === "winner_post") {
      winnerPostQueryCount += 1;
      return winnerPostQueryCount === 1 ? duplicateQuery : winnerInsertQuery;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

beforeEach(() => {
  mocks.captureException.mockReset();
  mocks.createServiceRoleClient.mockReset();
  mocks.ensureCurrentAppUser.mockReset();
  mocks.from.mockReset();
  mocks.isClerkConfigured.mockReset();
  mocks.rateLimitShared.mockReset();

  mocks.isClerkConfigured.mockReturnValue(true);
  mocks.ensureCurrentAppUser.mockResolvedValue({ appUserId: "user-1" });
  mocks.rateLimitShared.mockResolvedValue({ ok: true, retryAfterSec: 0 });
  mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from });
});

describe("POST /api/winners", () => {
  it("returns 409 when a concurrent submission hits the winner uniqueness index", async () => {
    setUpSupabase({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "winner_post_one_open_or_published_per_listing_uidx"',
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "You already have a Winner Wall post for this sweepstakes.",
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("keeps unexpected winner insert failures on the server-error path", async () => {
    setUpSupabase({ code: "XX000", message: "database unavailable" });

    const response = await POST(postRequest());

    expect(response.status).toBe(500);
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
