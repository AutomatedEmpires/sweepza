"use client";

import {
  WorkflowErrorState,
  type WorkflowErrorProps,
} from "@/components/workflow-error-state";

export default function MySweepsError({
  error,
  reset,
}: WorkflowErrorProps) {
  return (
    <WorkflowErrorState
      error={error}
      reset={reset}
      scope="my-sweeps"
      eyebrow="My Sweeps"
      title="Your sweep activity couldn’t load"
      description="Sweepza couldn’t assemble your saved, entered, ready-again, and history views. No activity was changed by this error."
      icon="sweeps"
      retryLabel="Retry My Sweeps"
      returnHref="/discover"
      returnLabel="Browse Discover"
    />
  );
}
