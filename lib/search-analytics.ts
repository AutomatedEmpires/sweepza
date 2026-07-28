export interface SearchAnalyticsMetrics {
  has_query: boolean;
  query_length: number;
  query_token_count: number;
}

/**
 * Returns useful search-shape metrics without exposing the search text itself.
 * Search terms can contain names, addresses, or other personal information and
 * must never be forwarded to product analytics.
 */
export function searchAnalyticsMetrics(query: string): SearchAnalyticsMetrics {
  const normalized = query.trim();

  return {
    has_query: normalized.length > 0,
    query_length: normalized.length,
    query_token_count: normalized ? normalized.split(/\s+/u).length : 0,
  };
}
