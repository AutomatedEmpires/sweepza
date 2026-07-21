import { describe, expect, it, vi } from "vitest";
import {
  claimReminderScanBatch,
  completeReminderScan,
  findClaimedReminderEmailKeys,
  ReminderScanPersistenceError,
} from "@/lib/email/reminder-scan";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "22222222-2222-4222-8222-222222222222";

function client(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("claimReminderScanBatch", () => {
  it("maps the bounded database response into planner candidates", async () => {
    const supabase = client({
      data: [
        {
          app_user_id: USER_ID,
          scan_token: "33333333-3333-4333-8333-333333333333",
          email: "seeker@example.com",
          display_name: "Seeker",
          ready_again: true,
          ends_today: false,
          ends_soon: true,
          email_enabled: true,
          has_more_candidates: false,
          next_cursor_end_date: null,
          next_cursor_listing_id: null,
          candidates: [
            {
              saved_at: "2026-07-20T12:00:00.000Z",
              entered_at: null,
              skipped_at: null,
              won_at: null,
              listing: {
                id: LISTING_ID,
                slug: "official-prize",
                title: "Official prize",
                end_date: "2026-07-23",
                entry_frequency: "daily",
              },
            },
          ],
        },
      ],
      error: null,
    });

    await expect(claimReminderScanBatch(supabase as never, 25)).resolves.toEqual([
      {
        appUserId: USER_ID,
        scanToken: "33333333-3333-4333-8333-333333333333",
        email: "seeker@example.com",
        displayName: "Seeker",
        emailEnabled: true,
        prefs: { readyAgain: true, endsToday: false, endsSoon: true },
        hasMoreCandidates: false,
        nextCursorEndDate: null,
        nextCursorListingId: null,
        candidates: [
          {
            activity: {
              savedAt: "2026-07-20T12:00:00.000Z",
              enteredAt: null,
              skippedAt: null,
              wonAt: null,
            },
            listing: {
              id: LISTING_ID,
              slug: "official-prize",
              title: "Official prize",
              endDate: "2026-07-23",
              entryFrequency: "daily",
            },
          },
        ],
      },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "claim_seeker_reminder_scan_batch",
      { p_limit: 25 },
    );
  });

  it("fails closed on a database error", async () => {
    const supabase = client({ data: null, error: { message: "database unavailable" } });

    await expect(claimReminderScanBatch(supabase as never)).rejects.toBeInstanceOf(
      ReminderScanPersistenceError,
    );
  });

  it("rejects malformed or oversized candidate responses", async () => {
    const supabase = client({
      data: [
        {
          app_user_id: USER_ID,
          scan_token: "33333333-3333-4333-8333-333333333333",
          email: "seeker@example.com",
          display_name: null,
          ready_again: true,
          ends_today: true,
          ends_soon: true,
          email_enabled: true,
          has_more_candidates: false,
          next_cursor_end_date: null,
          next_cursor_listing_id: null,
          candidates: Array.from({ length: 13 }, () => ({})),
        },
      ],
      error: null,
    });

    await expect(claimReminderScanBatch(supabase as never)).rejects.toThrow(
      "invalid database response",
    );
  });
});

describe("completeReminderScan", () => {
  it("acknowledges the exact scan lease and continuation cursor", async () => {
    const supabase = client({ data: true, error: null });
    const user = {
      appUserId: USER_ID,
      scanToken: "33333333-3333-4333-8333-333333333333",
      email: "seeker@example.com",
      displayName: null,
      emailEnabled: true,
      prefs: { readyAgain: true, endsToday: true, endsSoon: true },
      hasMoreCandidates: true,
      nextCursorEndDate: "2026-07-23",
      nextCursorListingId: LISTING_ID,
      candidates: [],
    };

    await expect(
      completeReminderScan(supabase as never, user, {
        success: true,
        deferForDay: true,
      }),
    ).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("complete_seeker_reminder_scan", {
      p_app_user_id: USER_ID,
      p_scan_token: "33333333-3333-4333-8333-333333333333",
      p_success: true,
      p_defer_for_day: true,
      p_has_more_candidates: true,
      p_next_cursor_end_date: "2026-07-23",
      p_next_cursor_listing_id: LISTING_ID,
    });
  });

  it("fails closed on an RPC error or stale lease", async () => {
    const user = {
      appUserId: USER_ID,
      scanToken: "33333333-3333-4333-8333-333333333333",
      email: null,
      displayName: null,
      emailEnabled: true,
      prefs: { readyAgain: true, endsToday: true, endsSoon: true },
      hasMoreCandidates: false,
      nextCursorEndDate: null,
      nextCursorListingId: null,
      candidates: [],
    };

    await expect(
      completeReminderScan(
        client({ data: null, error: { message: "database unavailable" } }) as never,
        user,
        { success: false, deferForDay: false },
      ),
    ).rejects.toBeInstanceOf(ReminderScanPersistenceError);
    await expect(
      completeReminderScan(client({ data: false, error: null }) as never, user, {
        success: false,
        deferForDay: false,
      }),
    ).rejects.toThrow("compare-and-set");
  });
});

describe("findClaimedReminderEmailKeys", () => {
  it("uses the bounded service RPC and returns exact keys", async () => {
    const key = `ending_soon|${LISTING_ID}|2026-07-23`;
    const supabase = client({ data: [{ dedupe_key: key }], error: null });

    await expect(
      findClaimedReminderEmailKeys(supabase as never, USER_ID, [key]),
    ).resolves.toEqual(new Set([key]));
    expect(supabase.rpc).toHaveBeenCalledWith(
      "find_claimed_reminder_email_keys",
      { p_app_user_id: USER_ID, p_dedupe_keys: [key] },
    );
  });

  it("rejects empty, oversized, failed, and malformed lookups", async () => {
    await expect(
      findClaimedReminderEmailKeys(client({ data: [], error: null }) as never, USER_ID, []),
    ).rejects.toThrow("invalid dedupe key batch");
    await expect(
      findClaimedReminderEmailKeys(
        client({ data: [], error: null }) as never,
        USER_ID,
        Array.from({ length: 13 }, (_, index) => `key-${index}`),
      ),
    ).rejects.toThrow("invalid dedupe key batch");
    await expect(
      findClaimedReminderEmailKeys(
        client({ data: null, error: { message: "database unavailable" } }) as never,
        USER_ID,
        ["key"],
      ),
    ).rejects.toBeInstanceOf(ReminderScanPersistenceError);
    await expect(
      findClaimedReminderEmailKeys(
        client({ data: [{ wrong: "shape" }], error: null }) as never,
        USER_ID,
        ["key"],
      ),
    ).rejects.toThrow("invalid dedupe history response");
  });
});
