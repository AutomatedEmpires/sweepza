import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: false,
  configured: true,
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/email/outbound-gate", () => ({
  isOutboundEmailEnabled: () => mocks.enabled,
  isOutboundEmailConfigured: () => mocks.configured,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { GET } from "@/app/api/cron/seeker-reminders/route";

function request(authorization?: string): Request {
  return new Request("https://sweepza.com/api/cron/seeker-reminders", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("seeker reminder email gate", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    mocks.enabled = false;
    mocks.configured = true;
    mocks.createServiceRoleClient.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates before revealing the disabled state", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns a successful no-op before database access when disabled", async () => {
    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      enabled: false,
      configured: true,
      reason: "outbound_email_disabled",
      candidates: 0,
      emailed: 0,
      reminders: 0,
      failed: 0,
    });
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails before database access when enabled but incomplete", async () => {
    mocks.enabled = true;
    mocks.configured = false;

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      enabled: true,
      configured: false,
    });
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });
});
