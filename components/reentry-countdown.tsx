"use client";

import { useEffect, useRef, useState } from "react";
import { nextEntryAt } from "@/lib/sweep-routine";
import type { EntryFrequency } from "@/lib/types/listing";

// The daily-loop timer. For a recurring sweep the seeker has entered, this
// counts down to the moment it can be entered again (daily/instant-win reset at
// the next local midnight; weekly/monthly on a rolling window) and calls
// `onReady` the instant the window re-opens, so the card flips its action to
// "Enter again". Ticks live on the client only — the render clock elsewhere is
// frozen for SSR safety, so this owns its own second-by-second time.

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${pad(minutes)}m`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function ReentryCountdown({
  enteredAt,
  frequency,
  onReady,
}: {
  enteredAt: string;
  frequency: EntryFrequency;
  onReady?: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const target = nextEntryAt(enteredAt, frequency);
    if (!target) return;
    const tick = () => {
      const ms = target.getTime() - Date.now();
      setRemaining(ms);
      if (ms <= 0) onReadyRef.current?.();
    };
    tick();
    const interval = window.setInterval(tick, 1_000);
    return () => window.clearInterval(interval);
  }, [enteredAt, frequency]);

  // Before the first client tick, render a stable label (no live value in the
  // SSR/hydration frame).
  if (remaining === null) return <>Opens again soon</>;
  if (remaining <= 0) return null;

  return (
    <>
      Opens again in{" "}
      <span className="nums font-semibold tabular-nums">
        {formatRemaining(remaining)}
      </span>
    </>
  );
}
