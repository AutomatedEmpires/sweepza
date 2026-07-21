import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  purgeExpiredEmailDeliveries: vi.fn(),
  claimDueEmailDeliveries: vi.fn(),
  deliverClaimedEmail: vi.fn(),
  suppressEmailDelivery: vi.fn(),
}));

vi.mock("@/lib/email/delivery-outbox", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/email/delivery-outbox")>();
  return {
    ...actual,
    purgeExpiredEmailDeliveries: mocks.purgeExpiredEmailDeliveries,
    claimDueEmailDeliveries: mocks.claimDueEmailDeliveries,
    deliverClaimedEmail: mocks.deliverClaimedEmail,
    suppressEmailDelivery: mocks.suppressEmailDelivery,
  };
});

import {
  EmailDeliveryPersistenceError,
  type ClaimedEmailDelivery,
} from "@/lib/email/delivery-outbox";
import { processDueEmailDeliveries } from "@/lib/email/delivery-worker";
import { EmailSendError } from "@/lib/email/send";
import { nextEntryAt } from "@/lib/sweep-routine";

const NOW = new Date("2026-07-21T20:00:00.000Z");
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "55555555-5555-4555-8555-555555555555";
const SECOND_LISTING_ID = "66666666-6666-4666-8666-666666666666";
const END_DATE = "2026-07-23";

const state = {
  app_user_id: USER_ID,
  listing_id: LISTING_ID,
  saved_at: "2026-07-18T12:00:00.000Z",
  entered_at: null as string | null,
  skipped_at: null as string | null,
  won_at: null as string | null,
  listing: {
    id: LISTING_ID,
    slug: "verified-prize",
    title: "Verified prize",
    end_date: END_DATE,
    entry_frequency: "daily" as const,
  },
};

function reminderEvent({
  type = "ending_soon",
  listingId = LISTING_ID,
  slug = state.listing.slug,
  title = state.listing.title,
  endDate = state.listing.end_date,
  entryFrequency = state.listing.entry_frequency,
  reminderKey = END_DATE,
}: {
  type?: "ready_again" | "ends_today" | "ending_soon";
  listingId?: string;
  slug?: string;
  title?: string;
  endDate?: string;
  entryFrequency?: "one_time" | "daily" | "weekly" | "monthly" | "instant_win" | "other";
  reminderKey?: string;
} = {}) {
  return {
    type,
    dedupe_key: `${type}|${listingId}|${reminderKey}`,
    metadata: {
      listingId,
      slug,
      reminderKey,
      title,
      endDate,
      entryFrequency,
    },
  };
}

const delivery: ClaimedEmailDelivery = {
  deliveryId: "11111111-1111-4111-8111-111111111111",
  appUserId: USER_ID,
  notificationType: "seeker_reminder_digest",
  idempotencyKey: "sweepza/reminder/delivery-1",
  recipient: "seeker@example.com",
  sender: "Sweepza <reminders@send.sweepza.com>",
  replyTo: "support@sweepza.com",
  subject: "Your reminders",
  html: "<p>Reminder</p>",
  metadata: { events: [reminderEvent()] },
  leaseToken: "33333333-3333-4333-8333-333333333333",
  attemptCount: 1,
  sendBefore: "2026-07-22T00:00:00.000Z",
};

const user = { id: USER_ID, email: delivery.recipient };
const enabledPrefs = {
  app_user_id: USER_ID,
  email_enabled: true,
  ready_again: true,
  ends_today: true,
  ends_soon: true,
};

type LookupResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

function query(result: LookupResult) {
  const chain = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    returns: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.returns.mockResolvedValue(result);
  return chain;
}

function makeSupabase({
  users = { data: [user], error: null },
  prefs = { data: [enabledPrefs], error: null },
  states = { data: [state], error: null },
}: {
  users?: LookupResult;
  prefs?: LookupResult;
  states?: LookupResult;
} = {}) {
  const queries = {
    app_user: query(users),
    notification_pref: query(prefs),
    listing_seeker_state: query(states),
  };
  const from = vi.fn((table: string) => {
    if (table === "app_user") return queries.app_user;
    if (table === "notification_pref") return queries.notification_pref;
    if (table === "listing_seeker_state") return queries.listing_seeker_state;
    throw new Error(`Unexpected table ${table}`);
  });

  return { client: { from } as never, from, queries };
}

