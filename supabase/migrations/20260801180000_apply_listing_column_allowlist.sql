-- Re-applies the listing column allowlist from 20260801160000.
--
-- That migration was applied to production before the deploy that ships the
-- matching explicit column list in lib/db/listings.ts. Postgres expands
-- `select *` before checking privileges, so getPublicListings — which still
-- selected `*` at that moment — failed with 42501 and the public feed went
-- down until the table grant was restored. Route probes did not catch it
-- because Next served the affected pages from cache.
--
-- The rollback re-granted table-wide SELECT, so the allowlist has to be
-- re-applied. It cannot be done by re-running 20260801160000: that version is
-- already recorded in supabase_migrations.schema_migrations, so a replay of
-- the stack would skip it and the grant would silently stay wide. Hence this
-- separate, idempotent migration.
--
-- ORDER OF OPERATIONS (do not reverse):
--   1. Deploy the code that selects PUBLIC_LISTING_COLUMNS explicitly.  ← done
--   2. Confirm the deploy is serving.                                   ← done
--   3. Apply this migration.
--
-- lib/__tests__/public-grant-ratchet.test.ts fails if a star-select returns to
-- the client-role path, or if the selected list and this allowlist diverge.

revoke select on table public.listing from anon, authenticated;

grant select (
  id, slug, title, short_description, long_description,
  prize_name, prize_value, prize_currency, prize_category, winner_count,
  main_image_url, image_source_type, image_alt_text, category_fallback_image,
  image_attribution,
  entry_url, official_rules_url, start_date, end_date,
  entry_frequency, entry_limit_notes,
  eligibility_country, eligibility_states, age_requirement,
  no_purchase_necessary,
  source_type, public_source_label, created_by_role, created_by_user_id,
  host_id, sponsor_name, sponsor_url, sponsor_logo_url,
  lifecycle_status, visibility_status, moderation_status, duplicate_status,
  listing_verification_status, is_featured,
  created_at, updated_at, published_at, search_vector
) on table public.listing to anon, authenticated;
