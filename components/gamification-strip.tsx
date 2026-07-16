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
  pine: "text-pine",
  ember: "text-ember",
  graphite: "text-graphite",
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

  return (
    <section
      className={cn(
        "rounded-sheet border border-line bg-surface p-5 shadow-e1",
        className,
      )}
      aria-label="Your streak and badges"
    >
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "grid h-16 w-16 shrink-0 place-items-center rounded-2xl",
            streak.current > 0
              ? "bg-ember/10 text-ember"
              : "bg-ink/5 text-ink/40",
          )}
        >
          <span className="nums font-display text-[32px] leading-none">
            {streak.current}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl leading-none text-ink">
            {streak.current === 1 ? "1-day streak" : `${streak.current}-day streak`}
          </p>
          <p className={cn("mt-1.5 text-sm leading-snug", TONE_CLASS[status.tone])}>
            {status.text}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between px-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-graphite">
          Badges
        </h3>
        <span className="nums text-xs font-semibold text-ink/55">
          {unlocked} of {badges.length}
        </span>
      </div>

      <ul className="no-scrollbar -mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
        {shelf.map((badge) => (
          <li
            key={badge.id}
            className="flex w-[78px] shrink-0 flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                "grid h-14 w-14 place-items-center rounded-2xl border transition",
                badge.unlocked
                  ? "border-gold/40 bg-gold/12 text-gold"
                  : "border-line bg-paper text-ink/30",
              )}
              aria-hidden="true"
            >
              <Icon
                name={badge.icon as IconName}
                size={22}
                weight={badge.unlocked ? "fill" : "regular"}
              />
            </span>
            <span className="text-center text-[11px] font-semibold leading-tight text-ink/80">
              {badge.label}
            </span>
            {badge.unlocked ? (
              <span className="text-[10px] font-medium text-gold">Earned</span>
            ) : (
              <span className="nums text-[10px] text-graphite">
                {badge.value}/{badge.target}
              </span>
            )}
            <span className="sr-only">
              {badge.label}: {badge.description}{" "}
              {badge.unlocked
                ? "Earned."
                : `Progress ${badge.value} of ${badge.target}.`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
