-- Host Experience (Lane E): extend the privileged-field trigger to also guard
-- lifecycle_status transitions for host (non-service-role) writers.
--
-- The trigger bypasses enforcement when current_clerk_user_id() is null, which
-- is the case for service-role server actions. For any RLS-scoped host write,
-- privileged columns stay locked and lifecycle_status may only move along the
-- host-allowed transitions below.

create or replace function protect_listing_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service-role / system writes (no Clerk identity) bypass these guards.
  if current_clerk_user_id() is null then
    return new;
  end if;

  -- Privileged columns can never be changed by host-context writes.
  if new.moderation_status is distinct from old.moderation_status then
    -- Allow only the narrow host-driven moderation transitions.
    if not (
      (old.moderation_status in ('draft', 'clear') and new.moderation_status = 'submitted')
      or (old.moderation_status = 'held' and new.moderation_status = 'draft')
    ) then
      raise exception 'moderation_status transition % -> % not allowed for host', old.moderation_status, new.moderation_status;
    end if;
  end if;

  if new.listing_verification_status is distinct from old.listing_verification_status then
    raise exception 'listing_verification_status cannot be modified by host';
  end if;

  if new.is_featured is distinct from old.is_featured then
    raise exception 'is_featured cannot be modified by host';
  end if;

  if new.public_source_label is distinct from old.public_source_label then
    raise exception 'public_source_label cannot be modified by host';
  end if;

  if new.review_notes_internal is distinct from old.review_notes_internal then
    raise exception 'review_notes_internal cannot be modified by host';
  end if;

  -- Guard lifecycle_status transitions for host writers.
  if new.lifecycle_status is distinct from old.lifecycle_status then
    if not (
      (old.lifecycle_status = 'draft' and new.lifecycle_status = 'pending_review')
      or (old.lifecycle_status = 'active' and new.lifecycle_status = 'inactive')
      or (old.lifecycle_status = 'held' and new.lifecycle_status = 'draft')
    ) then
      raise exception 'lifecycle_status transition % -> % not allowed for host', old.lifecycle_status, new.lifecycle_status;
    end if;
  end if;

  return new;
end;
$$;
