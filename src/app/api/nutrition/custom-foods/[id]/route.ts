import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { sanitizePer100g, parseOptionalGrams } from "@/lib/custom-foods";
export const dynamic = "force-dynamic";

// GET → a single custom food (for the editor).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { data, error } = await getSupabaseAdmin()
    .from("custom_foods")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PUT { name, brand?, per100g, serving_size_g?, notes? } → update.
// Already-logged entries keep their own snapshot (history is immutable).
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await request.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("custom_foods")
    .update({
      name,
      brand: (body.brand ?? "").trim() || null,
      per100g: sanitizePer100g(body.per100g),
      serving_size_g: parseOptionalGrams(body.serving_size_g),
      notes: (body.notes ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { error } = await getSupabaseAdmin()
    .from("custom_foods")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
