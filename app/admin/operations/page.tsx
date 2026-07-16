import { Icon } from "@/components/icon";
import { dryRunIngestion, type DryRunLeadResult } from "@/lib/ingestion/dry-run";
import {
  SAMPLE_DRY_RUN_LEADS,
  SAMPLE_REMINDER_INPUTS,
  SAMPLE_REMINDER_NOW,
} from "@/lib/ingestion/dry-run-samples";
import { previewReminderBatch, type PreviewListingVerdict } from "@/lib/reminder-preview";

export const metadata = {
  title: "Operations (dry run)",
  description: "Fixture-driven dry runs of ingestion and reminders — nothing is written or sent.",
};

export const dynamic = "force-dynamic";

const DISPOSITION_LABEL: Record<DryRunLeadResult["disposition"], string> = {
  would_create: "Would create",
  would_review: "Would hold for review",
  would_reject: "Would reject",
  would_skip_duplicate: "Would skip (duplicate)",
  would_skip_known: "Would skip (known)",
};

const DISPOSITION_TONE: Record<DryRunLeadResult["disposition"], string> = {
  would_create: "text-pine",
  would_review: "text-ember",
  would_reject: "text-flame",
  would_skip_duplicate: "text-graphite",
  would_skip_known: "text-graphite",
};

function DryRunSection() {
  const report = dryRunIngestion("sweeps_advantage", SAMPLE_DRY_RUN_LEADS);
  const t = report.totals;

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <div className="flex items-center gap-2">
        <Icon name="repeat" size={18} className="text-ember" />
        <h2 className="font-display text-lg font-bold text-ink">Ingestion dry run</h2>
      </div>
      <p className="mt-1 text-sm text-graphite">
        Replays the map → verify → dedupe → disposition stages against built-in sample extractions.
        No page is fetched, no model is called, and nothing is written.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-pill bg-paper px-2.5 py-1 font-semibold text-ink">{t.leads} leads</span>
        <span className="rounded-pill bg-pine/10 px-2.5 py-1 font-semibold text-pine">{t.wouldCreate} create</span>
        <span className="rounded-pill bg-ember/10 px-2.5 py-1 font-semibold text-ember">{t.wouldReview} review</span>
        <span className="rounded-pill bg-flame/10 px-2.5 py-1 font-semibold text-flame">{t.wouldReject} reject</span>
        <span className="rounded-pill bg-paper px-2.5 py-1 font-semibold text-graphite">{t.wouldSkipDuplicate} duplicate</span>
      </div>

      <ul className="mt-4 divide-y divide-line">
        {report.results.map((result) => (
          <li key={result.officialUrl} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {result.title ?? "(untitled)"}
              </span>
              <span className={`text-xs font-semibold ${DISPOSITION_TONE[result.disposition]}`}>
                {DISPOSITION_LABEL[result.disposition]}
                {result.disposition === "would_create" || result.disposition === "would_review"
                  ? ` · confidence ${result.confidence.toFixed(2)}`
                  : ""}
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-graphite">{result.officialUrl}</p>
            {result.hardFailures.length > 0 ? (
              <p className="mt-1 text-xs text-flame">held by: {result.hardFailures.join(", ")}</p>
            ) : null}
            {result.notes.length > 0 ? (
              <p className="mt-1 text-xs text-graphite">{result.notes.join(" ")}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const SUPPRESSION_LABEL: Record<NonNullable<PreviewListingVerdict["suppression"]>, string> = {
  won: "already won",
  skipped: "skipped",
  expired: "expired",
  not_tracked: "not tracked",
  window_not_open: "window not re-opened",
  not_in_window: "outside window",
  pref_off: "preference off",
  already_sent: "already sent",
};

function ReminderSection() {
  const preview = previewReminderBatch(SAMPLE_REMINDER_INPUTS, {
    now: SAMPLE_REMINDER_NOW,
    baseUrl: "https://sweepza.com",
  });
  const t = preview.totals;

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <div className="flex items-center gap-2">
        <Icon name="bell" size={18} className="text-ember" />
        <h2 className="font-display text-lg font-bold text-ink">Reminder preview</h2>
      </div>
      <p className="mt-1 text-sm text-graphite">
        Runs the reminder planner against sample seekers and renders the exact digest each would
        receive — with a reason for every listing that is suppressed. No email is sent.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-pill bg-paper px-2.5 py-1 font-semibold text-ink">{t.users} seekers</span>
        <span className="rounded-pill bg-pine/10 px-2.5 py-1 font-semibold text-pine">{t.usersEmailed} would email</span>
        <span className="rounded-pill bg-ember/10 px-2.5 py-1 font-semibold text-ember">{t.reminders} reminders</span>
        <span className="rounded-pill bg-paper px-2.5 py-1 font-semibold text-graphite">{t.suppressed} suppressed</span>
      </div>

      <div className="mt-4 space-y-4">
        {preview.users.map((user) => (
          <div key={user.userLabel} className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{user.userLabel}</span>
              {user.digest ? (
                <span className="rounded-pill bg-pine/10 px-2 py-0.5 text-[11px] font-semibold text-pine">
                  would send
                </span>
              ) : (
                <span className="rounded-pill bg-paper px-2 py-0.5 text-[11px] font-semibold text-graphite">
                  no email
                </span>
              )}
            </div>
            {user.digest ? (
              <p className="mt-1 text-sm text-ink">
                <span className="text-graphite">subject:</span> {user.digest.subject}
              </p>
            ) : null}
            <ul className="mt-2 space-y-1">
              {user.verdicts.map((v) => (
                <li key={v.listingId} className="flex items-center gap-2 text-xs">
                  <Icon
                    name={v.included ? "check" : "info"}
                    size={13}
                    className={v.included ? "text-pine" : "text-graphite"}
                  />
                  <span className="text-ink">{v.title}</span>
                  <span className="text-graphite">
                    — {v.included
                      ? `${v.reminderType?.replace("_", " ")} reminder`
                      : v.suppression
                        ? SUPPRESSION_LABEL[v.suppression]
                        : v.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOperationsPage() {
  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">Admin</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Operations</h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Dry-run views of the systems that stay dark until activation. Everything here is computed
          from built-in fixtures — no source is fetched, no listing is written, and no email is sent.
        </p>
      </header>

      <div className="mt-6 grid gap-5">
        <DryRunSection />
        <ReminderSection />
      </div>
    </section>
  );
}
