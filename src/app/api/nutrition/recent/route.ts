import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FoodLogEntry, RecentFood } from "@/types";
export const dynamic = "force-dynamic";

// GET → distinct recently/frequently logged foods for one-tap re-logging.
// Ranked by how often logged (favourites bubble up), then recency.
export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("food_log_entries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, RecentFood>();
  for (const e of (data ?? []) as FoodLogEntry[]) {
    const key = e.fdc_id ?? e.food_name.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1; // entries are newest-first, so keep the first (most recent) snapshot
    } else {
      groups.set(key, {
        fdc_id: e.fdc_id,
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
