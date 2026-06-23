// ============================================================
// Custom foods — helpers for validating user-entered nutrition labels.
// A custom food's `per100g` is keyed by nutrient registry keys (calories,
// protein_g, …). We only ever persist known keys, coerced to a number or null.
// ============================================================

import { NUTRIENTS, type NutrientSnapshot } from "@/lib/nutrients";

/** Keep only known nutrient keys; coerce each to a finite number or null
 * ("no data"). Blank / non-numeric input becomes null. */
export function sanitizePer100g(input: unknown): NutrientSnapshot {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: NutrientSnapshot = {};
  for (const def of NUTRIENTS) {
    const raw = src[def.key];
    const n = typeof raw === "number" ? raw : raw === "" || raw == null ? NaN : Number(raw);
    out[def.key] = Number.isFinite(n) ? n : null;
  }
  return out;
}

/** Parse an optional positive number (serving size); blank → null. */
export function parseOptionalGrams(input: unknown): number | null {
  const n = typeof input === "number" ? input : input === "" || input == null ? NaN : Number(input);
  return Number.isFinite(n) && n > 0 ? n : null;
}
