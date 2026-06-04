-- Starter sample data for local/dev and linked sandbox environments.
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
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 1200 900%27%3E%3Cdefs%3E%3ClinearGradient id=%27bg%27 x1=%270%27 y1=%270%27 x2=%271%27 y2=%271%27%3E%3Cstop stop-color=%27%231D4ED8%27/%3E%3Cstop offset=%271%27 stop-color=%27%230F172A%27/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%271200%27 height=%27900%27 fill=%27url(%23bg)%27/%3E%3Ccircle cx=%271000%27 cy=%27160%27 r=%27110%27 fill=%27rgba(255,255,255,0.12)%27/%3E%3Ctext x=%2790%27 y=%27390%27 fill=%27white%27 font-family=%27Arial,sans-serif%27 font-size=%2784%27 font-weight=%27700%27%3EWin $10,000%3C/text%3E%3Ctext x=%2790%27 y=%27498%27 fill=%27white%27 font-family=%27Arial,sans-serif%27 font-size=%27118%27 font-weight=%27800%27%3EDream Cash%3C/text%3E%3Ctext x=%2790%27 y=%27582%27 fill=%27%23DBEAFE%27 font-family=%27Arial,sans-serif%27 font-size=%2738%27%3EDaily entry • No purchase necessary%3C/text%3E%3C/svg%3E', 'photo_bucket',
  'https://example.com/enter/dream-cash', 'https://example.com/rules/dream-cash',
  (current_date + interval '5 days')::date, 'daily',
  'US', 'owner_seeded', 'found_by_sweepza', 'owner', '00000000-0000-0000-0000-000000000001',
  'active', 'public', 'verified', now()
),
(
  '00000000-0000-0000-0000-0000000000a2', 'maui-getaway',
  'Maui Getaway for Two', 'A 7-night island escape with flights included.',
  'Maui Vacation Package', 8500, 'USD', 'travel',
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 1200 900%27%3E%3Cdefs%3E%3ClinearGradient id=%27bg%27 x1=%270%27 y1=%270%27 x2=%271%27 y2=%271%27%3E%3Cstop stop-color=%27%230EA5E9%27/%3E%3Cstop offset=%271%27 stop-color=%27%23158F77%27/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%271200%27 height=%27900%27 fill=%27url(%23bg)%27/%3E%3Ccircle cx=%27970%27 cy=%27170%27 r=%27120%27 fill=%27rgba(255,255,255,0.18)%27/%3E%3Ctext x=%2790%27 y=%27390%27 fill=%27white%27 font-family=%27Arial,sans-serif%27 font-size=%2780%27 font-weight=%27700%27%3EMaui Getaway%3C/text%3E%3Ctext x=%2790%27 y=%27498%27 fill=%27white%27 font-family=%27Arial,sans-serif%27 font-size=%27116%27 font-weight=%27800%27%3Efor Two%3C/text%3E%3Ctext x=%2790%27 y=%27582%27 fill=%27%23ECFEFF%27 font-family=%27Arial,sans-serif%27 font-size=%2738%27%3E7 nights • Flights included%3C/text%3E%3C/svg%3E', 'photo_bucket',
  'https://example.com/enter/maui', 'https://example.com/rules/maui',
  (current_date + interval '20 days')::date, 'one_time',
  'US', 'owner_seeded', 'found_by_sweepza', 'owner', '00000000-0000-0000-0000-000000000001',
  'active', 'public', 'reviewed', now()
)
on conflict (slug) do update
set
  title = excluded.title,
  short_description = excluded.short_description,
  prize_name = excluded.prize_name,
  prize_value = excluded.prize_value,
  prize_currency = excluded.prize_currency,
  prize_category = excluded.prize_category,
  main_image_url = excluded.main_image_url,
  image_source_type = excluded.image_source_type,
  entry_url = excluded.entry_url,
  official_rules_url = excluded.official_rules_url,
  end_date = excluded.end_date,
  entry_frequency = excluded.entry_frequency,
  eligibility_country = excluded.eligibility_country,
  source_type = excluded.source_type,
  public_source_label = excluded.public_source_label,
  created_by_role = excluded.created_by_role,
  created_by_user_id = excluded.created_by_user_id,
  lifecycle_status = excluded.lifecycle_status,
  visibility_status = excluded.visibility_status,
  listing_verification_status = excluded.listing_verification_status,
  published_at = excluded.published_at;
