"use client";

import { useState, useTransition } from "react";
import { REACTION_TYPES, type ReactionType } from "@/lib/db/enums";

const REACTION_LABEL: Record<ReactionType, string> = {
  congrats: "Congrats",
  awesome: "Awesome",
  nice_win: "Nice win",
  celebration: "Celebrate",
};

export function WinnerReactionBar({
  winnerPostId,
  reactions,
}: {
  winnerPostId: string;
  reactions: Partial<Record<ReactionType, number>>;
}) {
  const [counts, setCounts] = useState(reactions);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onReact(reactionType: ReactionType) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/winners/${winnerPostId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reactionType }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            setError("Sign in to react.");
            return;
          }

          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${response.status})`);
        }

        const body = (await response.json()) as {
          reactions: Partial<Record<ReactionType, number>>;
        };
        setCounts(body.reactions);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Reaction failed.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {REACTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onReact(type)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink/70 transition hover:bg-ink/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {REACTION_LABEL[type]}
            <span className="text-ink/50">{counts[type] ?? 0}</span>
          </button>
        ))}
      </div>
      {error ? <p className="text-xs text-ember">{error}</p> : null}
    </div>
  );
}
