import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  APPROVED_STRIPE_ACCOUNT_IDS,
  getStripeKeyMode,
  inspectProvisioningPreflight,
  isReusableSweepzaPrice,
  isAllowedSecretOutputPath,
  isAllowedSweepzaWebhookUrl,
  isExpectedSupabaseProjectUrl,
  mergeRequiredWebhookEvents,
  releaseSecretOutput,
  reserveSecretOutput,
} from "../stripe-operator-safety.mjs";

const FILE_TEST_PATHS = [
  `/tmp/stripe-existing-${process.pid}`,
  `/tmp/stripe-symlink-${process.pid}`,
  `/tmp/stripe-created-${process.pid}`,
];

afterEach(() => {
  for (const path of FILE_TEST_PATHS) {
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("Stripe key classification", () => {
  it.each([
    ["sk_test_example", "test"],
    ["rk_test_example", "test"],
    ["sk_live_example", "live"],
    ["rk_live_example", "live"],
    ["pk_live_example", null],
    ["sk_live_", null],
    ["sk_live_example-extra", null],
    [undefined, null],
  ])("classifies %s as %s", (key, expected) => {
    expect(getStripeKeyMode(key)).toBe(expected);
  });
});

describe("provisioning preflight", () => {
  const safeTestInput = {
    key: "rk_test_example",
    expectedAccountId: APPROVED_STRIPE_ACCOUNT_IDS.test,
    webhookUrl: "https://sweepza.vercel.app/api/webhooks/stripe",
    secretOutputPath: "/tmp/stripe-whsec-test",
  };

  it("permits only the checked-in test account and exact webhook", () => {
    expect(inspectProvisioningPreflight(safeTestInput)).toEqual({
      ok: true,
      mode: "test",
      approvedAccountId: APPROVED_STRIPE_ACCOUNT_IDS.test,
      errors: [],
    });
  });

  it("rejects an account id from a cross-wired env bundle", () => {
    expect(
      inspectProvisioningPreflight({
        ...safeTestInput,
        expectedAccountId: "acct_ExploreAndEarn",
      }),
    ).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("checked-in test Sweepza account")],
    });
  });

  it.each(["sk_live_example", "rk_live_example"])(
    "refuses %s because no live account is approved",
    (key) => {
      expect(
        inspectProvisioningPreflight({
          key,
          expectedAccountId: "acct_UnapprovedLive",
          liveConfirmation: "acct_UnapprovedLive",
          webhookUrl: "https://sweepza.com/api/webhooks/stripe",
          secretOutputPath: "/tmp/stripe-whsec-live",
        }),
      ).toMatchObject({
        ok: false,
        mode: "live",
        approvedAccountId: null,
        errors: [expect.stringContaining("No live Stripe account is approved")],
      });
    },
  );

  it("requires an explicit webhook and secret output", () => {
    expect(
      inspectProvisioningPreflight({
        key: "sk_test_example",
        expectedAccountId: APPROVED_STRIPE_ACCOUNT_IDS.test,
      }),
    ).toMatchObject({
      ok: false,
      errors: [
        expect.stringContaining("--webhook-url"),
        expect.stringContaining("/tmp/stripe-"),
      ],
    });
  });

  it.each([
    "https://exploreandearn.com/api/webhooks/stripe",
    "https://sweepza.com/other",
    "https://sweepza.com/api/webhooks/stripe?venture=other",
    "http://sweepza.com/api/webhooks/stripe",
    "https://sweepza-evil.vercel.app/api/webhooks/stripe",
  ])("rejects unsafe webhook URL %s", (webhookUrl) => {
    expect(isAllowedSweepzaWebhookUrl(webhookUrl, "test")).toBe(false);
  });
});

