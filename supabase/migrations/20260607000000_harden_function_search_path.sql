-- Harden mutable search_path on trigger/utility functions.
-- Supabase security advisor: function_search_path_mutable.
--
-- The identity helpers (current_clerk_user_id, current_app_user_id, is_owner,
-- is_admin, is_host, current_host_id) already pin search_path = public, pg_temp.
-- The six trigger/utility functions below were created without it. Pinning them
-- to the same value is non-breaking: public stays first on the search path, so
-- every unqualified reference (tables, now(), current_date, helper functions)
-- continues to resolve exactly as before, while the search path can no longer be
-- mutated by a caller's session settings.

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.listing_publish_guard() set search_path = public, pg_temp;
alter function public.enforce_active_listing_cap() set search_path = public, pg_temp;
alter function public.protect_listing_privileged_fields() set search_path = public, pg_temp;
alter function public.protect_app_user_roles() set search_path = public, pg_temp;
alter function public.apply_listing_claim() set search_path = public, pg_temp;
