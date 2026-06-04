"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

export function SeekerStateProvider({
  children,
  initial = {},
}: {
  children: ReactNode;
  initial?: Record<string, SeekerUiState>;
}) {
  const [primary, setPrimary] = useState<Record<string, SeekerUiState>>(initial);
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.entries(initial)
        .filter(([, s]) => s === "saved")
        .map(([id]) => [id, true]),
    ),
  );

  const setPrimaryState = useCallback((id: string, state: SeekerUiState) => {
    setPrimary((p) => ({ ...p, [id]: state }));
    if (state === "saved") setSaved((s) => ({ ...s, [id]: true }));
  }, []);

  const toggleSaved = useCallback((id: string) => {
    setSaved((s) => ({ ...s, [id]: !s[id] }));
  }, []);

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
