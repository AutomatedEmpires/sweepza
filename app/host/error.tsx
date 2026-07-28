"use client";

import {
  WorkflowErrorState,
  type WorkflowErrorProps,
} from "@/components/workflow-error-state";

export default function HostError({
  error,
  reset,
}: WorkflowErrorProps) {
  return (
    <WorkflowErrorState
      error={error}
      reset={reset}
      scope="host"
      eyebrow="Host workspace"
      title="Your host workspace couldn’t load"
      description="Sweepza couldn’t open the host dashboard and listing workspace. No listing, organization, or billing setting was changed by this error."
      icon="host"
      retryLabel="Retry host workspace"
      returnHref="/profile"
      returnLabel="Go to Profile"
    />
  );
}
