"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { REACTION_TYPES, type ReactionType } from "@/lib/db/enums";
import { track } from "@/lib/analytics";

const LABEL: Record<ReactionType, string> = {
  congrats: "Congrats",
  awesome: "Awesome",
  nice_win: "Nice win",
  celebration: "Celebration",
};

export function WinnerReactionBar(props: {
  winnerPostId: string;
  initialCounts: Partial<Record<ReactionType, number>>;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState(props.initialCounts);
  const [pending, setPending] = useState<ReactionType | null>(null);
  const [reacted, setReacted] = useState<Set<ReactionType>>(new Set());

  const total = useMemo(
    () => REACTION_TYPES.reduce((sum, t) => sum + (counts[t] ?? 0), 0),
    [counts],
  );

  async function react(type: ReactionType) {
    if (!props.isAuthenticated) {
      router.push("/sign-in");
      return;
    }

    setPending(type);
    setCounts((prev) => ({ ...prev, [type]: (prev[type] ?? 0) + 1 }));

    try {
      const res = await fetch(`/api/winners/${props.winnerPostId}/reactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reactionType: type }),
      });
      if (!res.ok) throw new Error("Failed to react");
      setReacted((prev) => new Set(prev).add(type));
      track("winner_post_reacted", { winner_post_id: props.winnerPostId, reaction_type: type });
    } catch {
      setCounts((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] ?? 1) - 1) }));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      {REACTION_TYPES.map((type) => {
        const isReacted = reacted.has(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => react(type)}
            disabled={pending !== null}
            className={cn(
              "nums rounded-pill border px-3 py-1 text-xs font-medium transition disabled:opacity-60",
              isReacted
                ? "border-ember/30 bg-ember/10 text-ember"
                : "border-line bg-surface text-ink/70 hover:border-ember/40",
            )}
          >
            {LABEL[type]} {counts[type] ?? 0}
          </button>
        );
      })}
      <span className="text-xs text-graphite">{total} reactions</span>
    </div>
  );
}
