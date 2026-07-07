"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { track } from "@/lib/analytics";
import { useSeekerState } from "@/lib/seeker-state";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

// Swipe deck modeled on the explore-and-earn SwipeDeck flow, adapted to the
// Sweepza canonical card, seeker-state store, and analytics dictionary.

type SwipeAction = "skip" | "save" | "enter";

interface Decision {
  readonly id: string;
  readonly action: SwipeAction;
  readonly prevPrimary: SeekerUiState;
  readonly prevSaved: boolean;
}

/** Drag distance (px) past which a release commits the swipe. */
const COMMIT_DISTANCE = 120;
/** Throw-off / snap-back durations (ms). */
const THROW_MS = 240;
const SNAP_MS = 160;
/** Top card + cards peeking behind it. */
const MAX_VISIBLE = 3;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function SwipeDeck({ listings }: { listings: Listing[] }) {
  const store = useSeekerState();
  const total = listings.length;

  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeAction | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    track("discover_feed_loaded", { count: total, surface: "swipe" });
    // Fire once on mount for the swipe stack load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  const current = listings[index];

  function triggerLeave(action: SwipeAction) {
    if (leaving) return;
    const card = listings[index];
    if (!card) return;

    const base = {
      listing_id: card.id,
      source_label: card.sourceLabel,
      surface: "swipe" as const,
    };
    const prevPrimary = store?.getState(card.id) ?? "none";
    const prevSaved = store ? store.isSaved(card.id) : false;

    if (action === "save") {
      store?.setPrimaryState(card.id, "saved");
      track("listing_saved", base);
    } else if (action === "skip") {
      store?.setPrimaryState(card.id, "skipped");
      track("listing_skipped", base);
    } else {
      track("listing_enter_clicked", base);
      if (typeof window !== "undefined") {
        window.open(card.entryUrl, "_blank", "noopener,noreferrer");
      }
      store?.setPrimaryState(card.id, "entered");
      track("listing_marked_entered", { listing_id: card.id });
    }

    setDecisions((prev) => [
      ...prev,
      { id: card.id, action, prevPrimary, prevSaved },
    ]);
    setDragging(false);
    setLeaving(action);
    setOffset(
      action === "enter"
        ? { x: 0, y: -720 }
        : { x: action === "save" ? 720 : -720, y: 0 },
    );

    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(
      () => {
        setIndex((value) => value + 1);
        setOffset({ x: 0, y: 0 });
        setLeaving(null);
      },
      reducedMotion ? 0 : THROW_MS,
    );
  }

  function undo() {
    if (leaving || decisions.length === 0) return;
    const last = decisions[decisions.length - 1];
    if (store) {
      store.setPrimaryState(last.id, last.prevPrimary);
      if (store.isSaved(last.id) !== last.prevSaved) store.toggleSaved(last.id);
    }
    setDecisions((prev) => prev.slice(0, -1));
    setIndex((value) => Math.max(0, value - 1));
    setOffset({ x: 0, y: 0 });
  }

  function restart() {
    setIndex(0);
    setDecisions([]);
    setOffset({ x: 0, y: 0 });
    setLeaving(null);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!current) return;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        triggerLeave("skip");
        break;
      case "ArrowRight":
        event.preventDefault();
        triggerLeave("save");
        break;
      case "ArrowUp":
        event.preventDefault();
        triggerLeave("enter");
        break;
      case "Backspace":
        event.preventDefault();
        undo();
        break;
      default:
        break;
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (leaving || !current) return;
    pointerIdRef.current = event.pointerId;
    startRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || !startRef.current) return;
    setOffset({
      x: event.clientX - startRef.current.x,
      y: event.clientY - startRef.current.y,
    });
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (pointerIdRef.current !== null) {
      try {
        event.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch {
        /* pointer already released */
      }
    }
    pointerIdRef.current = null;
    startRef.current = null;
    const x = offset.x;
    const y = offset.y;
    if (y < -COMMIT_DISTANCE && Math.abs(y) > Math.abs(x)) {
      triggerLeave("enter");
      return;
    }
    if (x > COMMIT_DISTANCE) {
      triggerLeave("save");
      return;
    }
    if (x < -COMMIT_DISTANCE) {
      triggerLeave("skip");
      return;
    }
    setDragging(false);
    setOffset({ x: 0, y: 0 });
  }

  if (!current) {
    const savedCount = decisions.filter((d) => d.action === "save").length;
    const enteredCount = decisions.filter((d) => d.action === "enter").length;
    const summary =
      decisions.length === 0
        ? "No live sweeps in the deck right now. Browse the full feed instead."
        : `You saved ${savedCount} and entered ${enteredCount}. Find them under Saved, or run the deck again.`;
    return (
      <div className="flex flex-col items-center gap-4 px-6 pt-16 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-moss/10 text-moss">
          <Icon name="trophy" size={32} />
        </span>
        <h2 className="font-display text-2xl text-ink">You’re all caught up</h2>
        <p className="max-w-xs text-sm text-ink/60">{summary}</p>
        <div className="mt-2 flex items-center gap-2">
          {decisions.length > 0 && (
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-1.5 rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
            >
              <Icon name="repeat" size={16} /> Start over
            </button>
          )}
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
          >
            <Icon name="gift" size={16} /> Browse feed
          </Link>
        </div>
      </div>
    );
  }

  const saveStrength = clamp(offset.x / COMMIT_DISTANCE);
  const skipStrength = clamp(-offset.x / COMMIT_DISTANCE);
  const enterStrength = clamp(-offset.y / COMMIT_DISTANCE);
  const saveOverlayStyle: CSSProperties = { opacity: saveStrength };
  const skipOverlayStyle: CSSProperties = { opacity: skipStrength };
  const enterOverlayStyle: CSSProperties = { opacity: enterStrength };
  const visible = listings.slice(index, index + MAX_VISIBLE);

  return (
    <div
      className="flex flex-col items-center gap-5 px-4 pb-6 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-moss/50"
      role="group"
      aria-roledescription="Swipe deck"
      aria-label="Sweepstakes"
      aria-describedby="swipe-deck-help"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink/60">
        Sweep {index + 1} of {total}
      </p>
      {/* Keyboard equivalence for the swipe gestures — announced to assistive
          tech and shown on desktop where a keyboard is the likely input. */}
      <p
        id="swipe-deck-help"
        className="sr-only lg:not-sr-only lg:-mt-3 lg:text-[11px] lg:font-medium lg:text-ink/55"
      >
        Keyboard: ← skip · → save · ↑ enter · Backspace undo
      </p>

      <div className="relative w-full">
        {visible.map((listing, depth) => {
          const isTop = depth === 0;
          const topStyle: CSSProperties = {
            position: "relative",
            zIndex: MAX_VISIBLE,
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${offset.x * 0.04}deg)`,
            transition: dragging
              ? "none"
              : `transform ${reducedMotion ? 0 : leaving ? THROW_MS : SNAP_MS}ms ease-out`,
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
          };
          const behindStyle: CSSProperties = {
            position: "absolute",
            inset: 0,
            zIndex: MAX_VISIBLE - depth,
            transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
            transformOrigin: "top center",
            transition: reducedMotion ? "none" : `transform ${SNAP_MS}ms ease-out`,
            pointerEvents: "none",
          };
          const layerStyle = isTop ? topStyle : behindStyle;
          return (
            <div
              key={listing.id}
              style={layerStyle}
              aria-hidden={!isTop}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerEnd : undefined}
              onPointerCancel={isTop ? onPointerEnd : undefined}
            >
              {isTop ? (
                <>
                  <span
                    style={saveOverlayStyle}
                    className="pointer-events-none absolute right-4 top-6 z-10 rotate-6 rounded-lg border-2 border-ember bg-cream/90 px-3 py-1 font-display text-lg uppercase tracking-wide text-ember"
                    aria-hidden
                  >
                    Save
                  </span>
                  <span
                    style={skipOverlayStyle}
                    className="pointer-events-none absolute left-4 top-6 z-10 -rotate-6 rounded-lg border-2 border-ink bg-cream/90 px-3 py-1 font-display text-lg uppercase tracking-wide text-ink"
                    aria-hidden
                  >
                    Skip
                  </span>
                  <span
                    style={enterOverlayStyle}
                    className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border-2 border-moss bg-cream/90 px-3 py-1 font-display text-lg uppercase tracking-wide text-moss"
                    aria-hidden
                  >
                    Enter
                  </span>
                </>
              ) : null}
              <div className="pointer-events-none select-none">
                <ListingCard listing={listing} surface="swipe" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={undo}
          disabled={decisions.length === 0}
          aria-label="Undo"
          className="grid h-11 w-11 place-items-center rounded-full border border-sand text-ink/60 transition enabled:hover:bg-ink/5 disabled:opacity-40"
        >
          <Icon name="repeat" size={18} />
        </button>
        <button
          type="button"
          onClick={() => triggerLeave("skip")}
          aria-label="Skip"
          className="grid h-12 w-12 place-items-center rounded-full border border-sand text-ink/70 transition hover:bg-ink/5"
        >
          <Icon name="skip" size={20} />
        </button>
        <button
          type="button"
          onClick={() => triggerLeave("save")}
          aria-label="Save"
          className="grid h-12 w-12 place-items-center rounded-full bg-ember text-cream shadow-sm transition hover:bg-ember/90"
        >
          <Icon name="bookmark" size={20} />
        </button>
        <button
          type="button"
          onClick={() => triggerLeave("enter")}
          className="inline-flex items-center gap-1.5 rounded-full bg-moss px-5 py-3 text-sm font-semibold text-cream shadow-sm transition hover:bg-moss/90"
        >
          Enter <Icon name="send" size={16} />
        </button>
      </div>

      <p className="text-center text-[11px] text-ink/60">
        Drag a card, tap a button, or use ← Skip · → Save · ↑ Enter · ⌫ Undo.
      </p>

      <span className="sr-only" role="status" aria-live="polite">
        {`Sweep ${index + 1} of ${total}: ${current.title}`}
      </span>
    </div>
  );
}
