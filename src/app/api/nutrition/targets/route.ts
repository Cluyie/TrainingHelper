import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { NUTRIENTS } from "@/lib/nutrients";
import type { NutrientTarget } from "@/types";
export const dynamic = "force-dynamic";

// GET → every nutrient's effective target: registry defaults merged with any
// user override rows. The frontend always gets a complete list.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("nutrient_targets")
    .select("*")
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const overrides = new Map((data ?? []).map((r) => [r.nutrient_key, r]));

  const merged: NutrientTarget[] = NUTRIENTS.map((n) => {
    const o = overrides.get(n.key);
    return {
      nutrient_key: n.key,
      target_amount: o?.target_amount ?? n.defaultTarget,
      direction: o?.direction ?? n.direction,
      enabled: o?.enabled ?? true,
    };
  });

  return NextResponse.json(merged);
}

// PATCH { nutrient_key, target_amount?, direction?, enabled? } → upsert override
export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.nutrient_key) {
    return NextResponse.json({ error: "nutrient_key required" }, { status: 400 });
  }
  const def = NUTRIENTS.find((n) => n.key === body.nutrient_key);
  if (!def) return NextResponse.json({ error: "unknown nutrient_key" }, { status: 400 });

  const row = {
    user_id: auth.userId,
    nutrient_key: body.nutrient_key,
    target_amount: body.target_amount ?? def.defaultTarget,
    direction: body.direction ?? def.direction,
    enabled: body.enabled ?? true,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("nutrient_targets")
    .upsert(row, { onConflict: "user_id,nutrient_key" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
