import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { buildIngredient, computeRecipePer100g, type IngredientInput } from "@/lib/recipes";
export const dynamic = "force-dynamic";

// GET → a recipe with its ingredients (for the editor / detail view).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { data, error } = await getSupabaseAdmin()
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (Array.isArray(data.recipe_ingredients)) {
    data.recipe_ingredients.sort(
      (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index
    );
  }
  return NextResponse.json(data);
}

// PUT { name, notes?, ingredients: IngredientInput[] } → replace + recompute.
// Already-logged entries keep their own snapshot (history is immutable).
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
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

  // Ensure the recipe belongs to this user before mutating.
  const { data: owned } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const { error: rErr } = await supabase
    .from("recipes")
    .update({ name, notes: body.notes ?? null, per100g, total_weight_g, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  // Replace ingredients wholesale.
  await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
  const rows = built.map((b, i) => ({ ...b, recipe_id: id, user_id: auth.userId, order_index: i }));
  const { error: iErr } = await supabase.from("recipe_ingredients").insert(rows);
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { error } = await getSupabaseAdmin()
    .from("recipes")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
