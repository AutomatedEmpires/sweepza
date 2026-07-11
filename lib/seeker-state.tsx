"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  SeekerListingActivity,
  SeekerUiState,
} from "@/lib/types/listing";

// Client seeker-state store. Seeker-specific state is intentionally NOT on the
// listing object — the Canonical Listing Object keeps it in the separate
// listing_seeker_state relationship. Signed-in ("remote") mode hydrates from a
// server snapshot and persists via /api/seeker-state; signed-out ("local")
// mode persists to localStorage with the same shape, including the action
// timestamps that power Ready Again and the Sweep Routine.

interface SeekerStateValue {
  getState: (id: string) => SeekerUiState | undefined;
  isSaved: (id: string) => boolean;
  getActivity: (id: string) => SeekerListingActivity | undefined;
  /** Full current snapshot — feeds lib/sweep-routine bucket math. */
  snapshot: SeekerStateSnapshot;
  setPrimaryState: (id: string, state: SeekerUiState) => void;
  toggleSaved: (id: string) => void;
  /**
   * True once the store's authoritative values are in place: from mount in
   * remote mode (server snapshot is already loaded), and after the localStorage
   * read in local mode. Consumers use this to distinguish a genuine in-session
   * state change from the one-time async hydration merge, so celebratory UI
   * doesn't replay for already-entered/won items on page load.
   */
  hydrated: boolean;
}

const SeekerStateContext = createContext<SeekerStateValue | null>(null);

const STORAGE_KEY = "sweepza-seeker-state";

export interface SeekerStateSnapshot {
  primary: Record<string, SeekerUiState>;
  saved: Record<string, boolean>;
  activity: Record<string, SeekerListingActivity>;
}

export type SeekerStatePersistenceMode = "local" | "remote";

const EMPTY_SNAPSHOT: SeekerStateSnapshot = {
  primary: {},
  saved: {},
  activity: {},
};

const ALLOWED_STATES = new Set<SeekerUiState>([
  "none",
  "saved",
  "entered",
  "skipped",
  "won",
]);

const ACTIVITY_KEYS = [
  "savedAt",
  "enteredAt",
  "skippedAt",
  "wonAt",
  "updatedAt",
] as const;

function sanitizePrimary(
  primary: Record<string, unknown> | undefined,
): Record<string, SeekerUiState> {
  if (!primary) return {};

  const entries: Array<[string, SeekerUiState]> = [];
  for (const [id, value] of Object.entries(primary)) {
    if (ALLOWED_STATES.has(value as SeekerUiState)) {
      entries.push([id, value as SeekerUiState]);
    }
  }

  return Object.fromEntries(entries);
}

function sanitizeSaved(
  saved: Record<string, unknown> | undefined,
): Record<string, boolean> {
  if (!saved) return {};
  return Object.fromEntries(
    Object.entries(saved)
      .filter(([, value]) => Boolean(value))
      .map(([id]) => [id, true]),
  );
}

function sanitizeActivity(
  activity: Record<string, unknown> | undefined,
): Record<string, SeekerListingActivity> {
  if (!activity) return {};

  const entries: Array<[string, SeekerListingActivity]> = [];
  for (const [id, value] of Object.entries(activity)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const clean: SeekerListingActivity = {};
    for (const key of ACTIVITY_KEYS) {
      const raw = record[key];
      if (typeof raw === "string" && !Number.isNaN(new Date(raw).getTime())) {
        clean[key] = raw;
      }
    }
    if (Object.keys(clean).length > 0) entries.push([id, clean]);
  }

  return Object.fromEntries(entries);
}

