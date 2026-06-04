-- Row Level Security per the Role Access Matrix (Canonical Data Model 13-14).
-- service_role bypasses RLS for trusted server tasks (seeding, webhooks).

grant usage on schema public to anon, authenticated;

-- Public host projection (excludes stripe_customer_id + audit columns).
create view host_public as
  select id, display_name, logo_url, website_url, short_description, verification_status
  from host;

-- Dictionaries: world-readable, owner/admin-writable.
alter table category enable row level security;
alter table tag enable row level security;
alter table badge enable row level security;
alter table eligibility enable row level security;
create policy category_read on category for select using (true);
create policy tag_read on tag for select using (true);
create policy badge_read on badge for select using (true);
create policy eligibility_read on eligibility for select using (true);
create policy category_write on category for all using (is_owner() or is_admin()) with check (is_owner() or is_admin());
create policy tag_write on tag for all using (is_owner() or is_admin()) with check (is_owner() or is_admin());
create policy badge_write on badge for all using (is_owner() or is_admin()) with check (is_owner() or is_admin());
create policy eligibility_write on eligibility for all using (is_owner() or is_admin()) with check (is_owner() or is_admin());
grant select on category, tag, badge, eligibility, host_public to anon, authenticated;
grant insert, update, delete on category, tag, badge, eligibility to authenticated;

-- app_user
alter table app_user enable row level security;
create policy app_user_select on app_user for select
  using (clerk_user_id = current_clerk_user_id() or is_owner() or is_admin());
create policy app_user_insert on app_user for insert
  with check (clerk_user_id = current_clerk_user_id() or is_owner() or is_admin());
create policy app_user_update on app_user for update
  using (clerk_user_id = current_clerk_user_id() or is_owner() or is_admin())
  with check (clerk_user_id = current_clerk_user_id() or is_owner() or is_admin());
grant select, insert, update on app_user to authenticated;

-- host (base table restricted; public reads via host_public view)
alter table host enable row level security;
create policy host_select on host for select
  using (app_user_id = current_app_user_id() or is_owner() or is_admin());
create policy host_write on host for all
  using (app_user_id = current_app_user_id() or is_owner() or is_admin())
  with check (app_user_id = current_app_user_id() or is_owner() or is_admin());
grant select, insert, update, delete on host to authenticated;

-- listing
alter table listing enable row level security;
create policy listing_public_select on listing for select using (
  (visibility_status = 'public' and lifecycle_status = 'active'
    and moderation_status not in ('under_review', 'action_taken'))
  or is_owner() or is_admin()
  or (host_id is not null and host_id = current_host_id())
);
create policy listing_owner_admin_write on listing for all
  using (is_owner() or is_admin())
  with check (is_owner() or is_admin());
create policy listing_host_insert on listing for insert
  with check (is_host() and host_id = current_host_id()
    and source_type = 'host_submitted' and created_by_role = 'host');
create policy listing_host_update on listing for update
  using (is_host() and host_id = current_host_id())
  with check (is_host() and host_id = current_host_id());
create policy listing_host_delete on listing for delete
  using (is_host() and host_id = current_host_id());
grant select, insert, update, delete on listing to authenticated;

-- listing_tag (follows the parent listing)
alter table listing_tag enable row level security;
create policy listing_tag_select on listing_tag for select using (
  exists (select 1 from listing l where l.id = listing_id and (
    (l.visibility_status = 'public' and l.lifecycle_status = 'active'
      and l.moderation_status not in ('under_review','action_taken'))
    or is_owner() or is_admin() or l.host_id = current_host_id()))
);
create policy listing_tag_write on listing_tag for all using (
  is_owner() or is_admin()
  or exists (select 1 from listing l where l.id = listing_id and l.host_id = current_host_id())
) with check (
  is_owner() or is_admin()
  or exists (select 1 from listing l where l.id = listing_id and l.host_id = current_host_id())
);
grant select, insert, update, delete on listing_tag to authenticated;

-- listing_seeker_state (row-owner only; admin read)
alter table listing_seeker_state enable row level security;
create policy seeker_state_owner on listing_seeker_state for all
  using (app_user_id = current_app_user_id())
  with check (app_user_id = current_app_user_id());
create policy seeker_state_admin_read on listing_seeker_state for select
  using (is_admin() or is_owner());
grant select, insert, update, delete on listing_seeker_state to authenticated;

-- winner_post
alter table winner_post enable row level security;
create policy winner_post_select on winner_post for select using (
  review_status = 'published' or app_user_id = current_app_user_id() or is_admin() or is_owner()
);
create policy winner_post_insert on winner_post for insert
  with check (app_user_id = current_app_user_id());
create policy winner_post_update on winner_post for update
  using (app_user_id = current_app_user_id() or is_admin() or is_owner())
  with check (app_user_id = current_app_user_id() or is_admin() or is_owner());
create policy winner_post_delete on winner_post for delete
  using (is_admin() or is_owner());
grant select on winner_post to anon, authenticated;
grant insert, update, delete on winner_post to authenticated;

-- winner_reaction
alter table winner_reaction enable row level security;
create policy winner_reaction_select on winner_reaction for select using (true);
create policy winner_reaction_write on winner_reaction for all
  using (app_user_id = current_app_user_id())
  with check (app_user_id = current_app_user_id());
grant select on winner_reaction to anon, authenticated;
grant insert, update, delete on winner_reaction to authenticated;

-- report (reporter creates own; admin manages)
alter table report enable row level security;
create policy report_insert on report for insert
  with check (reporter_user_id = current_app_user_id());
create policy report_select on report for select
  using (reporter_user_id = current_app_user_id() or is_admin() or is_owner());
create policy report_update on report for update
  using (is_admin()) with check (is_admin());
grant select, insert, update on report to authenticated;

-- listing_claim (host requests own; owner/admin approve)
alter table listing_claim enable row level security;
create policy listing_claim_insert on listing_claim for insert
  with check (requesting_host_id = current_host_id());
create policy listing_claim_select on listing_claim for select
  using (requesting_host_id = current_host_id() or is_admin() or is_owner());
create policy listing_claim_update on listing_claim for update
  using (is_admin() or is_owner()) with check (is_admin() or is_owner());
grant select, insert, update on listing_claim to authenticated;

-- subscription & boost (host-owned; admin/owner read)
alter table subscription enable row level security;
create policy subscription_owner on subscription for all
  using (host_id = current_host_id() or is_admin() or is_owner())
  with check (host_id = current_host_id() or is_admin() or is_owner());
grant select, insert, update, delete on subscription to authenticated;

alter table boost enable row level security;
create policy boost_owner on boost for all
  using (host_id = current_host_id() or is_admin() or is_owner())
  with check (host_id = current_host_id() or is_admin() or is_owner());
grant select, insert, update, delete on boost to authenticated;

-- notifications (row-owner)
alter table notification_pref enable row level security;
create policy notification_pref_owner on notification_pref for all
  using (app_user_id = current_app_user_id() or is_admin() or is_owner())
  with check (app_user_id = current_app_user_id() or is_admin() or is_owner());
grant select, insert, update, delete on notification_pref to authenticated;

alter table notification_log enable row level security;
create policy notification_log_owner on notification_log for select
  using (app_user_id = current_app_user_id() or is_admin() or is_owner());
grant select on notification_log to authenticated;
