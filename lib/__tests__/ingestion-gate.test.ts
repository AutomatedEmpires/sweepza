import { describe, expect, it } from "vitest";
import { SOURCE_COMPLIANCE_STATES, type SourceComplianceState } from "@/lib/ingestion/compliance";
import { evaluateSourceGate, type SourceApprovalSnapshot } from "@/lib/ingestion/gate";
import { SOURCE_REGISTRY, type SourceDescriptor } from "@/lib/ingestion/source";

// These tests are the safety proof for the whole ingestion platform: they must
// demonstrate that a source which has not been explicitly approved cannot
// execute, no matter which single control an operator or an agent gets wrong.

function descriptor(overrides: Partial<SourceDescriptor> = {}): SourceDescriptor {
  return {
    id: "test_source",
    label: "Test Source",
    tier: "discovery",
    homepage: "https://example.com/",
    allowedHosts: ["example.com"],
    allowedPathPrefixes: [],
    crawlDelayMs: 0,
    requestBudgetPerRun: 10,
    maxConcurrency: 1,
    timeoutMs: 1000,
    refreshIntervalMinutes: 720,
    supportsConditionalRequests: true,
    maxRetries: 1,
    failureThreshold: 3,
    complianceState: "approved_for_production",
    robotsPosture: "permissive",
    tosPosture: "permits_use",
    attribution: null,
    dataRetentionDays: 90,
    killSwitch: false,
    buildPriority: 99,
    notes: "",
    ...overrides,
  };
}

function record(overrides: Partial<SourceApprovalSnapshot> = {}): SourceApprovalSnapshot {
  return {
    id: "test_source",
    complianceState: "approved_for_production",
    killSwitch: false,
    circuitOpenedAt: null,
    ...overrides,
  };
}

/** The only input combination that should ever be allowed. */
const ALLOWED = {
  descriptor: descriptor(),
  record: record(),
  ingestionEnabled: "true",
};

