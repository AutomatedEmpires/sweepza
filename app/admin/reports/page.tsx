import { Icon } from "@/components/icon";
import { AdminReportActions } from "@/components/admin-report-actions";
import { getOpenReports, type AdminReportRow } from "@/lib/db/admin";
import type { ReportAiSeverity, ReportTargetType } from "@/lib/db/enums";

export const metadata = {
  title: "Admin Reports",
  description: "Triage open Sweepza reports grouped by target type.",
};

export const dynamic = "force-dynamic";

const TARGET_GROUPS: { type: ReportTargetType; label: string }[] = [
  { type: "listing", label: "Listings" },
  { type: "host", label: "Hosts" },
  { type: "winner_post", label: "Winner posts" },
  { type: "image", label: "Images" },
  { type: "entry_link", label: "Entry links" },
];

const SEVERITY_CLASSES: Record<ReportAiSeverity, string> = {
  low: "bg-pine/10 text-pine",
  medium: "bg-ocean/10 text-ocean",
  high: "bg-flame/10 text-flame",
  critical: "bg-flame text-on-urgent",
};

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AdminReportsPage() {
  const reports = await getOpenReports();
  const grouped = new Map<ReportTargetType, AdminReportRow[]>();
  for (const report of reports) {
    const existing = grouped.get(report.target_type) ?? [];
    existing.push(report);
    grouped.set(report.target_type, existing);
  }

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          Reports
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Open reports awaiting a decision, grouped by what was reported.
          Dismiss false alarms or act to hide the offending content.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 rounded-card border border-pine/30 bg-pine/5 p-5">
          <Icon name="check" size={18} className="text-pine" />
          <p className="text-sm font-medium text-pine">
            Queue clear — no open reports.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {TARGET_GROUPS.map((group) => {
            const rows = grouped.get(group.type) ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={group.type}>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">
                  {group.label} ({rows.length})
                </h2>
                <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-e1">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs uppercase tracking-wide text-graphite">
                        <th className="px-4 py-3 font-semibold">Reporter</th>
                        <th className="px-4 py-3 font-semibold">Reason</th>
                        <th className="px-4 py-3 font-semibold">Details / target</th>
                        <th className="px-4 py-3 font-semibold">Severity</th>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((report) => (
                        <tr
                          key={report.id}
                          className="border-b border-line align-top"
                        >
                          <td className="px-4 py-3 text-graphite">
                            {report.reporter_display_name ?? "Unknown"}
                          </td>
                          <td className="px-4 py-3 capitalize text-graphite">
                            {humanize(report.reason_code)}
                          </td>
                          <td className="max-w-xs px-4 py-3 text-graphite">
                            {report.target_href ? (
                              <a href={report.target_href} target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-line underline-offset-2">
                                {report.target_label}
                              </a>
                            ) : (
                              <p className="font-semibold text-ink">{report.target_label}</p>
                            )}
                            {report.target_context ? <p className="mt-1 text-xs">{report.target_context}</p> : null}
                            <p className="whitespace-pre-wrap">{report.details ?? "No additional details"}</p>
                            <p className="mt-1 font-mono text-[10px] text-graphite/70">{report.target_id}</p>
                          </td>
                          <td className="px-4 py-3">
                            {report.ai_severity ? (
                              <span
                                className={`rounded-pill px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_CLASSES[report.ai_severity]}`}
                              >
                                {report.ai_severity}
                              </span>
                            ) : (
                              <span className="text-graphite">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-graphite">
                            {formatDate(report.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <AdminReportActions
                              reportId={report.id}
                              targetType={report.target_type}
                              targetLabel={report.target_label}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
