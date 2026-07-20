-- Paid listing capacity is an entitlement, not a property of merely having a
-- subscription row. Only active subscriptions and the explicit grace state may
-- use their paid cap. no_plan, past_due, and canceled rows fall back to the
-- single free host-submitted listing.
--
-- Existing active listings are not deleted or demoted. The trigger applies on
-- future inserts/updates; any downshift remediation remains an explicit
-- operator/product decision.

create or replace function enforce_active_listing_cap() returns trigger
language plpgsql as $$
declare
  cap int;
  active_count int;
begin
  if new.lifecycle_status = 'active' and new.host_id is not null and new.source_type = 'host_submitted' then
    select
      case
        when status in ('active', 'grace') then max_active_listings
        else 1
      end
    into cap
    from subscription
    where host_id = new.host_id
    order by created_at desc
    limit 1;

    cap := coalesce(cap, 1);

    select count(*) into active_count from listing
      where host_id = new.host_id and lifecycle_status = 'active' and id <> new.id;
    if active_count + 1 > cap then
      raise exception 'publish blocked: active listing cap (%) exceeded', cap;
    end if;
  end if;
  return new;
end;
$$;
