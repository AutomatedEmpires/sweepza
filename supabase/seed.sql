-- Local/dev sample data only (run via `supabase db reset`). Not for production.
-- Creates a dev owner/admin and two published owner-seeded listings so the app
-- has content before Clerk + real hosts exist. Runs as the postgres role, so the
-- privileged-field guard is bypassed (no JWT) and verified status is allowed.

insert into app_user (id, clerk_user_id, email, display_name, is_owner, is_admin, is_host, is_seeker)
values ('00000000-0000-0000-0000-000000000001', 'dev_owner', 'jackson@automatedempires.com', 'Sweepza Owner', true, true, false, true)
on conflict (clerk_user_id) do nothing;

insert into listing (
  id, slug, title, short_description, prize_name, prize_value, prize_currency, prize_category,
  main_image_url, image_source_type, entry_url, official_rules_url, end_date, entry_frequency,
  eligibility_country, source_type, public_source_label, created_by_role, created_by_user_id,
  lifecycle_status, visibility_status, listing_verification_status, published_at
) values
(
  '00000000-0000-0000-0000-0000000000a1', 'dream-cash-10k',
  'Win $10,000 Dream Cash', 'Enter daily for a shot at ten grand. No purchase necessary.',
  '$10,000 Cash', 10000, 'USD', 'cash',
  'https://images.example.com/cash.jpg', 'photo_bucket',
  'https://example.com/enter/dream-cash', 'https://example.com/rules/dream-cash',
  (current_date + interval '5 days')::date, 'daily',
  'US', 'owner_seeded', 'found_by_sweepza', 'owner', '00000000-0000-0000-0000-000000000001',
  'active', 'public', 'verified', now()
),
(
  '00000000-0000-0000-0000-0000000000a2', 'maui-getaway',
  'Maui Getaway for Two', 'A 7-night island escape with flights included.',
  'Maui Vacation Package', 8500, 'USD', 'travel',
  'https://images.example.com/maui.jpg', 'photo_bucket',
  'https://example.com/enter/maui', 'https://example.com/rules/maui',
  (current_date + interval '20 days')::date, 'one_time',
  'US', 'owner_seeded', 'found_by_sweepza', 'owner', '00000000-0000-0000-0000-000000000001',
  'active', 'public', 'reviewed', now()
)
on conflict (slug) do nothing;
