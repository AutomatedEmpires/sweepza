"use client";

import { useMemo, type CSSProperties } from "react";

// A contained, tasteful celebration — small sparks rising over the prize when
// an entry lands, with a richer spark-and-confetti burst on a win. Deliberately clipped to the
// card cover (never a full-screen takeover) and only mounted the moment a state
// is newly reached, so it delights without wearing out its welcome. Honors
// prefers-reduced-motion via the global reduced-motion rule in globals.css.

const CONFETTI_COLORS = [
  "rgb(var(--color-accent))",
  "rgb(var(--color-info))",
  "rgb(var(--color-trust))",
];

export function CardCelebration({ kind }: { kind: "entered" | "won" }) {
  const count = kind === "won" ? 14 : 8;

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const isConfetti = kind === "won" && index % 2 === 0;
        return {
          isConfetti,
          left: 8 + Math.random() * 84,
          delayMs: Math.round(Math.random() * 280),
          driftPx: Math.round(-16 + Math.random() * 32),
          color: isConfetti
            ? CONFETTI_COLORS[index % CONFETTI_COLORS.length]
            : CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        };
      }),
    [count, kind],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={
            piece.isConfetti
              ? "animate-confetti-fall absolute top-1/3 h-2 w-1.5 rounded-[1px]"
              : "animate-spark-rise absolute bottom-4 h-2.5 w-2.5 rotate-45 rounded-[2px]"
          }
          style={
            {
              left: `${piece.left}%`,
              background: piece.color,
              animationDelay: `${piece.delayMs}ms`,
              "--drift": `${piece.driftPx}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
