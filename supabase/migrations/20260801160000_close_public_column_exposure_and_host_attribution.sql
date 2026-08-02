-- Three grant/policy corrections found by the whole-product audit. All are
-- forward-only, and none changes what any current surface can render.
--
-- 1. Operator-only listing notes were readable by every anonymous visitor.
-- 2. Public host attribution has been structurally dead since host_public was
--    switched to security_invoker.
-- 3. anon held write grants that authenticated does not, inverting the
--    intended privilege order.

-- 1 ---------------------------------------------------------------------
-- listing.review_notes, review_notes_internal, and sponsor_notes_internal are
-- operator workspace, and their column comments have always said so. But the
-- public listing policy exposes every published row to anon, and the SELECT
-- grant was table-wide, so `select review_notes_internal from listing` already
-- succeeds for the anon key today. It returns nulls only because no operator
-- has written a note yet — the first one would be world-readable.
--
-- RLS filters rows and never columns, so a column-level grant is the only
-- control that can scope this. Postgres cannot subtract a column from a
-- table-wide grant, so the table grant is replaced by an explicit allowlist.
-- That also makes the allowlist the default posture: a column added later is
-- not public until someone adds it here deliberately.
--
-- ORDERING: apply this migration only AFTER the deploy that ships the matching
-- explicit column list in lib/db/listings.ts. Postgres expands `select *`
-- before checking privileges, so a star select against a column-scoped grant
-- fails the entire query with 42501 — narrowing a grant under running code
-- that still selects `*` takes the public feed down.
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

-- All three readers already go through the service role, so removing the
-- client grants changes no behavior: lib/db/listing-review.ts (operator queue)
-- and lib/db/host-dashboard.ts (the host's own reviewer feedback) both use
-- createServiceRoleClient.
comment on column public.listing.review_notes_internal is
  'Internal owner/admin review notes; never exposed publicly. Read via the service role only — not granted to anon/authenticated (20260801160000).';
comment on column public.listing.sponsor_notes_internal is
  'Internal sponsor context; never exposed publicly. Read via the service role only — not granted to anon/authenticated (20260801160000).';
comment on column public.listing.review_notes is
  'Host-visible reviewer feedback, surfaced to the owning host through the server. Not public: read via the service role only, not granted to anon/authenticated (20260801160000).';

-- 2 ---------------------------------------------------------------------
-- host_public was created as "the public host projection (excludes
-- stripe_customer_id + audit columns)" and granted to anon. 20260713000551
-- then set security_invoker = true, so the view began running under the
-- caller's own RLS — and host's only SELECT policy is own-row-or-admin.
-- A visitor therefore resolves zero host rows, and a host-submitted listing
-- can never display its sponsor's name, logo, or verified badge. Production
-- has no hosts yet, which is the only reason this is invisible rather than a
-- visible product bug.
--
-- The fix keeps the exposure in the view rather than opening the base table.
-- A base-table policy would be role-blind: any signed-in seeker would then
-- read every column of any host with a public listing, stripe_customer_id
-- included. Instead the view itself carries both bounds the product needs —
-- the six safe columns, and only hosts that have chosen to publish — and runs
-- as its owner so those bounds are the whole exposure rather than a filter on
-- top of an already-open table.
-- security_barrier: the WHERE clause is this view's access control, so a
-- caller-supplied function or operator must not be pushed ahead of it and
-- observe a private host through an error message or timing side channel.
create or replace view public.host_public
with (security_invoker = false, security_barrier = true)
as
select
  host.id,
  host.display_name,
  host.logo_url,
  host.website_url,
  host.short_description,
  host.verification_status
from public.host
where exists (
  select 1
    from public.listing
   where listing.host_id = host.id
     -- The full public-listing boundary, matching listing_public_select. A
     -- narrower predicate would keep a sponsor visible after its only listing
     -- expired or was pulled into moderation.
     and listing.visibility_status = 'public'
     and listing.lifecycle_status = 'active'
     and (listing.end_date::timestamp at time zone 'UTC')
           + interval '36 hours' > clock_timestamp()
     and listing.listing_verification_status in ('reviewed', 'verified')
     and listing.moderation_status not in ('under_review', 'action_taken')
);

comment on view public.host_public is
  'Public sponsor attribution: six safe columns, and only hosts with a live public listing. Runs as owner deliberately — the WHERE clause and column list ARE the access control, so host stays own-row-only for every client role.';

revoke all on table public.host_public from public, anon, authenticated, service_role;
grant select on table public.host_public to anon, authenticated, service_role;

-- 3 ---------------------------------------------------------------------
-- 20260721225954 revoked client write grants but named only `authenticated`,
-- leaving anon with insert/update/delete (and truncate, which RLS never
-- filters) on eleven core tables. Nothing is exploitable today because every
-- write policy demands a Clerk identity and no code path writes as anon —
-- user writes go through server routes. But the architecture intends two
-- barriers here and currently has one, and tables added since received the
-- symmetric revoke, which is what marks this as drift rather than intent.
--
-- No grant is added below. authenticated's current write set is deliberate
-- and is left exactly as it stands.
revoke insert, update, delete, truncate on table
  public.boost,
  public.host,
  public.listing,
  public.listing_claim,
  public.listing_seeker_state,
  public.listing_tag,
  public.report,
  public.seeker_entry_event,
  public.subscription,
  public.winner_post,
  public.winner_reaction
from anon;

revoke truncate on table
  public.boost,
  public.host,
  public.listing,
  public.listing_claim,
  public.listing_seeker_state,
  public.listing_tag,
  public.report,
  public.seeker_entry_event,
  public.subscription,
  public.winner_post,
  public.winner_reaction
from authenticated;
