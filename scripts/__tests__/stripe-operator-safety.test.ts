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
  getSweepzaMetadataState,
  getStripeKeyMode,
  hasRequiredWebhookEvents,
  inspectProvisioningPreflight,
  isReusableSweepzaPrice,
  isAllowedSecretOutputPath,
  isAllowedSweepzaWebhookUrl,
  isExpectedSupabaseProjectUrl,
  isOwnedSweepzaAccountWebhook,
  mergeRequiredWebhookEvents,
  releaseSecretOutput,
  reserveSecretOutput,
  selectSweepzaPriceCandidate,
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
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
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
    {
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "metered",
      },
    },
    { metadata: { venture: "other", sweepza_key: "sweepza_host_baseline" } },
    { metadata: { venture: "sweepza", sweepza_key: "other" } },
  ])("rejects mismatch %o", (override) => {
    expect(isReusableSweepzaPrice({ ...exactPrice, ...override }, expected)).toBe(
      false,
    );
  });

  it("classifies only unclaimed keyed metadata as safely upgradeable legacy data", () => {
    expect(
      getSweepzaMetadataState(
        { sweepza_key: "sweepza_host_baseline" },
        "sweepza_host_baseline",
      ),
    ).toBe("legacy");
    expect(
      getSweepzaMetadataState(
        { venture: "sweepza", sweepza_key: "sweepza_host_baseline" },
        "sweepza_host_baseline",
      ),
    ).toBe("exact");
    expect(
      getSweepzaMetadataState(
        { venture: "other", sweepza_key: "sweepza_host_baseline" },
        "sweepza_host_baseline",
      ),
    ).toBe("foreign");
    expect(
      getSweepzaMetadataState(
        { venture: "", sweepza_key: "sweepza_host_baseline" },
        "sweepza_host_baseline",
      ),
    ).toBe("foreign");
    expect(getSweepzaMetadataState({}, "sweepza_host_baseline")).toBe(
      "mismatch",
    );
  });

  it.each(["exact", "legacy"])(
    "refuses a foreign same-key economic price alongside a %s candidate",
    (candidateState) => {
      const candidate = {
        ...exactPrice,
        metadata:
          candidateState === "exact"
            ? exactPrice.metadata
            : { sweepza_key: "sweepza_host_baseline" },
      };
      const foreign = {
        ...exactPrice,
        metadata: {
          venture: "other",
          sweepza_key: "sweepza_host_baseline",
        },
      };

      expect(() =>
        selectSweepzaPriceCandidate([candidate, foreign], expected),
      ).toThrow("foreign venture tag");
    },
  );

  it("returns one legacy candidate for in-place metadata repair", () => {
    const legacy = {
      ...exactPrice,
      metadata: { sweepza_key: "sweepza_host_baseline" },
    };

    expect(selectSweepzaPriceCandidate([legacy], expected)).toEqual({
      price: legacy,
      state: "legacy",
    });
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

  it("accepts only explicitly owned Sweepza account endpoints", () => {
    const exact = {
      application: null,
      metadata: { venture: "sweepza", endpoint_scope: "account" },
    };
    expect(isOwnedSweepzaAccountWebhook(exact)).toBe(true);
    expect(
      isOwnedSweepzaAccountWebhook({ ...exact, application: "ca_connected" }),
    ).toBe(false);
    expect(
      isOwnedSweepzaAccountWebhook({ ...exact, metadata: {} }),
    ).toBe(false);
    expect(
      isOwnedSweepzaAccountWebhook({
        ...exact,
        metadata: { venture: "other", endpoint_scope: "account" },
      }),
    ).toBe(false);
  });

  it("requires all subscription events or a wildcard", () => {
    expect(
      hasRequiredWebhookEvents({
        enabled_events: [
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
        ],
      }),
    ).toBe(true);
    expect(hasRequiredWebhookEvents({ enabled_events: ["*"] })).toBe(true);
    expect(
      hasRequiredWebhookEvents({
        enabled_events: ["customer.subscription.created"],
      }),
    ).toBe(false);
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
