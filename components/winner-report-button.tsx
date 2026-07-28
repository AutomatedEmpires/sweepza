"use client";

import { ReportProblemButton } from "@/components/report-problem-button";
import type { ReportReason } from "@/lib/db/enums";

const WINNER_REPORT_REASONS = [
  "fake_winner_claim",
  "inappropriate_image",
  "spam",
  "host_advertising_winner_wall",
  "other",
] as const satisfies readonly ReportReason[];

export function WinnerReportButton({
  winnerPostId,
  clerkConfigured,
  isSignedIn,
}: {
  winnerPostId: string;
  clerkConfigured: boolean;
  isSignedIn: boolean;
}) {
  return (
    <ReportProblemButton
      targetType="winner_post"
      targetId={winnerPostId}
      clerkConfigured={clerkConfigured}
      isSignedIn={isSignedIn}
      reasons={WINNER_REPORT_REASONS}
      defaultReason="fake_winner_claim"
      triggerLabel="Report problem"
      dialogTitle="Report this winner story"
      dialogDescription="Flag a suspicious claim, inappropriate image, spam, or promotional post for Sweepza moderation."
      signInDescription="Sign in to send this winner story to the Sweepza moderation team."
    />
  );
}
