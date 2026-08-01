import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCurrentAppUser: vi.fn(),
  getOfficialUrlIntakeBacklogStatus: vi.fn(),
  getSourceHealth: vi.fn(),
  listCurrentOfficialDestinationPolicies: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));
vi.mock("@/lib/db/official-url-intake-status", () => ({
  getOfficialUrlIntakeBacklogStatus:
    mocks.getOfficialUrlIntakeBacklogStatus,
}));
vi.mock("@/lib/db/source-health", () => ({
  getSourceHealth: mocks.getSourceHealth,
}));
vi.mock("@/lib/db/official-destination-policy", () => ({
  listCurrentOfficialDestinationPolicies:
    mocks.listCurrentOfficialDestinationPolicies,
}));
vi.mock("@/components/official-url-intake-console", () => ({
  OfficialUrlIntakeConsole: () => <div>Official URL intake form</div>,
}));
vi.mock("@/components/official-destination-policy-console", () => ({
  OfficialDestinationPolicyConsole: () => (
    <div>Official destination policies</div>
  ),
}));

import AdminSourcesPage from "@/app/admin/sources/page";

function sourceHealth() {
  return {
    ingestionEnabled: false,
    tablesPresent: true,
    registryReadable: true,
    runsReadable: true,
    queueReadable: true,
    rows: [],
  };
}

describe("admin sources page authorization boundary", () => {
  beforeEach(() => {
    mocks.ensureCurrentAppUser.mockReset();
    mocks.getOfficialUrlIntakeBacklogStatus.mockReset();
    mocks.getSourceHealth.mockReset();
    mocks.listCurrentOfficialDestinationPolicies.mockReset();
    mocks.getSourceHealth.mockResolvedValue(sourceHealth());
    mocks.listCurrentOfficialDestinationPolicies.mockResolvedValue([]);
  });

  it("does not make service-role-backed reads for an unauthorized visitor", async () => {
    mocks.ensureCurrentAppUser.mockResolvedValue({
      appUser: { is_admin: false, is_owner: false },
    });

    await expect(AdminSourcesPage()).resolves.toBeNull();

    expect(mocks.getSourceHealth).not.toHaveBeenCalled();
    expect(mocks.getOfficialUrlIntakeBacklogStatus).not.toHaveBeenCalled();
    expect(
      mocks.listCurrentOfficialDestinationPolicies,
    ).not.toHaveBeenCalled();
  });

  it("shows status as unavailable when the authorized backlog read fails", async () => {
    mocks.ensureCurrentAppUser.mockResolvedValue({
      appUser: { is_admin: true, is_owner: false },
    });
    mocks.getOfficialUrlIntakeBacklogStatus.mockRejectedValue(
      new Error("queue unavailable"),
    );

    const page = await AdminSourcesPage();
    const html = renderToStaticMarkup(page);

    expect(mocks.getOfficialUrlIntakeBacklogStatus).toHaveBeenCalledOnce();
    expect(html).toContain("Backlog status is unavailable");
    expect(html).toContain("Queue state is not being inferred");
  });
});
