// Seeker gamification engine — honest streaks and badges.
//
// Every mechanic here derives from real actions the seeker actually took
// (entry events, wins), never a hollow "check-in." A streak counts distinct
// calendar days with at least one genuine entry, so it cannot be gamed by
// opening the app and doing nothing. Pure and DB-free so it is fully
// unit-testable; lib/db/gamification wires it to Supabase.

/** Add `delta` days to a YYYY-MM-DD string, staying in UTC. */
function addDaysIso(iso: string, delta: number): string {
  const time = new Date(`${iso}T00:00:00.000Z`).getTime() + delta * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

export interface StreakSummary {
  /** Consecutive days ending today, or yesterday if today isn't entered yet. */
  current: number;
  /** Best run the seeker has ever put together. */
  longest: number;
  enteredToday: boolean;
  /** Streak is alive but needs an entry today or it breaks tomorrow. */
  atRisk: boolean;
}

/**
 * Current and longest entry streaks from the set of distinct entry days.
 *
 * A streak survives the current day even before you enter — it only breaks
 * once a full day passes with no entry. That is encouraging without being a
 * dark pattern: no fake "you're about to lose it" the instant midnight ticks.
 */
export function computeStreak(
  entryDays: string[],
  todayIso: string,
): StreakSummary {
  const set = new Set(entryDays);
  const enteredToday = set.has(todayIso);
  const yesterdayIso = addDaysIso(todayIso, -1);

  const anchor = enteredToday
    ? todayIso
    : set.has(yesterdayIso)
      ? yesterdayIso
      : null;

  let current = 0;
  let cursor = anchor;
  while (cursor && set.has(cursor)) {
    current += 1;
    cursor = addDaysIso(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of [...set].sort()) {
    run = prev && addDaysIso(prev, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = day;
  }

  return { current, longest, enteredToday, atRisk: !enteredToday && current > 0 };
}

export interface GamificationStats {
  totalEntries: number;
  distinctDays: number;
  wins: number;
  distinctCategories: number;
  maxEntriesOnOneListing: number;
  currentStreak: number;
  longestStreak: number;
}

export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string;
  unlocked: boolean;
  /** Progress toward the badge (capped at target), for the "keep going" UI. */
  value: number;
  target: number;
}

type StatMetric = keyof Pick<
  GamificationStats,
  | "totalEntries"
  | "longestStreak"
  | "wins"
  | "distinctCategories"
  | "maxEntriesOnOneListing"
>;

interface BadgeDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  metric: StatMetric;
  target: number;
}

// Ordered by theme (entries, streaks, wins, breadth, loyalty). Every target is
// checkable from data the app already records — nothing is self-reported.
const BADGE_DEFS: BadgeDef[] = [
  { id: "first_entry", label: "First Entry", description: "Entered your first sweepstakes.", icon: "send", metric: "totalEntries", target: 1 },
  { id: "getting_going", label: "Getting Going", description: "Entered 10 sweepstakes.", icon: "send", metric: "totalEntries", target: 10 },
  { id: "regular", label: "Regular", description: "Entered 50 sweepstakes.", icon: "send", metric: "totalEntries", target: 50 },
  { id: "streak_3", label: "On a Roll", description: "Entered 3 days in a row.", icon: "sparkle", metric: "longestStreak", target: 3 },
  { id: "streak_7", label: "Week Warrior", description: "Entered 7 days in a row.", icon: "sparkle", metric: "longestStreak", target: 7 },
  { id: "streak_30", label: "Unstoppable", description: "Entered 30 days in a row.", icon: "sparkle", metric: "longestStreak", target: 30 },
  { id: "first_win", label: "First Win", description: "Won your first prize.", icon: "trophy", metric: "wins", target: 1 },
  { id: "winner_circle", label: "Winner's Circle", description: "Won 5 prizes.", icon: "trophy", metric: "wins", target: 5 },
  { id: "explorer", label: "Explorer", description: "Entered across 5 prize categories.", icon: "discover", metric: "distinctCategories", target: 5 },
  { id: "comeback", label: "Comeback Kid", description: "Re-entered one sweep on 10 different days.", icon: "repeat", metric: "maxEntriesOnOneListing", target: 10 },
];

/**
 * Compute the badge set — unlocked first, then the locked ones closest to
 * unlocking, so the shelf always points at an achievable next goal.
 */
export function computeBadges(stats: GamificationStats): Badge[] {
  const badges: Badge[] = BADGE_DEFS.map((def) => {
    const raw = stats[def.metric];
    return {
      id: def.id,
      label: def.label,
      description: def.description,
      icon: def.icon,
      unlocked: raw >= def.target,
      value: Math.min(raw, def.target),
      target: def.target,
    };
  });

  return badges.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    // Both locked: surface the nearest goal first.
    if (!a.unlocked) return b.value / b.target - a.value / a.target;
    return 0;
  });
}

export interface SeekerGamification {
  streak: StreakSummary;
  stats: GamificationStats;
  badges: Badge[];
}

export interface GamificationInput {
  /** Distinct entry days (YYYY-MM-DD); duplicates are tolerated. */
  entryDays: string[];
  totalEntries: number;
  wins: number;
  distinctCategories: number;
  maxEntriesOnOneListing: number;
  todayIso: string;
}

export function buildGamification(input: GamificationInput): SeekerGamification {
  const streak = computeStreak(input.entryDays, input.todayIso);
  const stats: GamificationStats = {
    totalEntries: input.totalEntries,
    distinctDays: new Set(input.entryDays).size,
    wins: input.wins,
    distinctCategories: input.distinctCategories,
    maxEntriesOnOneListing: input.maxEntriesOnOneListing,
    currentStreak: streak.current,
    longestStreak: streak.longest,
  };
  return { streak, stats, badges: computeBadges(stats) };
}

/** Count of unlocked badges — a headline stat for the profile/shelf. */
export function unlockedBadgeCount(badges: Badge[]): number {
  return badges.reduce((n, badge) => n + (badge.unlocked ? 1 : 0), 0);
}
