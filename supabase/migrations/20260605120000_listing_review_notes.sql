-- Host-submitted listing review notes (additive, non-destructive).
-- Adds an internal-only note field used by the owner/admin review workflow
-- when rejecting or holding host-submitted listings. Kept separate from
-- sponsor_notes_internal so sponsor context and review decisions don't mix.

alter table listing
  add column if not exists review_notes_internal text;

comment on column listing.review_notes_internal is
  'Internal owner/admin review notes for host-submitted listings; never exposed publicly.';
