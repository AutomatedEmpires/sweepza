import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CategoryRow, TagRow } from "./types";

export interface DictionaryOption {
  code: string;
  label: string;
}

export async function getActiveCategories(): Promise<DictionaryOption[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("category")
    .select("code, label")
    .eq("is_active", true)
    .order("display_priority", { ascending: true })
    .returns<Pick<CategoryRow, "code" | "label">[]>();

  if (error) {
    throw new Error(`getActiveCategories failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ code: row.code, label: row.label }));
}

export async function getActiveTags(): Promise<DictionaryOption[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tag")
    .select("code, label")
    .eq("is_active", true)
    .order("display_priority", { ascending: true })
    .returns<Pick<TagRow, "code" | "label">[]>();

  if (error) {
    throw new Error(`getActiveTags failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ code: row.code, label: row.label }));
}
