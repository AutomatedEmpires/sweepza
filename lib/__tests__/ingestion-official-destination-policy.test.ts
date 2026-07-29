import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createOfficialDestinationUrlPolicy,
  evaluateOfficialDestinationPolicy,
  type OfficialDestinationPolicy,
} from "@/lib/ingestion/official-destination-policy";
import { officialDestinationPolicyEventSchema } from "@/lib/official-destination-policy-event-schema";

function policy(
  overrides: Partial<OfficialDestinationPolicy> = {},
): OfficialDestinationPolicy {
  return {
    id: 1,
    hostname: "sponsor.example.com",
    pathPrefix: "/",
    includeSubdomains: false,
    complianceState: "approved_for_production",
    robotsPosture: "permissive",
    tosPosture: "permits_use",
    termsUrl: "https://sponsor.example.com/terms",
    robotsUrl: "https://sponsor.example.com/robots.txt",
    approvedBy: "founder@example.com",
    approvedAt: "2026-07-29T00:00:00.000Z",
    reviewExpiresAt: "2026-12-31T23:59:59.999Z",
    ...overrides,
  };
}

describe("official destination policy", () => {
  it("defaults to deny when no reviewed destination exists", () => {
    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://sponsor.example.com/rules",
        policies: [],
      }),
    ).toMatchObject({ allowed: false, reason: "policy_missing" });
  });

  it("requires an exact subdomain unless expansion was explicitly approved", () => {
    const apexOnly = policy({ hostname: "example.com" });
    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://promotions.example.com/rules",
        policies: [apexOnly],
      }),
    ).toMatchObject({ allowed: false, reason: "policy_missing" });

    const exactSubdomain = policy({
      id: 2,
      hostname: "promotions.example.com",
      termsUrl: "https://promotions.example.com/terms",
      robotsUrl: "https://promotions.example.com/robots.txt",
    });
    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://promotions.example.com/rules",
        policies: [apexOnly, exactSubdomain],
      }),
    ).toMatchObject({ allowed: true, policy: { id: 2 } });

    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://offers.example.com/rules",
        policies: [policy({ hostname: "example.com", includeSubdomains: true })],
      }),
    ).toMatchObject({ allowed: true });
  });

  it("treats path scopes as segment boundaries", () => {
    const rules = policy({ pathPrefix: "/rules" });
    const allows = createOfficialDestinationUrlPolicy([rules]);

    expect(allows("https://sponsor.example.com/rules")).toBe(true);
    expect(allows("https://sponsor.example.com/rules/2026")).toBe(true);
    expect(allows("https://sponsor.example.com/rules-archive")).toBe(false);
  });

  it("reads the current policy snapshot for every transport decision", () => {
    let policies: OfficialDestinationPolicy[] = [policy()];
    const allows = createOfficialDestinationUrlPolicy(() => policies);

    expect(allows("https://sponsor.example.com/rules")).toBe(true);

    policies = [
      policy({
        id: 2,
        complianceState: "revoked",
        approvedBy: null,
        approvedAt: null,
      }),
    ];

    expect(allows("https://sponsor.example.com/rules")).toBe(false);
  });

  it("lets a more-specific pause override a broad approval", () => {
    const broad = policy({ id: 1, pathPrefix: "/" });
    const paused = policy({
      id: 2,
      pathPrefix: "/private",
      complianceState: "paused",
      approvedBy: null,
      approvedAt: null,
    });

    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://sponsor.example.com/private/rules",
        policies: [broad, paused],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "policy_not_production_approved",
      policy: { id: 2 },
    });
  });

  it("prefers an exact-only apex pause over a newer wildcard approval", () => {
    const apexPause = policy({
      id: 10,
      includeSubdomains: false,
      complianceState: "paused",
      approvedBy: null,
      approvedAt: null,
    });
    const wildcardApproval = policy({
      id: 20,
      includeSubdomains: true,
    });

    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://sponsor.example.com/rules",
        policies: [apexPause, wildcardApproval],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "policy_not_production_approved",
      policy: { id: 10 },
    });
  });

  it("applies a newer broad containment stop over older narrow approvals", () => {
    const narrowApproval = policy({
      id: 10,
      pathPrefix: "/promotions",
    });
    const emergencyPause = policy({
      id: 20,
      pathPrefix: "/",
      complianceState: "paused",
      approvedBy: null,
      approvedAt: null,
    });

    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://sponsor.example.com/promotions/summer",
        policies: [narrowApproval, emergencyPause],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "policy_not_production_approved",
      policy: { id: 20 },
    });

    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://sponsor.example.com/promotions/summer",
        policies: [
          emergencyPause,
          { ...narrowApproval, id: 30 },
        ],
      }),
    ).toMatchObject({ allowed: true, policy: { id: 30 } });
  });

  it("prefers the longest matching parent hostname before path or event age", () => {
    const broadApproval = policy({
      id: 99,
      hostname: "example.com",
      includeSubdomains: true,
      pathPrefix: "/promotions/seasonal",
      termsUrl: "https://example.com/terms",
      robotsUrl: "https://example.com/robots.txt",
    });
    const narrowerPause = policy({
      id: 2,
      hostname: "co.example.com",
      includeSubdomains: true,
      pathPrefix: "/",
      complianceState: "paused",
      termsUrl: null,
      robotsUrl: null,
      approvedBy: null,
      approvedAt: null,
    });

    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://offers.co.example.com/promotions/seasonal/rules",
        policies: [broadApproval, narrowerPause],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "policy_not_production_approved",
      policy: { id: 2 },
    });
  });

  it("requires structured HTTPS terms and robots evidence", () => {
    for (const evidence of [
      { termsUrl: null },
      { robotsUrl: null },
      { termsUrl: "http://sponsor.example.com/terms" },
      { robotsUrl: "not a url" },
    ]) {
      expect(
        evaluateOfficialDestinationPolicy({
          url: "https://sponsor.example.com/rules",
          policies: [policy(evidence)],
        }),
      ).toMatchObject({
        allowed: false,
        reason: "approval_evidence_missing",
      });
    }
  });

  it("refuses missing, expired, or malformed review windows", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    for (const reviewExpiresAt of [
      null,
      "2026-07-29T11:59:59.999Z",
      "not-a-date",
    ]) {
      expect(
        evaluateOfficialDestinationPolicy({
          url: "https://sponsor.example.com/rules",
          policies: [policy({ reviewExpiresAt })],
          now,
        }),
      ).toMatchObject({ allowed: false, reason: "approval_expired" });
    }
  });

  it("requires HTTPS for the destination itself", () => {
    expect(
      evaluateOfficialDestinationPolicy({
        url: "http://sponsor.example.com/rules",
        policies: [policy()],
      }),
    ).toMatchObject({ allowed: false, reason: "https_required" });
  });

  it("requires the reviewed default HTTPS port", () => {
    expect(
      evaluateOfficialDestinationPolicy({
        url: "https://sponsor.example.com:8443/rules",
        policies: [policy()],
      }),
    ).toMatchObject({ allowed: false, reason: "non_default_port" });
  });
});

