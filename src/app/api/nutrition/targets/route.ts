import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { NUTRIENTS, NUTRIENT_MAP } from "@/lib/nutrients";
import { computeTargets, type Profile, type WeightPoint, type IntakePoint } from "@/lib/targets";
import type { NutrientTarget } from "@/types";
export const dynamic = "force-dynamic";

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Load profile + recent weigh-ins + per-day calories, then run the adaptive engine.
// `netCarbTarget` (g) balances the fat target.
async function computeForUser(userId: string, netCarbTarget: number) {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];
  const start = shiftDays(today, -27);

  const [{ data: settings }, { data: weights }, { data: foods }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("sex, birth_year, height_cm, activity_level, goal")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("body_weights").select("date, weight_kg").eq("user_id", userId).gte("date", start),
    supabase.from("food_log_entries").select("date, nutrients").eq("user_id", userId).gte("date", start),
  ]);

  const profile = (settings ?? {
    sex: null, birth_year: null, height_cm: null, activity_level: null, goal: null,
  }) as Profile;

  const weightPoints = (weights ?? []) as WeightPoint[];

  const byDate = new Map<string, number>();
  for (const f of foods ?? []) {
    const cal = Number((f.nutrients as Record<string, number> | null)?.calories ?? 0);
    byDate.set(f.date, (byDate.get(f.date) ?? 0) + cal);
  }
  const intake: IntakePoint[] = Array.from(byDate, ([date, kcal]) => ({ date, kcal }));

  const computed = computeTargets(profile, weightPoints, intake, netCarbTarget);
  return { computed, goal: profile.goal ?? "maintain", hasWeight: weightPoints.length > 0 };
}

// GET            → every nutrient's effective target (registry defaults + overrides,
//                  with calories/protein replaced by the adaptive engine when available).
// GET ?meta=1    → how the calorie/protein numbers were derived (for the settings UI).
export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("nutrient_targets")
    .select("*")
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const overrides = new Map((data ?? []).map((r) => [r.nutrient_key, r]));
  const netCarbTarget =
    overrides.get("net_carbs_g")?.target_amount ?? NUTRIENT_MAP["net_carbs_g"].defaultTarget;
  const { computed, goal, hasWeight } = await computeForUser(auth.userId, netCarbTarget);

  // Adaptive value applies only where the user hasn't set a manual override.
  const computedFor: Record<string, number> = {};
  if (computed) {
    if (!overrides.has("calories")) computedFor["calories"] = computed.calories;
    if (!overrides.has("protein_g")) computedFor["protein_g"] = computed.protein_g;
    if (!overrides.has("fat_g")) computedFor["fat_g"] = computed.fat_g;
  }

  if (new URL(request.url).searchParams.get("meta") === "1") {
    return NextResponse.json({
      goal,
      hasWeight,
      hasProfile: computed != null,
      maintenance: computed?.maintenance ?? null,
      source: computed?.source ?? null,
      calories: computed?.calories ?? null,
      protein_g: computed?.protein_g ?? null,
      fat_g: computed?.fat_g ?? null,
      caloriesOverridden: overrides.has("calories"),
      proteinOverridden: overrides.has("protein_g"),
      fatOverridden: overrides.has("fat_g"),
    });
  }

  const merged: NutrientTarget[] = NUTRIENTS.map((n) => {
    const o = overrides.get(n.key);
    return {
      nutrient_key: n.key,
      target_amount: computedFor[n.key] ?? o?.target_amount ?? n.defaultTarget,
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
