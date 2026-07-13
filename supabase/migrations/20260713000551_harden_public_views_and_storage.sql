-- Make the public host projection honor the querying role's permissions and RLS.
alter view public.host_public set (security_invoker = true);

-- Public buckets serve object URLs without a broad SELECT policy. Removing this
-- policy prevents anonymous clients from listing every host-logo object.
drop policy if exists host_logo_read on storage.objects;

-- This function is trigger-only and must not be exposed as a Data API RPC.
revoke execute on function public.protect_listing_privileged_fields() from public, anon, authenticated;
