-- Give every existing unclaimed image-less listing an intentional, categorized
-- Sweepza fallback. This is idempotent and uses the same atomic RPC/attempt log
-- as ongoing ingestion; no source fetch or media provider is activated.

do $$
declare
  v_listing record;
  v_source_page_url text;
  v_fallback_url text;
  v_result jsonb;
  v_backfilled integer := 0;
begin
  for v_listing in
    select id, prize_category, entry_url, official_rules_url
      from public.listing
     where host_id is null
       and main_image_url is null
       and category_fallback_image is null
       and coalesce(image_source_type::text, '') not in ('host_upload', 'owner_upload')
     order by id
     for update
  loop
    v_source_page_url := coalesce(
      nullif(v_listing.entry_url, ''),
      nullif(v_listing.official_rules_url, ''),
      'unavailable'
    );
    v_fallback_url := '/api/images/listing-fallback/' || case
      when v_listing.prize_category in (
        'cash', 'gift_cards', 'travel', 'vehicles', 'electronics', 'outdoor',
        'home', 'food_beverage', 'fashion_beauty', 'family_kids',
        'experiences', 'seasonal', 'other'
      ) then v_listing.prize_category
      else 'other'
    end;

    v_result := public.finalize_listing_image(
      v_listing.id,
      jsonb_build_object(
        'sourcePageUrl', v_source_page_url,
        'finalStatus', 'generated_fallback',
        'fallbackUrl', v_fallback_url,
        'retryable', false,
        'processedAt', clock_timestamp(),
        'diagnostics', jsonb_build_array(jsonb_build_object(
          'url', v_source_page_url,
          'method', 'dom_hero',
          'score', 0,
          'role', 'primary',
          'rightsStatus', 'unknown',
          'status', 'rejected',
          'rejectionReason', 'media_storage_not_configured',
          'httpStatus', null,
          'finalUrl', null,
          'validation', null,
          'storageStatus', 'not_attempted'
        ))
      )
    );

    if coalesce((v_result ->> 'applied')::boolean, false) then
      v_backfilled := v_backfilled + 1;
    end if;
  end loop;

  raise notice 'Backfilled % listing fallback images', v_backfilled;
end;
$$;
