import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import type { FoodLogEntry, RecentFood } from "@/types";
export const dynamic = "force-dynamic";

// GET → distinct recently/frequently logged foods for one-tap re-logging.
// Ranked by how often logged (favourites bubble up), then recency.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("food_log_entries")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, RecentFood>();
  for (const e of (data ?? []) as FoodLogEntry[]) {
    const source = e.source ?? "usda";
    const key = `${source}:${e.custom_food_id ?? e.recipe_id ?? e.fdc_id ?? e.food_name.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1; // entries are newest-first, so keep the first (most recent) snapshot
    } else {
      groups.set(key, {
        source,
        fdc_id: e.fdc_id,
        recipe_id: e.recipe_id ?? null,
        custom_food_id: e.custom_food_id ?? null,
        food_name: e.food_name,
        brand: e.brand,
        quantity_g: e.quantity_g,
        nutrients: e.nutrients ?? {},
        data_type: e.data_type,
        count: 1,
      });
    }
  }

  const ranked = Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return NextResponse.json(ranked);
}
