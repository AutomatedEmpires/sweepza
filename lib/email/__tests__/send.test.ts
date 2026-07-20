import { afterEach, describe, expect, it, vi } from "vitest";

const EMAIL_ARGS = {
  to: "recipient@example.com",
  subject: "Sweepza test",
  html: "<p>Test</p>",
};

function configureEnabledEmail() {
  vi.stubEnv("OUTBOUND_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "configured-api-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Sweepza <notifications@send.sweepza.com>");
  vi.stubEnv("RESEND_REPLY_TO_EMAIL", "replies@sweepza.com");
}

describe("sendEmail", () => {
  afterEach(() => {
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

  it.each([
    ["Explore and Earn <notifications@exploreandearn.com>", "replies@sweepza.com"],
    ["Sweepza <notifications@send.sweepza.com>", "support@example.com"],
    [
      "Bad <bad@exploreandearn.com> <notifications@sweepza.com>",
      "replies@sweepza.com",
    ],
    ["Sweepza\r\nBcc: attacker@example.com <notifications@sweepza.com>", "replies@sweepza.com"],
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
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).resolves.toEqual({ status: "sent" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request?.body as string)).toEqual({
      from: "Sweepza <notifications@send.sweepza.com>",
      reply_to: "replies@sweepza.com",
      ...EMAIL_ARGS,
    });
  });

  it("throws on provider rejection", async () => {
    configureEnabledEmail();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("sender is not verified", { status: 403 }),
      ),
    );

    const { sendEmail } = await import("../send");
    await expect(sendEmail(EMAIL_ARGS)).rejects.toThrow(
      "Resend email failed with status 403: sender is not verified",
    );
  });
});
