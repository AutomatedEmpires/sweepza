"use client";

import { ClerkProvider } from "@clerk/nextjs";
import {
  SeekerStateProvider,
  type SeekerStateSnapshot,
  type SeekerStatePersistenceMode,
} from "@/lib/seeker-state";

export function SweepzaProviders({
  children,
  clerkPublishableKey,
  initialSeekerState,
  persistenceMode,
}: {
  children: React.ReactNode;
  clerkPublishableKey?: string;
  initialSeekerState: SeekerStateSnapshot;
  persistenceMode: SeekerStatePersistenceMode;
}) {
  const content = (
    <SeekerStateProvider
      initial={initialSeekerState}
      persistenceMode={persistenceMode}
    >
      {children}
    </SeekerStateProvider>
  );

  if (!clerkPublishableKey) {
    return content;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {content}
    </ClerkProvider>
  );
}
