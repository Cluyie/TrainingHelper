import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { NUTRIENT_MAP } from "@/lib/nutrients";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("supplements")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST { nutrient_key, name?, dose_amount }
export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.nutrient_key || !NUTRIENT_MAP[body.nutrient_key]) {
    return NextResponse.json({ error: "valid nutrient_key required" }, { status: 400 });
  }
  const dose = Number(body.dose_amount);
  if (!dose || dose <= 0) {
    return NextResponse.json({ error: "dose_amount must be positive" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("supplements")
    .insert({
      user_id: auth.userId,
      nutrient_key: body.nutrient_key,
      name: body.name ?? null,
      dose_amount: dose,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("supplements")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
