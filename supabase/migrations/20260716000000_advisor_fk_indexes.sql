-- Clear the 11 unindexed_foreign_keys [INFO] findings from the Supabase
-- performance advisor (2026-07-16 snapshot).
--
-- Covering indexes for every flagged FK column. These turn FK integrity
-- checks and the app's reverse lookups (reports by reporter, winner posts by
-- listing/user, tags by code, claims by host) into index scans instead of
-- sequential scans, and keep parent-row deletes from locking full child-table
-- scans.
--
-- Purely additive — no policy, table, or data changes. Verified 2026-07-16 by
-- dry-running this DDL against the live project inside a rolled-back
-- transaction (all 11 indexes created cleanly, then rolled back).
--
-- NOT DONE HERE (deliberately):
--   * 72x multiple_permissive_policies [WARN] — RLS policy consolidation is
--     security-sensitive and ships separately for focused review.
--   * unused_index [INFO] x3 on listing_end_date_idx / listing_category_idx /
--     listing_search_idx — "unused" only reflects the zero-traffic pre-launch
--     window; these back the feed sort, category filter, and full-text search.
--   * auth_db_connections_absolute [INFO] — dashboard configuration, not DDL.

create index if not exists boost_host_id_idx on public.boost (host_id);
create index if not exists listing_created_by_user_id_idx on public.listing (created_by_user_id);
create index if not exists listing_claim_requesting_host_id_idx on public.listing_claim (requesting_host_id);
create index if not exists listing_claim_reviewed_by_idx on public.listing_claim (reviewed_by);
create index if not exists listing_tag_tag_code_idx on public.listing_tag (tag_code);
create index if not exists report_assigned_admin_id_idx on public.report (assigned_admin_id);
create index if not exists report_reporter_user_id_idx on public.report (reporter_user_id);
create index if not exists tag_category_code_idx on public.tag (category_code);
create index if not exists winner_post_app_user_id_idx on public.winner_post (app_user_id);
create index if not exists winner_post_listing_id_idx on public.winner_post (listing_id);
create index if not exists winner_reaction_app_user_id_idx on public.winner_reaction (app_user_id);
