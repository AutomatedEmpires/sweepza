alter table listing_seeker_state
  add column if not exists is_saved boolean not null default false;

update listing_seeker_state
set is_saved = true
where saved_at is not null and is_saved = false;
