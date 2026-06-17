// ============================================================
// USDA FoodData Central client + nutrient computation.
//
// Keeps FDC_API_KEY server-side. Reads food detail, maps USDA nutrient
// numbers onto our registry keys (per 100g), computes derived nutrients
// (net carbs + the refined-carb heuristic), and scales a snapshot to a
// logged gram quantity. Food detail is cached in the `food_cache` table.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabase";
import { NUTRIENTS, NUTRIENT_MAP, type NutrientSnapshot } from "@/lib/nutrients";
import type { FoodSearchResult, FoodDetail } from "@/types";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

function apiKey(): string {
  const key = process.env.FDC_API_KEY;
  if (!key) {
    throw new Error(
      "FDC_API_KEY is not set. Get a free key at https://fdc.nal.usda.gov/api-key-signup.html and add it to .env.local."
    );
  }
  return key;
}

// ---------- Search ----------

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const url = new URL(`${FDC_BASE}/foods/search`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("dataType", "Foundation,SR Legacy,Branded");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`);
  const json = await res.json();

  return (json.foods ?? []).map((f: Record<string, unknown>) => ({
    source: "usda" as const,
    id: String(f.fdcId),
    fdcId: f.fdcId as number,
    description: (f.description as string) ?? "Unknown food",
    brandOwner: (f.brandOwner as string) ?? (f.brandName as string) ?? null,
    dataType: (f.dataType as string) ?? null,
    servingSize: toGrams(f.servingSize as number, f.servingSizeUnit as string),
    servingSizeUnit: (f.servingSizeUnit as string) ?? null,
  }));
}

// ---------- Detail (cached) ----------

interface RawDetail {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: unknown[];
  labelNutrients?: Record<string, { value?: number }>;
}

async function fetchRawDetail(fdcId: number | string): Promise<RawDetail> {
  const supabase = getSupabaseAdmin();

  const { data: cached } = await supabase
    .from("food_cache")
    .select("data")
    .eq("fdc_id", String(fdcId))
    .maybeSingle();
  if (cached?.data) return cached.data as RawDetail;

  const url = new URL(`${FDC_BASE}/food/${fdcId}`);
  url.searchParams.set("api_key", apiKey());
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`USDA food lookup failed (${res.status})`);
  const json = (await res.json()) as RawDetail;

  // Best-effort cache write; ignore failures (e.g. table missing).
  await supabase.from("food_cache").upsert({ fdc_id: String(fdcId), data: json });
  return json;
}

export async function getFoodDetail(fdcId: number | string): Promise<FoodDetail> {
  const raw = await fetchRawDetail(fdcId);
  const dataType = raw.dataType ?? null;
  const servingSize = toGrams(raw.servingSize, raw.servingSizeUnit);
  return {
    fdcId: raw.fdcId,
    description: raw.description ?? "Unknown food",
    brand: raw.brandOwner ?? raw.brandName ?? null,
    dataType,
    per100g: extractPer100g(raw),
    servingSize,
    servingSizeUnit: raw.servingSizeUnit ?? null,
  };
}

// ---------- Nutrient extraction (per 100g) ----------

interface ParsedNutrient {
  number: string;
  amount: number;
  unit: string; // upper-cased USDA unit (G, MG, UG, KCAL, IU)
}

function parseFoodNutrients(raw: RawDetail): ParsedNutrient[] {
  const out: ParsedNutrient[] = [];
  for (const item of raw.foodNutrients ?? []) {
    const fn = item as Record<string, unknown>;
    // Detail shape: { nutrient: { number, unitName }, amount }
    // Search shape: { nutrientNumber, value, unitName }
    const nested = fn.nutrient as Record<string, unknown> | undefined;
    const number = String(nested?.number ?? fn.nutrientNumber ?? "");
    const amount = (fn.amount ?? fn.value) as number | undefined;
    const unit = String((nested?.unitName ?? fn.unitName ?? "")).toUpperCase();
    if (!number || amount == null || Number.isNaN(amount)) continue;
    out.push({ number, amount, unit });
  }
  return out;
}

/** Convert a USDA amount into the registry's target unit. */
function convertUnit(amount: number, fromUnit: string, toUnit: string): number {
  if (toUnit === "kcal") return amount; // KCAL
  // Vitamin D etc. occasionally arrive in IU; 1µg vit D = 40 IU.
  if (fromUnit === "IU") {
    const ug = amount / 40;
    return convertUnit(ug, "UG", toUnit);
  }
  const toBaseG: Record<string, number> = { G: 1, MG: 1e-3, UG: 1e-6 };
  const fromFactor = toBaseG[fromUnit] ?? toBaseG[toUnitToUsda(toUnit)];
  const grams = amount * (fromFactor ?? 1);
  const targetFactor = toBaseG[toUnitToUsda(toUnit)] ?? 1;
  return grams / targetFactor;
}

function toUnitToUsda(unit: string): string {
  if (unit === "g") return "G";
  if (unit === "mg") return "MG";
  if (unit === "µg") return "UG";
  return "G";
}

export function extractPer100g(raw: RawDetail): NutrientSnapshot {
  const parsed = parseFoodNutrients(raw);
  const byNumber = new Map<string, ParsedNutrient>();
  for (const p of parsed) if (!byNumber.has(p.number)) byNumber.set(p.number, p);

  const read = (numbers: number[], targetUnit: string): number | null => {
    for (const num of numbers) {
      const p = byNumber.get(String(num));
      if (p) return round(convertUnit(p.amount, p.unit, targetUnit));
    }
    return null;
  };

  const snap: NutrientSnapshot = {};

  for (const def of NUTRIENTS) {
    if (def.computed) continue;
    if (def.key === "omega3_epadha_mg") {
      // Sum EPA + DHA rather than first-wins.
      let sum = 0;
      let seen = false;
      for (const num of def.usda) {
        const p = byNumber.get(String(num));
        if (p) {
          sum += convertUnit(p.amount, p.unit, def.unit);
          seen = true;
        }
      }
      snap[def.key] = seen ? round(sum) : null;
      continue;
    }
    snap[def.key] = read(def.usda, def.unit);
  }

  // Branded fallback: fill macros from labelNutrients (per serving) if missing.
  fillFromLabel(snap, raw);

  // Derived: net carbs + refined carbs.
  const carbs = read([205], "g");
  const sugars = read([269], "g") ?? 0;
  const fiber = snap["fiber_g"] ?? 0;
  if (carbs == null) {
    snap["net_carbs_g"] = null;
    snap["refined_carbs_g"] = null;
  } else {
    snap["net_carbs_g"] = round(Math.max(0, carbs - fiber));
    snap["refined_carbs_g"] = round(computeRefined(carbs, sugars, fiber, raw.dataType));
  }

  return snap;
}

/** For Branded foods, labelNutrients are per serving — convert to per 100g. */
function fillFromLabel(snap: NutrientSnapshot, raw: RawDetail) {
  const label = raw.labelNutrients;
  const serving = toGrams(raw.servingSize, raw.servingSizeUnit);
  if (!label || !serving || serving <= 0) return;
  const per100 = (v?: number) => (v == null ? null : round((v / serving) * 100));
  const map: Record<string, number | undefined> = {
    calories: label.calories?.value,
    protein_g: label.protein?.value,
    fat_g: label.fat?.value,
    fiber_g: label.fiber?.value,
    sodium_mg: label.sodium?.value,
    calcium_mg: label.calcium?.value,
    iron_mg: label.iron?.value,
    potassium_mg: label.potassium?.value,
  };
  for (const [key, value] of Object.entries(map)) {
    if (snap[key] == null && value != null) snap[key] = per100(value);
  }
}

/**
 * Refined-carb heuristic: sugars + a fraction of non-sugar starch, where the
 * fraction rises with processing (Branded data type and/or low fiber ratio)
 * and falls for whole, high-fiber foods. Tunable — adjust the weights below.
 */
export function computeRefined(
  carbs: number,
  sugars: number,
  fiber: number,
  dataType?: string
): number {
  const nonSugarStarch = Math.max(0, carbs - sugars - fiber);
  const fiberRatio = carbs > 0 ? fiber / carbs : 0;
  const branded = dataType === "Branded";

  let w: number;
  if (branded) {
    w = fiberRatio < 0.1 ? 1.0 : 0.5;
  } else if (fiberRatio < 0.05) {
    w = 0.7; // white rice, refined starch
  } else if (fiberRatio < 0.15) {
    w = 0.3;
  } else {
    w = 0.05; // whole, fibrous foods
  }

  const refined = sugars + nonSugarStarch * w;
  return Math.min(carbs, Math.max(0, refined));
}

// ---------- Scaling ----------

/** Scale a per-100g snapshot to an eaten gram quantity. null stays null. */
export function scaleNutrients(per100g: NutrientSnapshot, grams: number): NutrientSnapshot {
  const factor = grams / 100;
  const out: NutrientSnapshot = {};
  for (const def of NUTRIENTS) {
    const v = per100g[def.key];
    out[def.key] = v == null ? null : round(v * factor);
  }
  return out;
}

// ---------- helpers ----------

function toGrams(size?: number | null, unit?: string | null): number | null {
  if (size == null || Number.isNaN(size)) return null;
  const u = (unit ?? "").toLowerCase();
  if (u === "g" || u === "ml" || u === "") return size; // treat ml ≈ g
  if (u === "kg") return size * 1000;
  if (u === "oz") return size * 28.3495;
  if (u === "lb") return size * 453.592;
  return size;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export { NUTRIENT_MAP };
