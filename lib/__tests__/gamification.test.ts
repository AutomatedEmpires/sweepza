import { describe, expect, it } from "vitest";
import {
  buildGamification,
  computeBadges,
  computeStreak,
  unlockedBadgeCount,
  type GamificationStats,
} from "@/lib/gamification";

const TODAY = "2026-07-14";

function statsFrom(overrides: Partial<GamificationStats> = {}): GamificationStats {
  return {
    totalEntries: 0,
    distinctDays: 0,
    wins: 0,
    distinctCategories: 0,
    maxEntriesOnOneListing: 0,
    currentStreak: 0,
    longestStreak: 0,
    ...overrides,
  };
}

describe("computeStreak", () => {
  it("counts a run ending today", () => {
    const streak = computeStreak(["2026-07-12", "2026-07-13", "2026-07-14"], TODAY);
    expect(streak.current).toBe(3);
    expect(streak.longest).toBe(3);
    expect(streak.enteredToday).toBe(true);
    expect(streak.atRisk).toBe(false);
  });

  it("keeps the streak alive today even before entering, but flags it at risk", () => {
    const streak = computeStreak(["2026-07-12", "2026-07-13"], TODAY);
    expect(streak.current).toBe(2);
    expect(streak.enteredToday).toBe(false);
    expect(streak.atRisk).toBe(true);
  });

  it("breaks once a full day is missed", () => {
    // Nothing on the 13th or 14th ⇒ the run through the 12th is dead.
    const streak = computeStreak(["2026-07-10", "2026-07-11", "2026-07-12"], TODAY);
    expect(streak.current).toBe(0);
    expect(streak.atRisk).toBe(false);
    expect(streak.longest).toBe(3);
  });

  it("reports the longest historical run independent of the current one", () => {
    const streak = computeStreak(
      ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-07-14"],
      TODAY,
    );
    expect(streak.longest).toBe(4);
    expect(streak.current).toBe(1);
  });

  it("dedupes multiple entries on the same day", () => {
    const streak = computeStreak(["2026-07-14", "2026-07-14", "2026-07-13"], TODAY);
    expect(streak.current).toBe(2);
  });

  it("is zero with no entries", () => {
    const streak = computeStreak([], TODAY);
    expect(streak).toEqual({ current: 0, longest: 0, enteredToday: false, atRisk: false });
  });
});

describe("computeBadges", () => {
  it("unlocks badges once their metric target is met", () => {
    const badges = computeBadges(statsFrom({ totalEntries: 12, longestStreak: 7, wins: 1 }));
    const byId = Object.fromEntries(badges.map((b) => [b.id, b]));
    expect(byId.first_entry.unlocked).toBe(true);
    expect(byId.getting_going.unlocked).toBe(true);
    expect(byId.regular.unlocked).toBe(false);
    expect(byId.streak_7.unlocked).toBe(true);
    expect(byId.streak_30.unlocked).toBe(false);
    expect(byId.first_win.unlocked).toBe(true);
  });

  it("caps progress at the target and exposes it for locked badges", () => {
    const badges = computeBadges(statsFrom({ totalEntries: 3 }));
    const regular = badges.find((b) => b.id === "regular");
    expect(regular).toMatchObject({ unlocked: false, value: 3, target: 50 });
    const firstEntry = badges.find((b) => b.id === "first_entry");
    expect(firstEntry).toMatchObject({ unlocked: true, value: 1, target: 1 });
  });

  it("orders unlocked first, then locked by nearest goal", () => {
    const badges = computeBadges(statsFrom({ totalEntries: 1, longestStreak: 6 }));
    const firstLockedIndex = badges.findIndex((b) => !b.unlocked);
    // Everything before the first locked badge is unlocked.
    expect(badges.slice(0, firstLockedIndex).every((b) => b.unlocked)).toBe(true);
    // The nearest locked badge (streak_7 at 6/7) leads the locked group.
    expect(badges[firstLockedIndex].id).toBe("streak_7");
  });
});

describe("buildGamification", () => {
  it("assembles streak, stats, and badges from raw inputs", () => {
    const result = buildGamification({
      entryDays: ["2026-07-12", "2026-07-13", "2026-07-14"],
      totalEntries: 12,
      wins: 1,
      distinctCategories: 5,
      maxEntriesOnOneListing: 4,
      todayIso: TODAY,
    });
    expect(result.stats.distinctDays).toBe(3);
    expect(result.stats.currentStreak).toBe(3);
    expect(result.stats.longestStreak).toBe(3);
    expect(unlockedBadgeCount(result.badges)).toBeGreaterThanOrEqual(4); // first_entry, getting_going, streak_3, first_win, explorer
    expect(result.badges.find((b) => b.id === "explorer")?.unlocked).toBe(true);
  });
});
