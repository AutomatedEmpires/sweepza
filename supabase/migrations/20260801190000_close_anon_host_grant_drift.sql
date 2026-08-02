-- anon holds a table-level SELECT grant on public.host that the original
-- schema never gave it. 20260604120600_rls.sql granted `select, insert,
-- update, delete on host to authenticated` and deliberately routed public
-- reads through the host_public projection instead — anon was never named.
--
-- Nothing is exposed today: host's only SELECT policy is own-row-or-admin, so
-- an anonymous caller resolves zero rows (verified against production before
-- writing this). Public sponsor attribution comes from host_public, which
-- carries its own bounds. The grant is therefore unused surface area that
-- makes RLS the sole barrier where the design intended two, and it is what
-- supabase/tests/database/public_column_exposure_and_host_attribution.test.sql
-- already asserts is absent.
--
-- authenticated keeps its grant: host owners legitimately read their own row,
-- and the own-row policy is what scopes it.

revoke select on table public.host from anon;

comment on table public.host is
  'Host accounts. Public reads go through the host_public projection, never this table — anon holds no grant here (20260801190000). authenticated is scoped to its own row by RLS.';
