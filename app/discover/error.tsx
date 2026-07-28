"use client";

import {
  WorkflowErrorState,
  type WorkflowErrorProps,
} from "@/components/workflow-error-state";

export default function DiscoverError({
  error,
  reset,
}: WorkflowErrorProps) {
  return (
    <WorkflowErrorState
      error={error}
      reset={reset}
      scope="discover"
      eyebrow="Discover"
      title="Discover couldn’t refresh"
      description="Sweepza couldn’t load the current listings and filters. Try the feed again, or return to Today while this view recovers."
      icon="discover"
      retryLabel="Retry Discover"
      returnHref="/"
      returnLabel="Go to Today"
    />
  );
}