describe("source execution gate", () => {
  it("allows only when the switch, the registry, and the record all agree", () => {
    expect(evaluateSourceGate(ALLOWED).allowed).toBe(true);
  });

  describe("INGESTION_ENABLED is a hard master switch", () => {
    it.each([undefined, null, "", "false", "1", "yes", "TRUE", "True", " true "])(
      "refuses when INGESTION_ENABLED is %j",
      (value) => {
        const decision = evaluateSourceGate({ ...ALLOWED, ingestionEnabled: value });
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) expect(decision.reason).toBe("ingestion_disabled");
      },
    );

    it("outranks a fully approved source", () => {
      // Everything else is green; the switch alone keeps it dark.
      const decision = evaluateSourceGate({ ...ALLOWED, ingestionEnabled: undefined });
      expect(decision.allowed).toBe(false);
    });
  });

  describe("both halves of the approval must say production", () => {
    const notProduction = SOURCE_COMPLIANCE_STATES.filter(
      (s): s is Exclude<SourceComplianceState, "approved_for_production"> =>
        s !== "approved_for_production",
    );

    it.each(notProduction)("refuses when the registry floor is %s", (state) => {
      const decision = evaluateSourceGate({
        ...ALLOWED,
        descriptor: descriptor({ complianceState: state }),
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("registry_not_production_approved");
    });

    it.each(notProduction)("refuses when the approval record is %s", (state) => {
      const decision = evaluateSourceGate({
        ...ALLOWED,
        record: record({ complianceState: state }),
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("record_not_production_approved");
    });

    it("refuses when no approval record exists at all", () => {
      const decision = evaluateSourceGate({ ...ALLOWED, record: null });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("record_missing");
    });

    it("refuses an unknown source", () => {
      const decision = evaluateSourceGate({ ...ALLOWED, descriptor: undefined });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("unknown_source");
    });
  });

  describe("kill switches stop an approved source from either side", () => {
    it("honors the code-level kill switch", () => {
      const decision = evaluateSourceGate({
        ...ALLOWED,
        descriptor: descriptor({ killSwitch: true }),
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("kill_switch");
    });

    it("honors the operational kill switch", () => {
      const decision = evaluateSourceGate({ ...ALLOWED, record: record({ killSwitch: true }) });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("kill_switch");
    });
  });

  it("refuses while the circuit breaker is open", () => {
    const decision = evaluateSourceGate({
      ...ALLOWED,
      record: record({ circuitOpenedAt: "2026-07-16T00:00:00.000Z" }),
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("circuit_open");
  });

  it("always explains itself — a denial names the reason and the detail", () => {
    const decision = evaluateSourceGate({ ...ALLOWED, record: null });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.detail).toContain("test_source");
      expect(decision.detail.length).toBeGreaterThan(20);
    }
  });
});

describe("the shipped registry is dark", () => {
  it("has no source approved for production", () => {
    const approved = SOURCE_REGISTRY.filter(
      (s) => s.complianceState === "approved_for_production",
    );
    expect(approved).toEqual([]);
  });

  it("refuses every configured source even with the switch on and a forged approval record", () => {
    // The scenario this guards: someone sets INGESTION_ENABLED and approves a
    // source in the database. The registry floor must still hold the line,
    // because no source in this codebase has cleared ToS review.
    for (const source of SOURCE_REGISTRY) {
      const decision = evaluateSourceGate({
        descriptor: source,
        record: record({ id: source.id, complianceState: "approved_for_production" }),
        ingestionEnabled: "true",
      });
      expect(decision.allowed, `${source.id} must not be executable`).toBe(false);
    }
  });

  it("has no source whose ToS has been cleared", () => {
    // ToS review is the outstanding blocker; if this ever passes, the registry
    // floor is the only thing left holding a source back — revisit the gate.
    for (const source of SOURCE_REGISTRY) {
      expect(source.tosPosture).toBe("unreviewed");
    }
  });
});

describe("gate — refresh interval", () => {
  // refreshIntervalMinutes was declared per source and never read, so every
  // approved source ran on every cron tick. Politeness that only exists in a
  // config field is not politeness.
  const NOW = new Date("2026-07-16T12:00:00Z");
  const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

  it("defers a source that ran more recently than its reviewed interval", () => {
    const decision = evaluateSourceGate({
      descriptor: descriptor({ refreshIntervalMinutes: 720 }),
      record: record({ lastRunAt: minutesAgo(60) }),
      ingestionEnabled: "true",
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("refresh_not_due");
      expect(decision.detail).toContain("720m");
    }
  });

  it("allows once the interval has elapsed", () => {
    const decision = evaluateSourceGate({
      descriptor: descriptor({ refreshIntervalMinutes: 720 }),
      record: record({ lastRunAt: minutesAgo(721) }),
      ingestionEnabled: "true",
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
  });

  it("allows a source that has never run", () => {
    const decision = evaluateSourceGate({
      descriptor: descriptor({ refreshIntervalMinutes: 720 }),
      record: record({ lastRunAt: null }),
      ingestionEnabled: "true",
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
  });

  it("defers rather than guessing when last_run_at is unreadable", () => {
    // A bad timestamp must not silently mean "crawl now".
    const decision = evaluateSourceGate({
      descriptor: descriptor({ refreshIntervalMinutes: 720 }),
      record: record({ lastRunAt: "not-a-date" }),
      ingestionEnabled: "true",
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("refresh_not_due");
  });

  it("honours each source's own interval, not a global one", () => {
    // Freebie Guy asks for a 10s crawl delay and a daily refresh; Sweeps
    // Advantage is twice-daily. The same elapsed time answers differently.
    const elapsed = record({ lastRunAt: minutesAgo(800) });
    expect(
      evaluateSourceGate({
        descriptor: descriptor({ refreshIntervalMinutes: 720 }),
        record: elapsed,
        ingestionEnabled: "true",
        now: NOW,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateSourceGate({
        descriptor: descriptor({ refreshIntervalMinutes: 1440 }),
        record: elapsed,
        ingestionEnabled: "true",
        now: NOW,
      }).allowed,
    ).toBe(false);
  });
});

describe("gate — terms-of-service posture", () => {
  // SourceDescriptor always SAID an unreviewed source cannot reach production.
  // Nothing enforced it: a descriptor at approved_for_production with an
  // unreviewed — or actively prohibiting — ToS executed. These are the proof.

  it("refuses every posture that is not permits_use, even at full approval", () => {
    const postures = ["unreviewed", "prohibits_use", "requires_agreement"] as const;
    for (const tosPosture of postures) {
      const decision = evaluateSourceGate({
        descriptor: descriptor({ complianceState: "approved_for_production", tosPosture }),
        record: record(),
        ingestionEnabled: "true",
      });
      expect(decision.allowed, `tosPosture "${tosPosture}" must not execute`).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("tos_not_permitted");
    }
  });

  it("refuses a source that actively prohibits our use", () => {
    const decision = evaluateSourceGate({
      descriptor: descriptor({ tosPosture: "prohibits_use" }),
      record: record(),
      ingestionEnabled: "true",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("tos_not_permitted");
      expect(decision.detail).toContain("prohibits_use");
    }
  });

  it("allows only permits_use, and only with every other control satisfied", () => {
    const decision = evaluateSourceGate({
      descriptor: descriptor({ tosPosture: "permits_use" }),
      record: record(),
      ingestionEnabled: "true",
    });
    expect(decision.allowed).toBe(true);
  });

  it("fails closed on a posture nobody has thought of yet", () => {
    // The check is an allowlist of one, so a posture added to TosPosture later
    // denies by default instead of silently inheriting permission.
    const decision = evaluateSourceGate({
      descriptor: descriptor({ tosPosture: "some_future_posture" as never }),
      record: record(),
      ingestionEnabled: "true",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("tos_not_permitted");
  });

  it("every shipped source is refused on ToS grounds once its ladder is ignored", () => {
    // Today the registry floor stops each source first. This asserts the ToS
    // gate would ALSO stop it — so clearing the ladder can't quietly open a
    // source whose terms were never read.
    for (const source of SOURCE_REGISTRY) {
      const decision = evaluateSourceGate({
        descriptor: { ...source, complianceState: "approved_for_production" },
        record: record({ id: source.id }),
        ingestionEnabled: "true",
      });
      expect(decision.allowed, `${source.id} must still be refused`).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe("tos_not_permitted");
    }
  });
});
