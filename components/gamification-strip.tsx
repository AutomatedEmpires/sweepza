import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/cn";
import { unlockedBadgeCount, type SeekerGamification } from "@/lib/gamification";

// Streak + badge shelf. Presentational and hook-free so it renders inside both
// the Today (client) tree and the Profile (server) tree. Every number is
// derived from real entry activity — see lib/gamification.

function streakStatus(streak: SeekerGamification["streak"]): {
  text: string;
  tone: "pine" | "ember" | "graphite";
} {
  if (streak.enteredToday) {
    return {
      text:
        streak.longest > streak.current
          ? `Entered today — nice. Your best is ${streak.longest} days.`
          : "Entered today — you're building your best streak.",
      tone: "pine",
    };
  }
  if (streak.atRisk) {
    return { text: "Enter one today to keep it going.", tone: "ember" };
  }
  return {
    text:
      streak.longest > 0
        ? `Start a fresh streak today. Your best is ${streak.longest} days.`
        : "Enter a sweep to start your streak.",
    tone: "graphite",
  };
}

const TONE_CLASS: Record<"pine" | "ember" | "graphite", string> = {
  pine: "text-paper/85",
  ember: "font-semibold text-paper",
  graphite: "text-paper/60",
};

export function GamificationStrip({
  data,
  className,
}: {
  data: SeekerGamification;
  className?: string;
}) {
  const { streak, badges } = data;
  const status = streakStatus(streak);
  const unlocked = unlockedBadgeCount(badges);
  const shelf = badges.slice(0, 8);
  const nextBadge = badges.find((badge) => !badge.unlocked);
  const nextProgress = nextBadge
    ? Math.round((nextBadge.value / nextBadge.target) * 100)
    : 100;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-sheet border border-gold/35 bg-ink p-4 text-paper shadow-e3 sm:p-5",
        className,
      )}
      aria-label="Your Sweepza game progress"
    >
      <span
        aria-hidden
        className="absolute -right-14 -top-16 h-40 w-40 rounded-full bg-ember/25 blur-3xl"
      />
      <span
        aria-hidden
        className="absolute -bottom-20 left-1/3 h-36 w-36 rounded-full bg-ocean/20 blur-3xl"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-paper">
              <Icon name="sparkle" size={14} weight="fill" />
              Your game board
            </p>
            <h2 className="mt-1 font-display text-2xl leading-none text-paper">
              Build the run. Track the actions.
            </h2>
          </div>
          <span className="rounded-pill border border-paper/15 bg-paper/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-paper/70">
            Real activity
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            {
              label: "Hot streak",
              value: streak.current,
              suffix: streak.current === 1 ? "day" : "days",
              icon: "sparkle" as IconName,
            },
            {
              label: "Entries",
              value: data.stats.totalEntries,
              suffix: "tracked",
              icon: "send" as IconName,
            },
            {
              label: "Badges",
              value: unlocked,
              suffix: `of ${badges.length}`,
              icon: "trophy" as IconName,
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-paper/[0.12] bg-paper/[0.08] px-3 py-3"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-paper/60">
                <Icon name={metric.icon} size={13} />
                <span className="truncate">{metric.label}</span>
              </div>
              <p className="nums mt-2 font-display text-2xl leading-none text-paper">
                {metric.value}
              </p>
              <p className="mt-1 truncate text-[10px] font-semibold text-paper/60">
                {metric.suffix}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-paper/[0.12] bg-paper/[0.08] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-paper/60">
                {nextBadge ? "Next badge" : "Badge shelf"}
              </p>
              <p className="mt-1 truncate text-sm font-extrabold text-paper">
                {nextBadge?.label ?? "Every badge unlocked"}
              </p>
            </div>
            <span className="nums shrink-0 rounded-pill bg-gold px-2 py-1 text-xs font-bold text-on-won">
              {nextBadge
                ? `${nextBadge.value}/${nextBadge.target}`
                : `${badges.length}/${badges.length}`}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-pill bg-paper/[0.12]"
            role="progressbar"
            aria-label={
              nextBadge
                ? `Progress toward ${nextBadge.label}`
                : "All badges unlocked"
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={nextProgress}
          >
            <div
              className="h-full rounded-pill bg-gradient-to-r from-ember via-flame to-gold transition-[width] duration-500"
              style={{ width: `${nextProgress}%` }}
            />
          </div>
          <p className={cn("mt-2 text-xs leading-snug", TONE_CLASS[status.tone])}>
            {status.text}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between px-0.5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-paper/60">
            Prize-run badges
          </h3>
          <span className="nums text-[10px] font-semibold text-paper/60">
            {unlocked} earned
          </span>
        </div>

        <ul className="no-scrollbar -mx-1 mt-2 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {shelf.map((badge) => (
            <li
              key={badge.id}
              className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "grid h-12 w-12 place-items-center rounded-xl border transition",
                  badge.unlocked
                    ? "border-gold bg-gold text-on-won shadow-[0_0_20px_rgb(var(--color-won)/0.18)]"
                    : "border-paper/[0.12] bg-paper/[0.08] text-paper/30",
                )}
                aria-hidden="true"
              >
                <Icon
                  name={badge.icon as IconName}
                  size={20}
                  weight={badge.unlocked ? "fill" : "regular"}
                />
              </span>
              <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-paper/75">
                {badge.label}
              </span>
              <span className="sr-only">
                {badge.label}: {badge.description}{" "}
                {badge.unlocked
                  ? "Earned."
                  : `Progress ${badge.value} of ${badge.target}.`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
