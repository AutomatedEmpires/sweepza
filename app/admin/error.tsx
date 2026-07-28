"use client";

import {
  WorkflowErrorState,
  type WorkflowErrorProps,
} from "@/components/workflow-error-state";

export default function AdminError({
  error,
  reset,
}: WorkflowErrorProps) {
  return (
    <WorkflowErrorState
      error={error}
      reset={reset}
      scope="admin"
      eyebrow="Admin operations"
      title="The command center couldn’t load"
      description="Sweepza couldn’t open the current operational queues and platform snapshot. No review or moderation action was taken by this error."
      icon="shield"
      retryLabel="Retry command center"
      returnHref="/profile"
      returnLabel="Go to Profile"
    />
  );
}
