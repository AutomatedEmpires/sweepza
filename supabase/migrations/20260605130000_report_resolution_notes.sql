-- Report resolution notes (additive, non-destructive).
-- Adds an internal-only note field used by the owner/admin reports queue when
-- triaging, resolving, or dismissing community reports. Mirrors the
-- listing.review_notes_internal pattern; never exposed publicly.

alter table report
  add column if not exists resolution_notes_internal text;

comment on column report.resolution_notes_internal is
  'Internal owner/admin notes recorded while triaging or resolving a report; never exposed publicly.';
