import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfficialUrlIntakeStatus } from "@/components/official-url-intake-status";

describe("official URL intake backlog status surface", () => {
  it("shows bounded operational aggregates and age without queue payloads", () => {
    const html = renderToStaticMarkup(
      <OfficialUrlIntakeStatus
        readable
        status={{
          pending: 12,
          retrying: 3,
          completed: 40,
          deadLettered: 2,
          oldestPendingAt: "2026-07-29T08:30:00.000Z",
          oldestPendingAgeMinutes: 150,
          sampledAt: "2026-07-29T11:00:00.000Z",
        }}
      />,
    );

    expect(html).toContain("Official URL intake backlog");
    expect(html).toContain("Pending");
    expect(html).toContain("Deferred / retrying");
    expect(html).toContain("Completed");
    expect(html).toContain("Dead-lettered");
    expect(html).toContain("2 hrs old");
    expect(html).not.toContain("officialUrl");
    expect(html).not.toContain("dead_letter_reason");
  });

  it("makes an unavailable queue read visible and fail closed", () => {
    const html = renderToStaticMarkup(
      <OfficialUrlIntakeStatus readable={false} status={null} />,
    );

    expect(html).toContain("Backlog status is unavailable");
    expect(html).toContain("Queue state is not being inferred");
    expect(html).toContain('role="alert"');
  });
});
