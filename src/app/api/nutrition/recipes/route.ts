import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { buildIngredient, computeRecipePer100g, type IngredientInput } from "@/lib/recipes";
export const dynamic = "force-dynamic";

// GET → list recipes (lightweight, for the picker/list). Newest first.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("recipes")
    .select("id, name, total_weight_g, per100g, notes, recipe_ingredients(id)")
    .eq("user_id", auth.userId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    total_weight_g: r.total_weight_g,
    per100g: r.per100g ?? {},
    notes: r.notes,
    ingredient_count: Array.isArray(r.recipe_ingredients) ? r.recipe_ingredients.length : 0,
  }));
  return NextResponse.json(list);
}

// POST { name, notes?, ingredients: IngredientInput[] } → create a recipe.
export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  const ingredients = body.ingredients as IngredientInput[] | undefined;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return NextResponse.json({ error: "at least one ingredient is required" }, { status: 400 });
  }

  let built;
  try {
    built = await Promise.all(ingredients.map(buildIngredient));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to resolve ingredients" },
      { status: 400 }
    );
  }

  const { per100g, total_weight_g } = computeRecipePer100g(built);
  const supabase = getSupabaseAdmin();

  const { data: recipe, error: rErr } = await supabase
    .from("recipes")
    .insert({ user_id: auth.userId, name, notes: body.notes ?? null, per100g, total_weight_g })
    .select()
    .single();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const rows = built.map((b, i) => ({ ...b, recipe_id: recipe.id, user_id: auth.userId, order_index: i }));
  const { error: iErr } = await supabase.from("recipe_ingredients").insert(rows);
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json(recipe);
}
