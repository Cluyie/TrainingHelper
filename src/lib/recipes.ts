// ============================================================
// Recipe helpers (server-only).
//
// Turns ingredient inputs into stored ingredient rows (reusing the same
// USDA detail + scaling used by the food log) and computes the recipe's
// per-100g snapshot from the summed ingredients ÷ total weight.
// ============================================================

import { getFoodDetail, scaleNutrients } from "@/lib/usda";
import { getFridaDetail } from "@/lib/frida";
import { sumSnapshots, NUTRIENTS, type NutrientSnapshot } from "@/lib/nutrients";

/** An ingredient as supplied by the client when building/editing a recipe. */
export type IngredientInput =
  | { source?: "usda"; fdcId: string | number; grams: number }
  | { source: "frida"; id: string; grams: number }
  | {
      source?: "manual";
      food_name: string;
      grams: number;
      nutrients: NutrientSnapshot;
      brand?: string | null;
    };

/** A built ingredient row, ready to insert (minus recipe_id/order_index). */
export interface BuiltIngredient {
  fdc_id: string | null;
  food_name: string;
  brand: string | null;
  quantity_g: number;
  nutrients: NutrientSnapshot;
  data_type: string | null;
}

/** Resolve one ingredient input into a stored row with a scaled snapshot. */
export async function buildIngredient(input: IngredientInput): Promise<BuiltIngredient> {
  const grams = Number((input as { grams: number }).grams);
  if (!grams || grams <= 0) throw new Error("Each ingredient needs a positive gram amount");

  if (input.source === "frida" && "id" in input) {
    const detail = await getFridaDetail(input.id);
    return {
      fdc_id: input.id,
      food_name: detail.description,
      brand: detail.brand,
      quantity_g: grams,
      nutrients: scaleNutrients(detail.per100g, grams),
      data_type: "Frida",
    };
  }

  if ("fdcId" in input && input.fdcId != null) {
    const detail = await getFoodDetail(input.fdcId);
    return {
      fdc_id: String(input.fdcId),
      food_name: detail.description,
      brand: detail.brand,
      quantity_g: grams,
      nutrients: scaleNutrients(detail.per100g, grams),
      data_type: detail.dataType,
    };
  }

  if ("food_name" in input && input.nutrients) {
    return {
      fdc_id: null,
      food_name: input.food_name,
      brand: input.brand ?? null,
      quantity_g: grams,
      nutrients: input.nutrients,
      data_type: "Manual",
    };
  }

  throw new Error("Invalid ingredient: provide fdcId, frida id, or food_name + nutrients");
}

/** Recipe per-100g = summed ingredient nutrients ÷ total weight × 100. */
export function computeRecipePer100g(
  ingredients: BuiltIngredient[]
): { per100g: NutrientSnapshot; total_weight_g: number } {
  const total_weight_g = ingredients.reduce((s, i) => s + Number(i.quantity_g), 0);
  const totals = sumSnapshots(ingredients.map((i) => i.nutrients ?? {}));
  const per100g: NutrientSnapshot = {};
  for (const n of NUTRIENTS) {
    const v = totals[n.key];
    per100g[n.key] =
      v == null || total_weight_g <= 0
        ? v ?? null
        : Math.round((v * 100) / total_weight_g * 1000) / 1000;
  }
  return { per100g, total_weight_g };
}
