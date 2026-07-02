import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { NUTRIENTS, NUTRIENT_MAP } from "@/lib/nutrients";
import {
  computeTargets,
  adjustTargetsForActivity,
  latestAvgWeight,
  type Profile,
  type WeightPoint,
  type IntakePoint,
} from "@/lib/targets";
import {
  computeActivityAdjustment,
  ACTIVITY_WINDOW_DAYS,
  type ActivityAdjustment,
  type RunDay,
  type StrengthDay,
  type StretchDay,
  type StepsDay,
} from "@/lib/activity";
import type { NutrientTarget } from "@/types";
export const dynamic = "force-dynamic";

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Load profile + recent weigh-ins + per-day calories, then run the adaptive
// engine — plus the trailing activity window (runs, strength, stretching,
// steps) for the day-level redistribution. `date` lets past days reproduce
// the target as it stood then. `netCarbTarget` (g) balances the fat target.
async function computeForUser(userId: string, netCarbTarget: number, date: string) {
  const supabase = getSupabaseAdmin();
  const start = shiftDays(date, -27);
  const actStart = shiftDays(date, -(ACTIVITY_WINDOW_DAYS - 1));

  const [
    { data: settings },
    { data: weights },
    { data: foods },
    { data: runs },
    { data: strength },
    { data: stretches },
    { data: steps },
  ] = await Promise.all([
    supabase
      .from("user_settings")
      .select("sex, birth_year, height_cm, activity_level, goal")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("body_weights")
      .select("date, weight_kg")
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", date),
    supabase
      .from("food_log_entries")
      .select("date, nutrients")
      .eq("user_id", userId)
      .gte("date", start)
      .lte("date", date),
    supabase
      .from("running_sessions")
      .select("date, actual_duration_min, actual_distance_km")
      .eq("user_id", userId)
      .eq("completed", true)
      .not("date", "is", null)
      .gte("date", actStart)
      .lte("date", date),
    supabase
      .from("workout_sessions")
      .select("date, started_at, completed_at")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .gte("date", actStart)
      .lte("date", date),
    supabase
      .from("stretching_sessions")
      .select("date")
      .eq("user_id", userId)
      .eq("completed", true)
      .gte("date", actStart)
      .lte("date", date),
    supabase
      .from("daily_steps")
      .select("date, steps")
      .eq("user_id", userId)
      .gte("date", actStart)
      .lte("date", date),
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

  // Day-level activity redistribution — needs a weight to price activity in
  // kcal; without weigh-ins (computed is null then too) it stays off.
  const weightKg = latestAvgWeight(weightPoints);
  const activity: ActivityAdjustment | null =
    computed && weightKg != null
      ? computeActivityAdjustment(date, weightKg, {
          runs: (runs ?? []) as RunDay[],
          strength: (strength ?? []) as StrengthDay[],
          stretches: (stretches ?? []) as StretchDay[],
          steps: (steps ?? []) as StepsDay[],
        })
      : null;

  return { computed, activity, goal: profile.goal ?? "maintain", hasWeight: weightPoints.length > 0 };
}

// GET ?date=YYYY-MM-DD → every nutrient's effective target for that day
//                  (registry defaults + overrides, with calories/protein/fat
//                  replaced by the adaptive engine + activity adjustment).
// GET ?meta=1    → how the calorie/protein numbers were derived (settings UI),
//                  including the activity breakdown for the date.
export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const dateParam = params.get("date");
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const date = dateParam ?? new Date().toISOString().split("T")[0];

  const { data, error } = await getSupabaseAdmin()
    .from("nutrient_targets")
    .select("*")
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const overrides = new Map((data ?? []).map((r) => [r.nutrient_key, r]));
  const netCarbTarget =
    overrides.get("net_carbs_g")?.target_amount ?? NUTRIENT_MAP["net_carbs_g"].defaultTarget;
  const { computed, activity, goal, hasWeight } = await computeForUser(
    auth.userId, netCarbTarget, date
  );

  // A manual calories override disables the activity adjustment entirely.
  const activityActive = computed != null && activity != null && !overrides.has("calories");
  const adjusted =
    activityActive && activity.adjustment !== 0
      ? adjustTargetsForActivity(computed, activity.adjustment, netCarbTarget)
      : computed;

  // Adaptive value applies only where the user hasn't set a manual override.
  const computedFor: Record<string, number> = {};
  if (computed && adjusted) {
    if (!overrides.has("calories")) computedFor["calories"] = adjusted.calories;
    if (!overrides.has("protein_g")) computedFor["protein_g"] = computed.protein_g;
    if (!overrides.has("fat_g")) {
      computedFor["fat_g"] = overrides.has("calories") ? computed.fat_g : adjusted.fat_g;
    }
  }

  if (params.get("meta") === "1") {
    return NextResponse.json({
      date,
      goal,
      hasWeight,
      hasProfile: computed != null,
      maintenance: computed?.maintenance ?? null,
      source: computed?.source ?? null,
      calories: computed?.calories ?? null,
      protein_g: computed?.protein_g ?? null,
      fat_g: computed?.fat_g ?? null,
      adjustedCalories: activityActive ? adjusted!.calories : null,
      adjustedFat: activityActive ? adjusted!.fat_g : null,
      activity: activityActive ? activity : null,
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
