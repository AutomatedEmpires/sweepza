import { afterEach, describe, expect, it, vi } from "vitest";

const EMAIL_ARGS = {
  to: "recipient@example.com",
  subject: "Sweepza test",
  html: "<p>Test</p>",
};

const REPLAY_IDENTITIES = {
  from: "Sweepza Reminders <reminders@send.sweepza.com>",
  replyTo: "reminder-support@sweepza.com",
};

const IDEMPOTENT_EMAIL_ARGS = {
  ...EMAIL_ARGS,
  ...REPLAY_IDENTITIES,
  idempotencyKey: "reminder:user-1:2026-07-21",
};

function configureEnabledEmail() {
  vi.stubEnv("OUTBOUND_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "configured-api-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Sweepza <notifications@send.sweepza.com>");
  vi.stubEnv("RESEND_REPLY_TO_EMAIL", "replies@sweepza.com");
}

function resendSuccess(id = "email_123") {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([undefined, "", "false", "TRUE", "1"])(
    "skips before configuration or fetch when gate is %s",
    async (gateValue) => {
      vi.stubEnv("OUTBOUND_EMAIL_ENABLED", gateValue);
      vi.stubEnv("RESEND_API_KEY", "configured-api-key");
      vi.stubEnv("RESEND_FROM_EMAIL", "Sweepza <notifications@send.sweepza.com>");
      vi.stubEnv("RESEND_REPLY_TO_EMAIL", "replies@sweepza.com");
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);

      const { sendEmail } = await import("../send");
      await expect(sendEmail(EMAIL_ARGS)).resolves.toEqual({
        status: "skipped",
        reason: "outbound_email_disabled",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
    10_000,
  );

  it("fails closed when enabled without a complete configuration", async () => {
    vi.stubEnv("OUTBOUND_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", undefined);
    vi.stubEnv("RESEND_FROM_EMAIL", undefined);
    vi.stubEnv("RESEND_REPLY_TO_EMAIL", undefined);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).rejects.toThrow(
      "explicit Sweepza-owned From and Reply-To identities",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the activation gate ahead of idempotency validation", async () => {
    vi.stubEnv("OUTBOUND_EMAIL_ENABLED", "false");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(
      sendEmail({ ...EMAIL_ARGS, idempotencyKey: "unsafe\r\nheader" }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "outbound_email_disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Explore and Earn <notifications@exploreandearn.com>", "replies@sweepza.com"],
    ["Sweepza <notifications@send.sweepza.com>", "support@example.com"],
    [
      "Bad <bad@exploreandearn.com> <notifications@sweepza.com>",
      "replies@sweepza.com",
    ],
    [
      "Sweepza\r\nBcc: attacker@example.com <notifications@sweepza.com>",
      "replies@sweepza.com",
    ],
  ])("rejects a non-Sweepza identity", async (from, replyTo) => {
    configureEnabledEmail();
    vi.stubEnv("RESEND_FROM_EMAIL", from);
    vi.stubEnv("RESEND_REPLY_TO_EMAIL", replyTo);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).rejects.toThrow(
      "explicit Sweepza-owned From and Reply-To identities",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends with explicit Sweepza From and Reply-To configuration", async () => {
    configureEnabledEmail();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(resendSuccess());
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).resolves.toEqual({
      status: "sent",
      id: "email_123",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request?.body as string)).toEqual({
      from: "Sweepza <notifications@send.sweepza.com>",
      reply_to: "replies@sweepza.com",
      ...EMAIL_ARGS,
    });
    expect(new Headers(request?.headers).has("Idempotency-Key")).toBe(false);
  });

  it("sends a validated provider idempotency key and returns the Resend id", async () => {
    configureEnabledEmail();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(resendSuccess("email_idempotent_456"));
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).resolves.toEqual({
      status: "sent",
      id: "email_idempotent_456",
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(
      "reminder:user-1:2026-07-21",
    );
  });

  it("replays a byte-identical keyed body after live sender configuration drifts", async () => {
    configureEnabledEmail();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resendSuccess("email_first"))
      .mockResolvedValueOnce(resendSuccess("email_replayed"));
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail: firstSend } = await import("../send");
    await firstSend(IDEMPOTENT_EMAIL_ARGS);

    vi.stubEnv(
      "RESEND_FROM_EMAIL",
      "Sweepza Changed <changed@send.sweepza.com>",
    );
    vi.stubEnv("RESEND_REPLY_TO_EMAIL", "changed-replies@sweepza.com");
    vi.resetModules();

    const { sendEmail: replaySend } = await import("../send");
    await replaySend(IDEMPOTENT_EMAIL_ARGS);

    const firstBody = fetchMock.mock.calls[0][1]?.body;
    const replayBody = fetchMock.mock.calls[1][1]?.body;
    expect(replayBody).toBe(firstBody);
    expect(firstBody).toBe(
      JSON.stringify({
        from: REPLAY_IDENTITIES.from,
        reply_to: REPLAY_IDENTITIES.replyTo,
        ...EMAIL_ARGS,
      }),
    );
  });

  it("uses exact validated sender overrides for durable-delivery replay", async () => {
    configureEnabledEmail();
    vi.stubEnv("RESEND_FROM_EMAIL", undefined);
    vi.stubEnv("RESEND_REPLY_TO_EMAIL", undefined);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(resendSuccess());
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await sendEmail({
      ...EMAIL_ARGS,
      ...REPLAY_IDENTITIES,
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request?.body as string)).toEqual({
      from: "Sweepza Reminders <reminders@send.sweepza.com>",
      reply_to: "reminder-support@sweepza.com",
      ...EMAIL_ARGS,
    });
  });

  it.each([
    { from: "Sweepza <notifications@sweepza.com>" },
    { replyTo: "replies@sweepza.com" },
    {
      from: "Explore and Earn <notifications@exploreandearn.com>",
      replyTo: "replies@sweepza.com",
    },
    {
      from: "Sweepza <notifications@sweepza.com>",
      replyTo: "support@example.com",
    },
    {
      from: "Sweepza\r\nBcc: attacker@example.com <notifications@sweepza.com>",
      replyTo: "replies@sweepza.com",
    },
  ])(
    "rejects partial or unsafe sender overrides before fetch",
    async (overrides) => {
      configureEnabledEmail();
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);

      const { sendEmail } = await import("../send");
      await expect(
        sendEmail({ ...EMAIL_ARGS, ...overrides }),
      ).rejects.toMatchObject({
        name: "EmailSendError",
        kind: "invalid_sender_override",
        retryable: false,
        status: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("requires captured sender identities for an idempotent send", async () => {
    configureEnabledEmail();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(
      sendEmail({ ...EMAIL_ARGS, idempotencyKey: "delivery-key" }),
    ).rejects.toMatchObject({
      name: "EmailSendError",
      kind: "invalid_sender_override",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a live API key even when replaying stored sender identities", async () => {
    vi.stubEnv("OUTBOUND_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", undefined);
    vi.stubEnv("RESEND_FROM_EMAIL", undefined);
    vi.stubEnv("RESEND_REPLY_TO_EMAIL", undefined);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(
      sendEmail({
        ...EMAIL_ARGS,
        from: "Sweepza <notifications@sweepza.com>",
        replyTo: "replies@sweepza.com",
      }),
    ).rejects.toThrow("Outbound email requires a Resend API key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "x".repeat(257),
    "line\rbreak",
    "line\nbreak",
    "tab\tkey",
    "nul\0key",
    " leading-space",
    "trailing-space ",
    "unicode-caf\u00e9",
    "delete\u007fkey",
  ])(
    "rejects an invalid idempotency key before fetch",
    async (idempotencyKey) => {
      configureEnabledEmail();
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);

      const { sendEmail } = await import("../send");
      await expect(
        sendEmail({ ...EMAIL_ARGS, idempotencyKey }),
      ).rejects.toMatchObject({
        name: "EmailSendError",
        kind: "invalid_idempotency_key",
        retryable: false,
        status: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("accepts a 256-character idempotency key", async () => {
    configureEnabledEmail();
    const idempotencyKey = "x".repeat(256);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(resendSuccess());
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(
      sendEmail({ ...EMAIL_ARGS, ...REPLAY_IDENTITIES, idempotencyKey }),
    ).resolves.toMatchObject({ status: "sent" });
    const [, request] = fetchMock.mock.calls[0];
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(
      idempotencyKey,
    );
  });

  it("does not disclose a provider response body or delivery payload", async () => {
    configureEnabledEmail();
    const sensitiveProviderBody = JSON.stringify({
      name: "validation_error",
      message: `Rejected recipient ${EMAIL_ARGS.to}: ${EMAIL_ARGS.html}`,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(sensitiveProviderBody, { status: 403 }),
      ),
    );

    const { sendEmail } = await import("../send");
    try {
      await sendEmail(EMAIL_ARGS);
      expect.fail("sendEmail should have rejected");
    } catch (error) {
      expect(error).toMatchObject({
        message: "Resend email failed with status 403 (validation_error).",
        kind: "provider_http",
        status: 403,
        providerCode: "validation_error",
      });
      const enumerableValues = Object.values(error as Record<string, unknown>)
        .map(String)
        .join(" ");
      expect(enumerableValues).not.toContain(EMAIL_ARGS.to);
      expect(enumerableValues).not.toContain(EMAIL_ARGS.html);
      expect(error).not.toHaveProperty("responseBody");
      expect((error as Error).message).not.toContain("Rejected recipient");
    }
  });

  it("does not expose an unsafe provider error name", async () => {
    configureEnabledEmail();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({ name: `validation_error_${EMAIL_ARGS.to}` }),
          { status: 403 },
        ),
      ),
    );

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).rejects.toMatchObject({
      message: "Resend email failed with status 403.",
      kind: "provider_http",
      status: 403,
      providerCode: null,
    });
  });

  it.each([
    [408, "request_timeout"],
    [429, "rate_limit_exceeded"],
    [500, "application_error"],
    [503, "service_unavailable"],
  ])(
    "makes provider status %i retryable only for a keyed request",
    async (status, name) => {
      configureEnabledEmail();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ name, message: "try later" }), {
            status,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ name, message: "try later" }), {
            status,
          }),
        );
      vi.stubGlobal("fetch", fetchMock);

      const { sendEmail } = await import("../send");
      await expect(sendEmail(EMAIL_ARGS)).rejects.toMatchObject({
        name: "EmailSendError",
        kind: "provider_http",
        retryable: false,
        status,
        providerCode: name,
      });
      await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).rejects.toMatchObject({
        name: "EmailSendError",
        kind: "provider_http",
        retryable: true,
        status,
        providerCode: name,
      });
    },
  );

  it("distinguishes keyed concurrency from unkeyed and conflicting requests", async () => {
    configureEnabledEmail();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: "concurrent_idempotent_requests" }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: "concurrent_idempotent_requests" }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: "invalid_idempotent_request" }), {
          status: 409,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).rejects.toMatchObject({
      kind: "provider_http",
      retryable: false,
      status: 409,
      providerCode: "concurrent_idempotent_requests",
    });
    await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).rejects.toMatchObject({
      kind: "provider_http",
      retryable: true,
      status: 409,
      providerCode: "concurrent_idempotent_requests",
    });
    await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).rejects.toMatchObject({
      kind: "provider_http",
      retryable: false,
      status: 409,
      providerCode: "invalid_idempotent_request",
    });
  });

  it.each([
    ["not-json", null],
    [JSON.stringify({ name: "future_409_code" }), null],
  ])(
    "keeps an ambiguous keyed 409 retryable without exposing its body",
    async (body, providerCode) => {
      configureEnabledEmail();
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 409 })),
      );

      const { sendEmail } = await import("../send");
      await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).rejects.toMatchObject({
        kind: "provider_http",
        retryable: true,
        status: 409,
        providerCode,
      });
    },
  );

  it.each([400, 401, 403, 404, 422, 451])(
    "classifies permanent provider status %i as non-retryable",
    async (status) => {
      configureEnabledEmail();
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify({ name: "validation_error" }), { status }),
        ),
      );

      const { sendEmail } = await import("../send");
      await expect(sendEmail(EMAIL_ARGS)).rejects.toMatchObject({
        kind: "provider_http",
        retryable: false,
        status,
      });
    },
  );

  it("makes an ambiguous network failure retryable only when keyed", async () => {
    configureEnabledEmail();
    const cause = new TypeError("fetch failed");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(cause));

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).rejects.toMatchObject({
      name: "EmailSendError",
      kind: "network",
      retryable: false,
      status: null,
    });
    await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).rejects.toMatchObject({
      name: "EmailSendError",
      kind: "network",
      retryable: true,
      status: null,
    });
  });

  it("passes a sub-minute timeout signal and classifies timeout by replay safety", async () => {
    configureEnabledEmail();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("request deadline exceeded", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { RESEND_TIMEOUT_MS, sendEmail } = await import("../send");
    expect(RESEND_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RESEND_TIMEOUT_MS).toBeLessThan(60_000);

    await expect(sendEmail(EMAIL_ARGS)).rejects.toMatchObject({
      kind: "timeout",
      retryable: false,
      status: null,
    });
    await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).rejects.toMatchObject({
      kind: "timeout",
      retryable: true,
      status: null,
    });
    expect(timeoutSpy).toHaveBeenCalledTimes(2);
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, RESEND_TIMEOUT_MS);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, RESEND_TIMEOUT_MS);
  });

  it("makes an unreadable success response retryable only when keyed", async () => {
    configureEnabledEmail();
    const unreadableResponse = () =>
      ({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValue(new TypeError("stream interrupted")),
      }) as unknown as Response;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unreadableResponse())
      .mockResolvedValueOnce(unreadableResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).rejects.toMatchObject({
      kind: "network",
      retryable: false,
      status: 200,
    });
    await expect(sendEmail(IDEMPOTENT_EMAIL_ARGS)).rejects.toMatchObject({
      kind: "network",
      retryable: true,
      status: 200,
    });
  });

  it.each([
    [undefined, false],
    ["delivery-key", true],
  ] as const)(
    "classifies a malformed success response according to replay safety",
    async (idempotencyKey, retryable) => {
      configureEnabledEmail();
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ),
      );

      const { sendEmail } = await import("../send");
      const args = idempotencyKey
        ? { ...EMAIL_ARGS, ...REPLAY_IDENTITIES, idempotencyKey }
        : EMAIL_ARGS;
      await expect(
        sendEmail(args),
      ).rejects.toMatchObject({
        kind: "invalid_provider_response",
        retryable,
        status: 200,
      });
    },
  );
});
