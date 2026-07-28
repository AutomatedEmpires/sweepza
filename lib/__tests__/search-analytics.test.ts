import { describe, expect, it } from "vitest";
import { searchAnalyticsMetrics } from "@/lib/search-analytics";

describe("search analytics metrics", () => {
  it("reports only non-PII search shape metrics", () => {
    const query = "alex@example.com travel prize";
    const metrics = searchAnalyticsMetrics(query);

    expect(metrics).toEqual({
      has_query: true,
      query_length: query.length,
      query_token_count: 3,
    });
    expect(Object.keys(metrics)).not.toContain("query");
    expect(JSON.stringify(metrics)).not.toContain(query);
  });

  it("normalizes surrounding whitespace without retaining search text", () => {
    expect(searchAnalyticsMetrics("  daily   cash  ")).toEqual({
      has_query: true,
      query_length: 12,
      query_token_count: 2,
    });
    expect(searchAnalyticsMetrics("   ")).toEqual({
      has_query: false,
      query_length: 0,
      query_token_count: 0,
    });
  });
});
