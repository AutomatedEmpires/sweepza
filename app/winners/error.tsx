"use client";

import {
  WorkflowErrorState,
  type WorkflowErrorProps,
} from "@/components/workflow-error-state";

export default function WinnersError({
  error,
  reset,
}: WorkflowErrorProps) {
  return (
    <WorkflowErrorState
      error={error}
      reset={reset}
      scope="winners"
      eyebrow="Winner Wall"
      title="Winner stories couldn’t load"
      description="Sweepza couldn’t open the published Winner Wall. No winner submission was changed by this error."
      icon="trophy"
      retryLabel="Retry Winner Wall"
      returnHref="/discover"
      returnLabel="Browse sweepstakes"
    />
  );
}
