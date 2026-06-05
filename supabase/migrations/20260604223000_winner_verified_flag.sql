alter table winner_post
  add column if not exists verified_win boolean not null default false;
