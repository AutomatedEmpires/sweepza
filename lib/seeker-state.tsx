"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SeekerUiState } from "@/lib/types/listing";

// Session-scoped seeker state for mock data (Lane D). Seeker-specific state is
// intentionally NOT on the listing object — the Canonical Listing Object keeps
// it in a separate relationship. Lane B replaces this with a Supabase-backed
// listing_seeker_state join table.

interface SeekerStateValue {
  getState: (id: string) => SeekerUiState | undefined;
  isSaved: (id: string) => boolean;
  setPrimaryState: (id: string, state: SeekerUiState) => void;
  toggleSaved: (id: string) => void;
}

const SeekerStateContext = createContext<SeekerStateValue | null>(null);

const STORAGE_KEY = "sweepza-seeker-state";

export interface SeekerStateSnapshot {
  primary: Record<string, SeekerUiState>;
  saved: Record<string, boolean>;
}

export type SeekerStatePersistenceMode = "local" | "remote";

const EMPTY_SNAPSHOT: SeekerStateSnapshot = {
  primary: {},
  saved: {},
};

function sanitizePrimary(
  primary: Record<string, unknown> | undefined,
): Record<string, SeekerUiState> {
  if (!primary) return {};

  const allowed = new Set<SeekerUiState>([
    "none",
    "saved",
    "entered",
    "skipped",
    "won",
  ]);

  const entries: Array<[string, SeekerUiState]> = [];
  for (const [id, value] of Object.entries(primary)) {
    if (allowed.has(value as SeekerUiState)) {
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

function readLocalSnapshot(): SeekerStateSnapshot {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SNAPSHOT;

    const parsed = JSON.parse(raw) as {
      primary?: Record<string, unknown>;
      saved?: Record<string, unknown>;
    };

    return {
      primary: sanitizePrimary(parsed.primary),
      saved: sanitizeSaved(parsed.saved),
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function writeLocalSnapshot(snapshot: SeekerStateSnapshot): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

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
  // Tracks whether the initial localStorage read has completed so the write
  // effect doesn't overwrite storage with empty state before hydration.
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (persistenceMode !== "local") return;
    const snapshot = readLocalSnapshot();
    setPrimary(snapshot.primary);
    setSaved(snapshot.saved);
    hydratedRef.current = true;
  }, [persistenceMode]);

  useEffect(() => {
    if (persistenceMode !== "local") return;
    if (!hydratedRef.current) return;
    writeLocalSnapshot({ primary, saved });
  }, [primary, saved, persistenceMode]);

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

  const setPrimaryState = useCallback((id: string, state: SeekerUiState) => {
    setPrimary((current) => ({ ...current, [id]: state }));

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
  }, [persistRemote, persistenceMode]);

  const toggleSaved = useCallback((id: string) => {
    const nextSaved = !Boolean(saved[id]);
    const currentPrimary = primary[id];
    const nextPrimary = !nextSaved && currentPrimary === "saved" ? "none" : undefined;

    setSaved((current) => {
      if (nextSaved) {
        return { ...current, [id]: true };
      }

      const copy = { ...current };
      delete copy[id];
      return copy;
    });

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
  }, [persistRemote, persistenceMode, primary, saved]);

  const value = useMemo<SeekerStateValue>(
    () => ({
      getState: (id) => primary[id],
      isSaved: (id) => Boolean(saved[id]),
      setPrimaryState,
      toggleSaved,
    }),
    [primary, saved, setPrimaryState, toggleSaved],
  );

  return (
    <SeekerStateContext.Provider value={value}>
      {children}
    </SeekerStateContext.Provider>
  );
}

/**
 * Returns the seeker-state store, or null when no provider is mounted (e.g. the
 * standalone Browse grid), in which case cards fall back to local state.
 */
export function useSeekerState(): SeekerStateValue | null {
  return useContext(SeekerStateContext);
}
