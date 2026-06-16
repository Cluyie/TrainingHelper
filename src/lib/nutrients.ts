// ============================================================
// Nutrient registry — single source of truth for the nutrition tracker.
//
// Every nutrient we track is defined here once: its display label, unit,
// which tier/group it belongs to, the USDA FoodData Central nutrient numbers
// to read it from, a sensible default daily target (34yo male), and whether
// the target is a floor (hit at least) or a limit (stay under).
//
// Computed nutrients (net carbs, refined carbs) carry a `computed` tag and are
// derived in src/lib/usda.ts rather than read directly from USDA.
// ============================================================

export type NutrientGroup = "macro" | "mineral" | "vitamin" | "functional";
export type TargetDirection = "floor" | "limit";
export type ComputedKind = "net_carbs" | "refined_carbs";

export interface NutrientDef {
  key: string;
  label: string;
  unit: string; // 'kcal' | 'g' | 'mg' | 'µg'
  tier: 1 | 2;
  group: NutrientGroup;
  /** USDA nutrient numbers, in priority order (first present wins). */
  usda: number[];
  defaultTarget: number;
  direction: TargetDirection;
  /** Derived nutrients are computed, not read from USDA. */
  computed?: ComputedKind;
}

// USDA nutrient numbers referenced below (for maintainers):
//   208/1008 energy(kcal) · 203 protein · 204 fat · 205 carbs · 291 fiber · 269 sugars
//   304 magnesium · 306 potassium · 301 calcium · 307 sodium · 303 iron · 309 zinc
//   317 selenium · 314 iodine
//   328/324 vitamin D · 401 vitamin C · 418 B12 · 417/435 folate · 415 B6
//   430 vitamin K1 · 428 vitamin K2 · 629 EPA · 621 DHA

export const NUTRIENTS: NutrientDef[] = [
  // ---- Tier 1: macros (always visible) ----
  { key: "calories", label: "Calories", unit: "kcal", tier: 1, group: "macro", usda: [208, 1008], defaultTarget: 2400, direction: "floor" },
  { key: "protein_g", label: "Protein", unit: "g", tier: 1, group: "macro", usda: [203], defaultTarget: 140, direction: "floor" },
  { key: "fat_g", label: "Fat", unit: "g", tier: 1, group: "macro", usda: [204], defaultTarget: 70, direction: "floor" },
  { key: "net_carbs_g", label: "Net Carbs", unit: "g", tier: 1, group: "macro", usda: [], defaultTarget: 50, direction: "limit", computed: "net_carbs" },
  { key: "fiber_g", label: "Fiber", unit: "g", tier: 1, group: "macro", usda: [291], defaultTarget: 30, direction: "floor" },
  { key: "refined_carbs_g", label: "Refined Carbs", unit: "g", tier: 1, group: "macro", usda: [], defaultTarget: 50, direction: "limit", computed: "refined_carbs" },

  // ---- Tier 2: minerals ----
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", tier: 2, group: "mineral", usda: [304], defaultTarget: 400, direction: "floor" },
  { key: "potassium_mg", label: "Potassium", unit: "mg", tier: 2, group: "mineral", usda: [306], defaultTarget: 3400, direction: "floor" },
  { key: "calcium_mg", label: "Calcium", unit: "mg", tier: 2, group: "mineral", usda: [301], defaultTarget: 1000, direction: "floor" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", tier: 2, group: "mineral", usda: [307], defaultTarget: 2300, direction: "limit" },
  { key: "iron_mg", label: "Iron", unit: "mg", tier: 2, group: "mineral", usda: [303], defaultTarget: 8, direction: "floor" },
  { key: "zinc_mg", label: "Zinc", unit: "mg", tier: 2, group: "mineral", usda: [309], defaultTarget: 11, direction: "floor" },
  { key: "selenium_ug", label: "Selenium", unit: "µg", tier: 2, group: "mineral", usda: [317], defaultTarget: 55, direction: "floor" },
  { key: "iodine_ug", label: "Iodine", unit: "µg", tier: 2, group: "mineral", usda: [314], defaultTarget: 150, direction: "floor" },

  // ---- Tier 2: vitamins ----
  { key: "vitamin_d_ug", label: "Vitamin D", unit: "µg", tier: 2, group: "vitamin", usda: [328, 324], defaultTarget: 20, direction: "floor" },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", tier: 2, group: "vitamin", usda: [401], defaultTarget: 90, direction: "floor" },
  { key: "vitamin_b12_ug", label: "Vitamin B12", unit: "µg", tier: 2, group: "vitamin", usda: [418], defaultTarget: 2.4, direction: "floor" },
  { key: "folate_ug", label: "Folate (B9)", unit: "µg", tier: 2, group: "vitamin", usda: [435, 417], defaultTarget: 400, direction: "floor" },
  { key: "vitamin_b6_mg", label: "Vitamin B6", unit: "mg", tier: 2, group: "vitamin", usda: [415], defaultTarget: 1.3, direction: "floor" },
  { key: "vitamin_k1_ug", label: "Vitamin K1", unit: "µg", tier: 2, group: "vitamin", usda: [430], defaultTarget: 120, direction: "floor" },
  { key: "vitamin_k2_ug", label: "Vitamin K2", unit: "µg", tier: 2, group: "vitamin", usda: [428], defaultTarget: 100, direction: "floor" },

  // ---- Tier 2: functional ----
  { key: "omega3_epadha_mg", label: "Omega-3 (EPA+DHA)", unit: "mg", tier: 2, group: "functional", usda: [629, 621], defaultTarget: 500, direction: "floor" },
];

export const NUTRIENT_MAP: Record<string, NutrientDef> = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, n])
);

export const TIER1 = NUTRIENTS.filter((n) => n.tier === 1);
export const TIER2 = NUTRIENTS.filter((n) => n.tier === 2);

export const GROUP_ORDER: NutrientGroup[] = ["mineral", "vitamin", "functional"];
export const GROUP_LABELS: Record<NutrientGroup, string> = {
  macro: "Macros",
  mineral: "Minerals",
  vitamin: "Vitamins",
  functional: "Functional",
};

export function byGroup(group: NutrientGroup): NutrientDef[] {
  return NUTRIENTS.filter((n) => n.group === group);
}

/** A per-entry or aggregated nutrient snapshot. null = no data available. */
export type NutrientSnapshot = Record<string, number | null>;

/** Sum a list of snapshots key-by-key. null contributes nothing; a key stays
 * null only if every snapshot was null/absent for it. */
export function sumSnapshots(snapshots: NutrientSnapshot[]): NutrientSnapshot {
  const out: NutrientSnapshot = {};
  for (const n of NUTRIENTS) {
    let sum = 0;
    let seen = false;
    for (const snap of snapshots) {
      const v = snap[n.key];
      if (v != null && !Number.isNaN(v)) {
        sum += v;
        seen = true;
      }
    }
    out[n.key] = seen ? sum : null;
  }
  return out;
}