describe("secret output boundary", () => {
  it.each([
    "/tmp/stripe-whsec",
    "/tmp/stripe-whsec.temporary",
    "/tmp/stripe-123",
  ])("accepts exact temporary file %s", (outputPath) => {
    expect(isAllowedSecretOutputPath(outputPath)).toBe(true);
  });

  it.each([
    "stripe-whsec",
    "/tmp/other-secret",
    "/tmp/subdir/stripe-whsec",
    "/home/user/stripe-whsec",
    "/tmp/stripe-../secret",
  ])("rejects unsafe path %s", (outputPath) => {
    expect(isAllowedSecretOutputPath(outputPath)).toBe(false);
  });

  it("creates a new mode-0600 file and removes an unused reservation", () => {
    const outputPath = FILE_TEST_PATHS[2];
    const fd = reserveSecretOutput(outputPath);

    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    releaseSecretOutput(fd, outputPath, { keepSecretOutput: false });
    expect(existsSync(outputPath)).toBe(false);
  });

  it("refuses an existing file", () => {
    const outputPath = FILE_TEST_PATHS[0];
    writeFileSync(outputPath, "do not overwrite", { mode: 0o600 });

    expect(() => reserveSecretOutput(outputPath)).toThrow();
    expect(statSync(outputPath).size).toBeGreaterThan(0);
  });

  it("refuses a symlink target", () => {
    const outputPath = FILE_TEST_PATHS[1];
    symlinkSync("/tmp", outputPath);

    expect(() => reserveSecretOutput(outputPath)).toThrow();
  });

  it("refuses a relative path before filesystem access", () => {
    expect(() => reserveSecretOutput("stripe-relative")).toThrow(
      "/tmp/stripe-* boundary",
    );
  });
});

describe("price reuse boundary", () => {
  const expected = { unitAmount: 1900, lookup: "sweepza_host_baseline" };
  const exactPrice = {
    active: true,
    currency: "usd",
    unit_amount: 1900,
    recurring: { interval: "month", interval_count: 1 },
    metadata: {
      venture: "sweepza",
      sweepza_key: "sweepza_host_baseline",
    },
  };

  it("reuses only an exact economic and metadata match", () => {
    expect(isReusableSweepzaPrice(exactPrice, expected)).toBe(true);
  });

  it.each([
    { currency: "eur" },
    { unit_amount: 500 },
    { recurring: { interval: "year", interval_count: 1 } },
    { recurring: { interval: "month", interval_count: 2 } },
    { metadata: { venture: "other", sweepza_key: "sweepza_host_baseline" } },
    { metadata: { venture: "sweepza", sweepza_key: "other" } },
  ])("rejects mismatch %o", (override) => {
    expect(isReusableSweepzaPrice({ ...exactPrice, ...override }, expected)).toBe(
      false,
    );
  });
});

describe("webhook event preservation", () => {
  it("adds required events without removing existing extras", () => {
    expect(
      mergeRequiredWebhookEvents(
        ["customer.created", "customer.subscription.created"],
        [
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
        ],
      ),
    ).toEqual([
      "customer.created",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]);
  });

  it("preserves wildcard subscriptions unchanged", () => {
    expect(
      mergeRequiredWebhookEvents(["*"], ["customer.subscription.created"]),
    ).toEqual(["*"]);
  });
});

describe("Supabase production binding", () => {
  it("accepts only the exact HTTPS project root", () => {
    expect(
      isExpectedSupabaseProjectUrl(
        "https://ojwhsntcpmoxnzisuomq.supabase.co",
        "ojwhsntcpmoxnzisuomq",
      ),
    ).toBe(true);
    expect(
      isExpectedSupabaseProjectUrl(
        "https://other.supabase.co",
        "ojwhsntcpmoxnzisuomq",
      ),
    ).toBe(false);
    expect(
      isExpectedSupabaseProjectUrl(
        "https://ojwhsntcpmoxnzisuomq.supabase.co.attacker.example",
        "ojwhsntcpmoxnzisuomq",
      ),
    ).toBe(false);
  });
});
