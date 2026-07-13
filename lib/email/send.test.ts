import { afterEach, describe, expect, it, vi } from "vitest";

const EMAIL_ARGS = {
  to: "recipient@example.com",
  subject: "Sweepza test",
  html: "<p>Test</p>",
};

async function sendAndReadPayload(): Promise<Record<string, unknown>> {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const { sendEmail } = await import("./send");
  await sendEmail(EMAIL_ARGS);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [, request] = fetchMock.mock.calls[0];
  return JSON.parse(request?.body as string) as Record<string, unknown>;
}

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses Sweepza sender and reply-to defaults", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-api-key");
    vi.stubEnv("RESEND_FROM", undefined);
    vi.stubEnv("RESEND_REPLY_TO", undefined);
    vi.stubEnv("SUPPORT_EMAIL", undefined);
    vi.stubEnv("RESEND_FROM_EMAIL", undefined);

    const payload = await sendAndReadPayload();

    expect(payload).toMatchObject({
      from: "Sweepza <notifications@sweepza.com>",
      reply_to: "support@sweepza.com",
      ...EMAIL_ARGS,
    });
  });

  it("prefers canonical sender and reply-to variables", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-api-key");
    vi.stubEnv("RESEND_FROM", "Sweepza Ops <ops@sweepza.com>");
    vi.stubEnv("RESEND_REPLY_TO", "replies@sweepza.com");
    vi.stubEnv(
      "RESEND_FROM_EMAIL",
      "Explore&Earn <notifications@exploreandearn.com>",
    );
    vi.stubEnv("SUPPORT_EMAIL", "legacy-support@example.com");

    const payload = await sendAndReadPayload();

    expect(payload).toMatchObject({
      from: "Sweepza Ops <ops@sweepza.com>",
      reply_to: "replies@sweepza.com",
    });
  });

  it("retains legacy sender and support-email fallbacks", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-api-key");
    vi.stubEnv("RESEND_FROM", "  ");
    vi.stubEnv("RESEND_REPLY_TO", "  ");
    vi.stubEnv("RESEND_FROM_EMAIL", "Sweepza Legacy <legacy@sweepza.com>");
    vi.stubEnv("SUPPORT_EMAIL", "help@sweepza.com");

    const payload = await sendAndReadPayload();

    expect(payload).toMatchObject({
      from: "Sweepza Legacy <legacy@sweepza.com>",
      reply_to: "help@sweepza.com",
    });
  });
});