describe("official destination policy migration contract", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260729170000_official_destination_policy.sql",
    ),
    "utf8",
  );

  it("is append-only, dark by default, and exposes a security-invoker current view", () => {
    expect(sql).toContain("official_destination_policy_event is append-only");
    expect(sql).toContain("before update or delete");
    expect(sql).toContain("with (security_invoker = true)");
    expect(
      sql.split(
        "create function public.append_official_destination_policy_event",
      )[0],
    ).not.toMatch(
      /insert\s+into\s+public\.official_destination_policy_event/i,
    );
  });

  it("requires structured terms and robots evidence for production approval", () => {
    expect(sql).toContain("terms_url text");
    expect(sql).toContain("robots_url text");
    expect(sql).toContain("terms_url ~ '^https://");
    expect(sql).toContain("robots_url ~ '^https://");
    expect(sql).toContain("terms_url is not null");
    expect(sql).toContain("robots_url is not null");
  });

  it("stores exactly one canonical spelling for each path scope", () => {
    expect(sql).toContain(
      "(path_prefix = '/' or right(path_prefix, 1) <> '/')",
    );
  });

  it("requires atomic, attributed, expiring policy appends", () => {
    expect(sql).toContain("idempotency_key uuid not null unique");
    expect(sql).toContain(
      "actor_user_id uuid not null references public.app_user(id) on delete restrict",
    );
    expect(sql).toContain(
      "create function public.append_official_destination_policy_event",
    );
    expect(sql).toContain("p_expected_current_id bigint");
    expect(sql).toContain("expectedLedgerVersion");
    expect(sql).toContain("official_destination_policy:ledger");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("review_expires_at is not null");
    expect(sql).toContain("interval '180 days'");
    expect(sql).not.toContain(
      "grant select, insert on table public.official_destination_policy_event to service_role",
    );
  });
});

describe("official destination decision input", () => {
  function decision(overrides: Record<string, unknown> = {}) {
    return {
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
      expectedCurrentId: null,
      expectedLedgerVersion: null,
      hostname: "promotions.example.com",
      pathPrefix: "/",
      includeSubdomains: false,
      complianceState: "draft",
      robotsPosture: "unknown",
      tosPosture: "unreviewed",
      termsUrl: null,
      robotsUrl: null,
      reason: "The exact destination still requires a compliance review.",
      reviewExpiresAt: null,
      productionApprovalConfirmed: false,
      ...overrides,
    };
  }

  it.each(["com", "co.uk", "127.0.0.1", "sponsor.example"])(
    "rejects non-registrable destination scope %s",
    (hostname) => {
      expect(
        officialDestinationPolicyEventSchema.safeParse(
          decision({ hostname }),
        ).success,
      ).toBe(false);
    },
  );

  it("requires production reviews to expire within 180 days", () => {
    const result = officialDestinationPolicyEventSchema.safeParse(
      decision({
        complianceState: "approved_for_production",
        robotsPosture: "permissive",
        tosPosture: "permits_use",
        termsUrl: "https://promotions.example.com/terms",
        robotsUrl: "https://promotions.example.com/robots.txt",
        reviewExpiresAt: new Date(
          Date.now() + 181 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        productionApprovalConfirmed: true,
      }),
    );

    expect(result.success).toBe(false);
  });
});
