import { slugify } from "@/lib/slugify";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function makeUniqueListingSlug(title: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const base = slugify(title) || "sweepza-listing";

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("listing")
      .select("id")
      .eq("slug", slug)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw new Error(`makeUniqueListingSlug failed: ${error.message}`);
    }

    if (!data) {
      return slug;
    }
  }

  throw new Error("Could not generate a unique listing slug.");
}
