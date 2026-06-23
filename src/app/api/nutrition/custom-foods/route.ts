import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { sanitizePer100g, parseOptionalGrams } from "@/lib/custom-foods";
export const dynamic = "force-dynamic";

// GET → list this user's custom foods (for the picker/list). Alphabetical.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("custom_foods")
    .select("id, name, brand, per100g, serving_size_g, notes, created_at, updated_at")
    .eq("user_id", auth.userId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST { name, brand?, per100g, serving_size_g?, notes? } → create a custom food.
export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from("custom_foods")
    .insert({
      user_id: auth.userId,
      name,
      brand: (body.brand ?? "").trim() || null,
      per100g: sanitizePer100g(body.per100g),
      serving_size_g: parseOptionalGrams(body.serving_size_g),
      notes: (body.notes ?? "").trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
