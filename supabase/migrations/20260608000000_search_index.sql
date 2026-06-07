-- Full-text search index for Sweepza listings.
-- Adds a generated tsvector column and GIN index for websearch queries.

ALTER TABLE listing
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(host_name, '') || ' ' ||
    coalesce(prize_category::text, '')
  )
) STORED;

CREATE INDEX IF NOT EXISTS listing_search_idx
ON listing
USING GIN(search_vector);
