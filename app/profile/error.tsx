"use client";

import {
  WorkflowErrorState,
  type WorkflowErrorProps,
} from "@/components/workflow-error-state";

export default function ProfileError({
  error,
  reset,
}: WorkflowErrorProps) {
  return (
    <WorkflowErrorState
      error={error}
      reset={reset}
      scope="profile"
      eyebrow="Profile"
      title="Your profile couldn’t load"
      description="Sweepza couldn’t open your account and preference center. No profile or reminder setting was changed by this error."
      icon="profile"
      retryLabel="Retry Profile"
      returnHref="/my-sweeps"
      returnLabel="Go to My Sweeps"
    />
  );
}
