-- Add leading btree indexes for the 11 foreign-key columns in the historical
-- Supabase performance-advisor snapshot plus two uncovered foreign keys added
-- later. A complete disposable PostgreSQL 17 replay of the current migration
-- chain confirms these are all 13 current gaps.
--
-- These indexes reduce sequential scans and lock duration for FK parent-row
-- checks and reverse lookups. They are additive schema/performance changes,
-- not behavior-neutral: each index consumes storage, adds write maintenance,
-- and takes a creation lock while this migration runs. Production application
-- therefore remains a separate reviewed and authorized operation.
--
-- Plain CREATE INDEX is intentional. An unexpected same-name object should
-- fail closed for investigation rather than make IF NOT EXISTS silently accept
-- a mismatched definition.
--
-- RLS policy consolidation, unused-index findings, and dashboard-level
-- connection settings are outside this focused migration.

create index boost_host_id_idx on public.boost (host_id);
create index listing_created_by_user_id_idx on public.listing (created_by_user_id);
create index listing_claim_requesting_host_id_idx on public.listing_claim (requesting_host_id);
create index listing_claim_reviewed_by_idx on public.listing_claim (reviewed_by);
create index listing_duplicate_candidate_other_listing_id_idx on public.listing_duplicate_candidate (other_listing_id);
create index listing_tag_tag_code_idx on public.listing_tag (tag_code);
create index report_assigned_admin_id_idx on public.report (assigned_admin_id);
create index report_reporter_user_id_idx on public.report (reporter_user_id);
create index tag_category_code_idx on public.tag (category_code);
create index seeker_entry_event_listing_id_idx on public.seeker_entry_event (listing_id);
create index winner_post_app_user_id_idx on public.winner_post (app_user_id);
create index winner_post_listing_id_idx on public.winner_post (listing_id);
create index winner_reaction_app_user_id_idx on public.winner_reaction (app_user_id);
