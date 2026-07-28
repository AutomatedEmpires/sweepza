import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCurrentAppUser: vi.fn(),
  getPublishedWinnerPosts: vi.fn(),
  isClerkConfigured: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
  isClerkConfigured: mocks.isClerkConfigured,
}));
vi.mock("@/lib/db/winners", () => ({
  getPublishedWinnerPosts: mocks.getPublishedWinnerPosts,
}));

import WinnersPage from "@/app/winners/page";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

beforeEach(() => {
  mocks.ensureCurrentAppUser.mockReset();
  mocks.getPublishedWinnerPosts.mockReset();
  mocks.isClerkConfigured.mockReset();

  mocks.ensureCurrentAppUser.mockResolvedValue(null);
  mocks.getPublishedWinnerPosts.mockResolvedValue({
    posts: [],
    nextCursor: null,
  });
  mocks.isClerkConfigured.mockReturnValue(true);
});

describe("Winner Wall read truth", () => {
  it("lets a failed database read reach the retryable route boundary", async () => {
    const failure = new Error("winner feed unavailable");
    mocks.getPublishedWinnerPosts.mockRejectedValue(failure);

    await expect(WinnersPage()).rejects.toBe(failure);
  });

  it("renders the moderated empty state only after a successful empty read", async () => {
    await expect(WinnersPage()).resolves.toBeTruthy();

    const page = source("app/winners/page.tsx");
    expect(page).toContain("No published winner stories yet");
    expect(page).not.toContain("withPublicFallback");
  });
});

describe("Winner Wall disclosure and reporting", () => {
  it("labels member reports, publication review, and evidence review separately", () => {
    const page = source("app/winners/page.tsx");
    const card = source("components/winner-card.tsx");

    expect(page).toContain("Member-reported");
    expect(page).toContain("Publication reviewed");
    expect(page).toContain("Evidence badge");
    expect(card).toContain("Publication review does not independently verify");
    expect(card).toContain("Sweepza reviewed supporting evidence");
    expect(card).not.toContain("Won · {formatEndDate(post.createdAt)}");
  });

  it("offers the existing report path only for published winner cards", () => {
    const card = source("components/winner-card.tsx");
    const winnerReport = source("components/winner-report-button.tsx");
    const reportButton = source("components/report-problem-button.tsx");

    expect(card).toContain('post.reviewStatus === "published"');
    expect(card).toContain("<WinnerReportButton");
    expect(winnerReport).toContain('targetType="winner_post"');
    expect(reportButton).toContain('fetch("/api/reports"');
    expect(winnerReport).toContain('"fake_winner_claim"');
    expect(winnerReport).not.toContain('"broken_entry_link"');
  });
});
