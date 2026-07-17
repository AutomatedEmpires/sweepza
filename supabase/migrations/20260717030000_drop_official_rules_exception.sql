-- Drop official_rules_exception, and hard-require an official rules URL to publish.
--
-- WHY THIS IS SAFE, AND WHY IT IS THE HONEST FIX
--
-- The column was an escape hatch that nothing could ever open:
--   * lib/host-listing-schema.ts:13  — officialRulesUrl: z.string().url()   (required)
--   * lib/admin-listing-schema.ts:13 — officialRulesUrl: z.string().url()   (required)
--   * no writer anywhere sets official_rules_exception true; the admin review
--     queue only READS it. It defaults false and stays false, forever.
--
-- So every listing that can exist already carries a rules URL. But its mere
-- EXISTENCE was load-bearing in the wrong direction: lib/category-hubs.ts banned
-- saying "official rules on every listing", and lib/__tests__/honest-copy.test.ts
-- banned an entire family of true statements, both citing "rare admin-approved
-- official-rules exceptions". The hatch was welded shut and we were still
-- apologising for it — while asserting "no purchase necessary" (which nothing
-- enforces at all) as though it were policy. Dropping the column makes the
-- rules claim TRUE rather than merely unstated, and removes the excuse.
--
-- Data risk: nil. The column is `not null default false` and no row can have
-- true (no writer exists). The listings table is empty in production today.
--
-- After this, listing_publish_guard() refuses to publish without a rules URL —
-- which is what the product already promised and the schemas already required.

-- 1. The guard: an official rules URL is now non-negotiable to go live.
create or replace function listing_publish_guard() returns trigger
language plpgsql as $$
begin
  if new.lifecycle_status = 'active' then
    if coalesce(new.title, '') = '' then raise exception 'publish blocked: title required'; end if;
    if coalesce(new.short_description, '') = '' then raise exception 'publish blocked: short_description required'; end if;
    if coalesce(new.prize_name, '') = '' then raise exception 'publish blocked: prize_name required'; end if;
    if new.main_image_url is null and new.category_fallback_image is null then
      raise exception 'publish blocked: main_image_url or category_fallback_image required';
    end if;
    if coalesce(new.entry_url, '') = '' then raise exception 'publish blocked: entry_url required'; end if;
    -- Was: `if new.official_rules_url is null and not new.official_rules_exception`.
    -- The exception was unreachable, so this is the rule that was always in force.
    if coalesce(new.official_rules_url, '') = '' then
      raise exception 'publish blocked: official_rules_url required';
    end if;
    if new.end_date is null or new.end_date < current_date then
      raise exception 'publish blocked: end_date must be present and in the future';
    end if;
    if new.entry_frequency is null then raise exception 'publish blocked: entry_frequency required'; end if;
    if coalesce(new.eligibility_country, '') = '' then raise exception 'publish blocked: eligibility_country required'; end if;
    if new.prize_category is null then raise exception 'publish blocked: prize_category required'; end if;
    if new.duplicate_status = 'confirmed' then raise exception 'publish blocked: confirmed duplicate'; end if;
    if new.moderation_status in ('action_taken', 'under_review') then raise exception 'publish blocked: moderation not clear'; end if;
    if new.visibility_status = 'hidden' then raise exception 'publish blocked: listing is hidden'; end if;
  end if;
  return new;
end;
$$;

-- 2. Drop the hatch. Guard no longer references it, so this cannot orphan the
--    trigger. Idempotent.
alter table public.listings
  drop column if exists official_rules_exception;
