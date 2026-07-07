"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { NowProvider } from "@/lib/now";
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
  serverNow,
}: {
  children: React.ReactNode;
  clerkPublishableKey?: string;
  initialSeekerState: SeekerStateSnapshot;
  persistenceMode: SeekerStatePersistenceMode;
  serverNow: number;
}) {
  const content = (
    <NowProvider value={serverNow}>
      <SeekerStateProvider
        initial={initialSeekerState}
        persistenceMode={persistenceMode}
      >
        {children}
      </SeekerStateProvider>
    </NowProvider>
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
