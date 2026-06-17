// ============================================================
// Frida (Danish DTU food database) client.
//
// Reads the seeded `frida_foods` table (see /api/nutrition/frida-import).
// Mirrors the USDA client's FoodSearchResult / FoodDetail shapes so the
// search + log + recipe pipelines treat Frida as just another source.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabase";
import type { NutrientSnapshot } from "@/lib/nutrients";
import type { FoodSearchResult, FoodDetail } from "@/types";

interface FridaRow {
  id: string;
  name: string;
  name_da: string | null;
  per100g: NutrientSnapshot;
}

/** Search seeded Frida foods by name (English or Danish). */
export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("frida_foods")
    .select("id, name, name_da")
    .ilike("search_text", `%${term}%`)
    .limit(25);

  if (error) return []; // table may not exist yet (not seeded) — degrade gracefully
  return (data ?? []).map((r) => ({
    source: "frida" as const,
    id: r.id,
    fdcId: 0,
    description: r.name,
    brandOwner: r.name_da && r.name_da !== r.name ? r.name_da : null,
    dataType: "Frida",
    servingSize: null,
    servingSizeUnit: null,
  }));
}

/** Per-100g detail for one Frida food. */
export async function getFridaDetail(id: string | number): Promise<FoodDetail> {
  const { data, error } = await getSupabaseAdmin()
    .from("frida_foods")
    .select("id, name, name_da, per100g")
    .eq("id", String(id))
    .single();

  if (error || !data) throw new Error("Frida food not found");
  const row = data as FridaRow;
  return {
    fdcId: 0,
    description: row.name,
    brand: row.name_da && row.name_da !== row.name ? row.name_da : null,
    dataType: "Frida",
    per100g: row.per100g ?? {},
    servingSize: null,
    servingSizeUnit: null,
  };
}

// Alias used by callers that already import { searchFoods } from usda — keep
// an explicit Frida-named export too.
export { searchFoods as searchFrida };
