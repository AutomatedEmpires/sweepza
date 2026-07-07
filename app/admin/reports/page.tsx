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
  low: "bg-moss/10 text-moss",
  medium: "bg-sky/10 text-sky",
  high: "bg-ember/10 text-ember",
  critical: "bg-ember text-cream",
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
        <h1 className="mt-1 text-2xl font-bold text-ink">Reports</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          Open reports awaiting a decision, grouped by what was reported.
          Dismiss false alarms or act to hide the offending content.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="mt-6 rounded-card border border-sand bg-white/80 p-5">
          <p className="text-sm text-ink/60">No open reports right now.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {TARGET_GROUPS.map((group) => {
            const rows = grouped.get(group.type) ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={group.type}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-ink/55">
                  {group.label} ({rows.length})
                </h2>
                <div className="overflow-x-auto rounded-card border border-sand bg-white/80">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-sand text-xs uppercase tracking-wide text-ink/55">
                        <th className="px-4 py-3 font-semibold">Reporter</th>
                        <th className="px-4 py-3 font-semibold">Reason</th>
                        <th className="px-4 py-3 font-semibold">Severity</th>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((report) => (
                        <tr
                          key={report.id}
                          className="border-b border-sand/70 align-top"
                        >
                          <td className="px-4 py-3 text-ink/80">
                            {report.reporter_display_name ?? "Unknown"}
                          </td>
                          <td className="px-4 py-3 capitalize text-ink/80">
                            {humanize(report.reason_code)}
                          </td>
                          <td className="px-4 py-3">
                            {report.ai_severity ? (
                              <span
                                className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_CLASSES[report.ai_severity]}`}
                              >
                                {report.ai_severity}
                              </span>
                            ) : (
                              <span className="text-ink/55">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink/70">
                            {formatDate(report.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <AdminReportActions
                              reportId={report.id}
                              targetType={report.target_type}
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