function readLocalSnapshot(): SeekerStateSnapshot {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SNAPSHOT;

    const parsed = JSON.parse(raw) as {
      primary?: Record<string, unknown>;
      saved?: Record<string, unknown>;
      activity?: Record<string, unknown>;
    };

    return {
      primary: sanitizePrimary(parsed.primary),
      saved: sanitizeSaved(parsed.saved),
      activity: sanitizeActivity(parsed.activity),
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function writeLocalSnapshot(snapshot: SeekerStateSnapshot): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

const STATE_TIMESTAMP: Partial<
  Record<SeekerUiState, keyof SeekerListingActivity>
> = {
  saved: "savedAt",
  entered: "enteredAt",
  skipped: "skippedAt",
  won: "wonAt",
};

export function SeekerStateProvider({
  children,
  initial = EMPTY_SNAPSHOT,
  persistenceMode = "local",
}: {
  children: ReactNode;
  initial?: SeekerStateSnapshot;
  persistenceMode?: SeekerStatePersistenceMode;
}) {
  const [primary, setPrimary] = useState<Record<string, SeekerUiState>>(
    initial.primary,
  );
  const [saved, setSaved] = useState<Record<string, boolean>>(initial.saved);
  const [activity, setActivity] = useState<
    Record<string, SeekerListingActivity>
  >(initial.activity ?? {});
  // Gates the write effect until a render has committed the hydrated values.
  // Must be state (not a ref): a ref flips synchronously during the mount
  // effects, letting the write effect fire once with the pre-hydration empty
  // maps and wipe the stored snapshot. As state, it batches with the hydrated
  // values, so the write effect can never observe hydrated=true + stale data.
  // Remote mode is hydrated from mount — its `initial` snapshot is the
  // server's authoritative state, so there is no async merge to wait on.
  const [hydrated, setHydrated] = useState(() => persistenceMode !== "local");

  useEffect(() => {
    if (persistenceMode !== "local") return;
    const snapshot = readLocalSnapshot();
    // startTransition: this fires while route-level Suspense boundaries
    // (loading.tsx) may still be lazily hydrating card subtrees. A sync
    // update would force those boundaries to client-render and React logs
    // recoverable hydration mismatches (#418); a transition lets hydration
    // finish first.
    startTransition(() => {
      // Merge under any state the user set before hydration finished.
      setPrimary((current) => ({ ...snapshot.primary, ...current }));
      setSaved((current) => ({ ...snapshot.saved, ...current }));
      setActivity((current) => ({ ...snapshot.activity, ...current }));
      setHydrated(true);
    });
  }, [persistenceMode]);

  useEffect(() => {
    if (persistenceMode !== "local") return;
    if (!hydrated) return;
    writeLocalSnapshot({ primary, saved, activity });
  }, [primary, saved, activity, hydrated, persistenceMode]);

  const persistRemote = useCallback(
    async (payload: {
      listingId: string;
      primaryUiState?: SeekerUiState;
      saved?: boolean;
    }) => {
      try {
        const response = await fetch("/api/seeker-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`persist failed (${response.status})`);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[seeker-state] remote persistence failed", error);
      }
    },
    [],
  );

  // Optimistic local stamp in both modes; in remote mode the server writes the
  // authoritative timestamps and the next snapshot load replaces these.
  const stampActivity = useCallback(
    (id: string, state: SeekerUiState) => {
      const now = new Date().toISOString();
      setActivity((current) => {
        const next: SeekerListingActivity = {
          ...current[id],
          updatedAt: now,
        };
        const key = STATE_TIMESTAMP[state];
        if (key) next[key] = now;
        return { ...current, [id]: next };
      });
    },
    [],
  );

  const setPrimaryState = useCallback(
    (id: string, state: SeekerUiState) => {
      setPrimary((current) => ({ ...current, [id]: state }));
      stampActivity(id, state);

      if (state === "saved") {
        setSaved((current) => ({ ...current, [id]: true }));
      }

      if (persistenceMode === "remote") {
        void persistRemote({
          listingId: id,
          primaryUiState: state,
          ...(state === "saved" ? { saved: true } : {}),
        });
      }
    },
    [persistRemote, persistenceMode, stampActivity],
  );

  const toggleSaved = useCallback(
    (id: string) => {
      const nextSaved = !Boolean(saved[id]);
      const currentPrimary = primary[id];
      const nextPrimary =
        !nextSaved && currentPrimary === "saved" ? "none" : undefined;

      setSaved((current) => {
        if (nextSaved) {
          return { ...current, [id]: true };
        }

        const copy = { ...current };
        delete copy[id];
        return copy;
      });

      if (nextSaved) stampActivity(id, "saved");

      if (nextPrimary) {
        setPrimary((current) => ({ ...current, [id]: nextPrimary }));
      }

      if (persistenceMode === "remote") {
        void persistRemote({
          listingId: id,
          saved: nextSaved,
          ...(nextPrimary ? { primaryUiState: nextPrimary } : {}),
        });
      }
    },
    [persistRemote, persistenceMode, primary, saved, stampActivity],
  );

  const snapshot = useMemo<SeekerStateSnapshot>(
    () => ({ primary, saved, activity }),
    [primary, saved, activity],
  );

  const value = useMemo<SeekerStateValue>(
    () => ({
      getState: (id) => primary[id],
      isSaved: (id) => Boolean(saved[id]),
      getActivity: (id) => activity[id],
      snapshot,
      setPrimaryState,
      toggleSaved,
      hydrated,
    }),
    [primary, saved, activity, snapshot, setPrimaryState, toggleSaved, hydrated],
  );

  return (
    <SeekerStateContext.Provider value={value}>
      {children}
    </SeekerStateContext.Provider>
  );
}

/**
 * Returns the seeker-state store, or null when no provider is mounted, in
 * which case cards fall back to component-local state.
 */
export function useSeekerState(): SeekerStateValue | null {
  return useContext(SeekerStateContext);
}