describe("processDueEmailDeliveries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.purgeExpiredEmailDeliveries.mockReset();
    mocks.claimDueEmailDeliveries.mockReset();
    mocks.deliverClaimedEmail.mockReset();
    mocks.suppressEmailDelivery.mockReset();
    mocks.claimDueEmailDeliveries.mockResolvedValue([delivery]);
    mocks.purgeExpiredEmailDeliveries.mockResolvedValue({
      suppressed: 0,
      payloadExpired: 0,
      providerWindowExpired: 0,
      notificationLogsUpdated: 0,
    });
    mocks.suppressEmailDelivery.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces bounded payload purges even when no retry is due", async () => {
    mocks.purgeExpiredEmailDeliveries.mockResolvedValue({
      suppressed: 3,
      payloadExpired: 2,
      providerWindowExpired: 1,
      notificationLogsUpdated: 4,
    });
    mocks.claimDueEmailDeliveries.mockResolvedValue([]);
    const { client } = makeSupabase();

    await expect(processDueEmailDeliveries(client)).resolves.toEqual({
      expiredSuppressed: 3,
      payloadExpired: 2,
      providerWindowExpired: 1,
      claimed: 0,
      sent: 0,
      deferred: 0,
      skipped: 0,
      failed: 0,
      retryScheduled: 0,
      recoveryPending: 0,
      failureDetails: [],
    });
    expect(mocks.purgeExpiredEmailDeliveries).toHaveBeenCalledWith(client, 50);
  });

  it("bounds one invocation to one provider wave of five", async () => {
    vi.useRealTimers();
    let active = 0;
    let maximumActive = 0;
    const deliveries = Array.from({ length: 5 }, (_, index) => ({
      ...delivery,
      deliveryId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      idempotencyKey: `sweepza/reminder/concurrency-${index}`,
    }));
    mocks.claimDueEmailDeliveries.mockResolvedValue(deliveries);
    mocks.deliverClaimedEmail.mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { status: "sent", providerMessageId: "email" };
    });
    const { client } = makeSupabase();

    const summary = await processDueEmailDeliveries(client);

    expect(summary).toMatchObject({ claimed: 5, sent: 5, failed: 0 });
    expect(mocks.claimDueEmailDeliveries).toHaveBeenCalledWith(client, 5);
    expect(maximumActive).toBe(5);
  });

  it.each([
    {
      label: "recipient",
      users: { data: null, error: { message: "recipient lookup unavailable" } },
      prefs: { data: [enabledPrefs], error: null },
      states: { data: [state], error: null },
      operation: "retry recipient lookup",
    },
    {
      label: "preference",
      users: { data: [user], error: null },
      prefs: { data: null, error: { message: "preference lookup unavailable" } },
      states: { data: [state], error: null },
      operation: "retry preference lookup",
    },
    {
      label: "reminder state",
      users: { data: [user], error: null },
      prefs: { data: [enabledPrefs], error: null },
      states: { data: null, error: { message: "state lookup unavailable" } },
      operation: "retry reminder state lookup",
    },
  ])(
    "fails closed when the $label lookup fails before transport",
    async ({ users, prefs, states, operation }) => {
      const { client } = makeSupabase({ users, prefs, states });

      const result = processDueEmailDeliveries(client);

      await expect(result).rejects.toMatchObject({
        name: "EmailDeliveryPersistenceError",
        operation,
      });
      expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
      expect(mocks.suppressEmailDelivery).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      label: "missing",
      users: { data: [], error: null },
      reason: "recipient_unavailable",
    },
    {
      label: "changed",
      users: {
        data: [{ id: USER_ID, email: "new-address@example.com" }],
        error: null,
      },
      reason: "recipient_changed",
    },
  ])(
    "suppresses a delivery whose recipient is $label",
    async ({ users, reason }) => {
      const { client } = makeSupabase({ users });

      await expect(processDueEmailDeliveries(client)).resolves.toEqual({
        expiredSuppressed: 0,
        payloadExpired: 0,
        providerWindowExpired: 0,
        claimed: 1,
        sent: 0,
        deferred: 0,
        skipped: 1,
        failed: 0,
        retryScheduled: 0,
        recoveryPending: 0,
        failureDetails: [],
      });
      expect(mocks.suppressEmailDelivery).toHaveBeenCalledWith(
        client,
        delivery,
        reason,
      );
      expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["ready_again", "ready_again"],
    ["ends_today", "ends_today"],
    ["ending_soon", "ends_soon"],
  ] as const)(
    "suppresses a %s reminder when its current preference is disabled",
    async (eventType, prefKey) => {
      const optedOutPrefs = { ...enabledPrefs, [prefKey]: false };
      const optedOutDelivery = {
        ...delivery,
        metadata: { events: [reminderEvent({ type: eventType })] },
      };
      mocks.claimDueEmailDeliveries.mockResolvedValue([optedOutDelivery]);
      const { client } = makeSupabase({
        prefs: { data: [optedOutPrefs], error: null },
      });

      await expect(processDueEmailDeliveries(client)).resolves.toMatchObject({
        claimed: 1,
        skipped: 1,
        sent: 0,
        failureDetails: [],
      });
      expect(mocks.suppressEmailDelivery).toHaveBeenCalledWith(
        client,
        optedOutDelivery,
        "notification_preference_changed",
      );
      expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
    },
  );

  it("sends an exactly current due delivery after recipient, preference, and state checks", async () => {
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "sent",
      providerMessageId: "email_123",
    });
    const { client, queries } = makeSupabase();

    await expect(processDueEmailDeliveries(client, 7)).resolves.toEqual({
      expiredSuppressed: 0,
      payloadExpired: 0,
      providerWindowExpired: 0,
      claimed: 1,
      sent: 1,
      deferred: 0,
      skipped: 0,
      failed: 0,
      retryScheduled: 0,
      recoveryPending: 0,
      failureDetails: [],
    });
    expect(mocks.claimDueEmailDeliveries).toHaveBeenCalledWith(client, 5);
    expect(queries.listing_seeker_state.in).toHaveBeenCalledWith(
      "app_user_id",
      [USER_ID],
    );
    expect(queries.listing_seeker_state.in).toHaveBeenCalledWith(
      "listing_id",
      [LISTING_ID],
    );
    expect(queries.listing_seeker_state.eq).toHaveBeenCalledWith(
      "listing.lifecycle_status",
      "active",
    );
    expect(queries.listing_seeker_state.eq).toHaveBeenCalledWith(
      "listing.visibility_status",
      "public",
    );
    expect(mocks.deliverClaimedEmail).toHaveBeenCalledWith(client, delivery);
    expect(mocks.suppressEmailDelivery).not.toHaveBeenCalled();
  });

  it("counts a provider-window deferral as scheduled work, not a failure", async () => {
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "deferred",
      reason: "provider_rate_window_full",
    });
    const { client } = makeSupabase();

    await expect(processDueEmailDeliveries(client)).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      deferred: 1,
      skipped: 0,
      failed: 0,
      retryScheduled: 1,
      recoveryPending: 0,
      failureDetails: [],
    });
  });

  it.each([
    ["tracker or active/public listing is missing", []],
    ["the seeker skipped it", [{ ...state, skipped_at: "2026-07-21T18:00:00Z" }]],
    ["the seeker already won", [{ ...state, won_at: "2026-07-21T18:00:00Z" }]],
    [
      "the slug changed",
      [{ ...state, listing: { ...state.listing, slug: "corrected-prize" } }],
    ],
    [
      "the title changed",
      [{ ...state, listing: { ...state.listing, title: "Corrected prize" } }],
    ],
    [
      "the end date changed",
      [{ ...state, listing: { ...state.listing, end_date: "2026-07-24" } }],
    ],
    [
      "the entry frequency changed",
      [{ ...state, listing: { ...state.listing, entry_frequency: "weekly" } }],
    ],
  ])("suppresses the frozen digest when $label", async (_label, states) => {
    const { client } = makeSupabase({ states: { data: states, error: null } });

    await expect(processDueEmailDeliveries(client)).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      skipped: 1,
      failed: 0,
      failureDetails: [],
    });
    expect(mocks.suppressEmailDelivery).toHaveBeenCalledWith(
      client,
      delivery,
      "reminder_no_longer_current",
    );
    expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
  });

  it("suppresses a ready-again reminder after the seeker enters again", async () => {
    const originalEnteredAt = "2026-07-19T18:00:00.000Z";
    const reopen = nextEntryAt(originalEnteredAt, "daily");
    expect(reopen).not.toBeNull();
    const reminderKey = reopen!.toISOString().slice(0, 10);
    const readyState = {
      ...state,
      saved_at: null,
      entered_at: "2026-07-21T18:00:00.000Z",
      listing: { ...state.listing, end_date: "2026-08-10" },
    };
    const readyDelivery = {
      ...delivery,
      metadata: {
        events: [
          reminderEvent({
            type: "ready_again",
            reminderKey,
            endDate: "2026-08-10",
          }),
        ],
      },
    };
    mocks.claimDueEmailDeliveries.mockResolvedValue([readyDelivery]);
    const { client } = makeSupabase({
      states: { data: [readyState], error: null },
    });

    await processDueEmailDeliveries(client);

    expect(mocks.suppressEmailDelivery).toHaveBeenCalledWith(
      client,
      readyDelivery,
      "reminder_no_longer_current",
    );
    expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
  });

  it("suppresses the whole frozen digest when any event is no longer current", async () => {
    const multiEventDelivery = {
      ...delivery,
      metadata: {
        events: [
          reminderEvent(),
          reminderEvent({ listingId: SECOND_LISTING_ID, slug: "missing-prize" }),
        ],
      },
    };
    mocks.claimDueEmailDeliveries.mockResolvedValue([multiEventDelivery]);
    const { client } = makeSupabase();

    await processDueEmailDeliveries(client);

    expect(mocks.suppressEmailDelivery).toHaveBeenCalledWith(
      client,
      multiEventDelivery,
      "reminder_no_longer_current",
    );
    expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
  });

  it("counts provider failures with sanitized details only", async () => {
    const secondDelivery = {
      ...delivery,
      deliveryId: "44444444-4444-4444-8444-444444444444",
      idempotencyKey: "sweepza/reminder/delivery-2",
    };
    mocks.claimDueEmailDeliveries.mockResolvedValue([delivery, secondDelivery]);
    mocks.deliverClaimedEmail
      .mockResolvedValueOnce({
        status: "failed",
        retryScheduled: true,
        nextAttemptAt: "2026-07-21T21:30:00.000Z",
        error: new EmailSendError("sensitive provider response", {
          kind: "provider_http",
          retryable: true,
          status: 503,
          providerCode: "service_unavailable",
        }),
      })
      .mockResolvedValueOnce({
        status: "failed",
        retryScheduled: false,
        nextAttemptAt: null,
        error: new Error("permanent provider failure with private text"),
      });
    const { client } = makeSupabase();

    const summary = await processDueEmailDeliveries(client);

    expect(summary).toEqual({
      expiredSuppressed: 0,
      payloadExpired: 0,
      providerWindowExpired: 0,
      claimed: 2,
      sent: 0,
      deferred: 0,
      skipped: 0,
      failed: 2,
      retryScheduled: 1,
      recoveryPending: 0,
      failureDetails: [
        {
          deliveryId: delivery.deliveryId,
          code: "transport_service_unavailable",
          retryScheduled: true,
          recoveryPending: false,
        },
        {
          deliveryId: secondDelivery.deliveryId,
          code: "unexpected_delivery_failure",
          retryScheduled: false,
          recoveryPending: false,
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("seeker@example.com");
    expect(JSON.stringify(summary)).not.toContain("sensitive provider response");
    expect(JSON.stringify(summary)).not.toContain("private text");
  });

  it("continues to later leases when the first delivery throws", async () => {
    const secondDelivery = {
      ...delivery,
      deliveryId: "44444444-4444-4444-8444-444444444444",
      idempotencyKey: "sweepza/reminder/delivery-2",
    };
    mocks.claimDueEmailDeliveries.mockResolvedValue([delivery, secondDelivery]);
    mocks.deliverClaimedEmail
      .mockRejectedValueOnce(
        new EmailDeliveryPersistenceError("completion", "sensitive database detail"),
      )
      .mockResolvedValueOnce({ status: "sent", providerMessageId: "email_2" });
    const { client } = makeSupabase();

    const summary = await processDueEmailDeliveries(client);

    expect(summary).toEqual({
      expiredSuppressed: 0,
      payloadExpired: 0,
      providerWindowExpired: 0,
      claimed: 2,
      sent: 1,
      deferred: 0,
      skipped: 0,
      failed: 1,
      retryScheduled: 0,
      recoveryPending: 1,
      failureDetails: [
        {
          deliveryId: delivery.deliveryId,
          code: "persistence_completion",
          retryScheduled: false,
          recoveryPending: true,
        },
      ],
    });
    expect(mocks.deliverClaimedEmail).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(summary)).not.toContain("sensitive database detail");
  });

  it("continues after suppression persistence fails", async () => {
    const malformedDelivery = {
      ...delivery,
      deliveryId: "77777777-7777-4777-8777-777777777777",
      metadata: {},
    };
    mocks.claimDueEmailDeliveries.mockResolvedValue([malformedDelivery, delivery]);
    mocks.suppressEmailDelivery.mockRejectedValueOnce(
      new EmailDeliveryPersistenceError("suppression", "private database detail"),
    );
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "sent",
      providerMessageId: "email_2",
    });
    const { client } = makeSupabase();

    const summary = await processDueEmailDeliveries(client);

    expect(summary).toMatchObject({
      claimed: 2,
      sent: 1,
      skipped: 0,
      failed: 1,
      recoveryPending: 1,
    });
    expect(summary.failureDetails).toEqual([
      {
        deliveryId: malformedDelivery.deliveryId,
        code: "persistence_suppression",
        retryScheduled: false,
        recoveryPending: true,
      },
    ]);
    expect(mocks.deliverClaimedEmail).toHaveBeenCalledWith(client, delivery);
  });

  it("keeps an ends_today delivery current on the shared UTC calendar", async () => {
    const today = "2026-07-21";
    const todayState = {
      ...state,
      listing: { ...state.listing, end_date: today },
    };
    const todayDelivery = {
      ...delivery,
      metadata: {
        events: [
          reminderEvent({
            type: "ends_today",
            endDate: today,
            reminderKey: today,
          }),
        ],
      },
    };
    mocks.claimDueEmailDeliveries.mockResolvedValue([todayDelivery]);
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "sent",
      providerMessageId: "email_today",
    });
    const { client } = makeSupabase({
      states: { data: [todayState], error: null },
    });

    await expect(processDueEmailDeliveries(client)).resolves.toMatchObject({
      claimed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mocks.suppressEmailDelivery).not.toHaveBeenCalled();
    expect(mocks.deliverClaimedEmail).toHaveBeenCalledWith(client, todayDelivery);
  });

  it.each([
    ["missing events", {}],
    ["empty events", { events: [] }],
    ["unknown event", { events: [{ type: "weekly_digest" }] }],
    [
      "missing dedupe key",
      { events: [{ type: "ending_soon", metadata: reminderEvent().metadata }] },
    ],
    [
      "missing listing snapshot",
      { events: [{ type: "ending_soon", dedupe_key: "key", metadata: {} }] },
    ],
  ])("suppresses malformed metadata with %s", async (_label, metadata) => {
    const malformedDelivery = { ...delivery, metadata };
    mocks.claimDueEmailDeliveries.mockResolvedValue([malformedDelivery]);
    const { client, from } = makeSupabase();

    await expect(processDueEmailDeliveries(client)).resolves.toMatchObject({
      claimed: 1,
      skipped: 0,
      sent: 0,
      failed: 1,
      recoveryPending: 0,
      failureDetails: [
        {
          deliveryId: malformedDelivery.deliveryId,
          code: "integrity_invalid_delivery_metadata",
          retryScheduled: false,
          recoveryPending: false,
        },
      ],
    });
    expect(from).not.toHaveBeenCalledWith("listing_seeker_state");
    expect(mocks.suppressEmailDelivery).toHaveBeenCalledWith(
      client,
      malformedDelivery,
      "invalid_delivery_metadata",
    );
    expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
  });

  it("suppresses and reports an unsupported durable delivery type", async () => {
    const unsupportedDelivery = {
      ...delivery,
      notificationType: "unsupported_digest",
    };
    mocks.claimDueEmailDeliveries.mockResolvedValue([unsupportedDelivery]);
    const { client } = makeSupabase();

    await expect(processDueEmailDeliveries(client)).resolves.toMatchObject({
      claimed: 1,
      skipped: 0,
      failed: 1,
      failureDetails: [
        {
          deliveryId: unsupportedDelivery.deliveryId,
          code: "integrity_unsupported_delivery_type",
          retryScheduled: false,
          recoveryPending: false,
        },
      ],
    });
    expect(mocks.suppressEmailDelivery).toHaveBeenCalledWith(
      client,
      unsupportedDelivery,
      "unsupported_delivery_type",
    );
    expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
  });
});
