import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  DiscoveryWorkItem,
  DiscoveryWorkQueue,
} from "@/lib/ingestion/source";

/** Database-backed adapter backlog, scoped to one discovery source. */
export function discoveryWorkQueue(sourceId: string): DiscoveryWorkQueue {
  return {
    async enqueue(items: DiscoveryWorkItem[]) {
      if (items.length === 0) return;
      const supabase = createServiceRoleClient();
      const { error } = await supabase.rpc("enqueue_source_discovery_work", {
        p_source_id: sourceId,
        p_items: items,
      });
      if (error) throw new Error(`discoveryWorkQueue.enqueue failed: ${error.message}`);
    },

    async take(limit: number) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase
        .from("source_discovery_work_item")
        .select("item_key, payload")
        .eq("source_id", sourceId)
        .is("completed_at", null)
        .lte("next_attempt_at", new Date().toISOString())
        .order("next_attempt_at", { ascending: true })
        .order("discovered_at", { ascending: true })
        .order("item_key", { ascending: true })
        .limit(Math.max(0, limit));
      if (error) throw new Error(`discoveryWorkQueue.take failed: ${error.message}`);
      return (data ?? []).map((row) => ({
        key: row.item_key as string,
        payload: row.payload as Record<string, unknown>,
      }));
    },

    async complete(key: string) {
      const supabase = createServiceRoleClient();
      const { error } = await supabase
        .from("source_discovery_work_item")
        .update({ completed_at: new Date().toISOString() })
        .eq("source_id", sourceId)
        .eq("item_key", key)
        .is("completed_at", null);
      if (error) throw new Error(`discoveryWorkQueue.complete failed: ${error.message}`);
    },

    async defer(key: string) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.rpc("defer_source_discovery_work", {
        p_source_id: sourceId,
        p_item_key: key,
      });
      if (error) throw new Error(`discoveryWorkQueue.defer failed: ${error.message}`);
      if (data !== true) throw new Error(`discoveryWorkQueue.defer failed: unknown item "${key}"`);
    },
  };
}
