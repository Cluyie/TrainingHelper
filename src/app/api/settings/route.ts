import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
import type { UserSettings } from "@/types";
import { resolveExercisesForTemplates, generateWorkoutPlan } from "@/lib/program-generator";

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("user_settings")
    .select("*")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: Partial<UserSettings> = await request.json();

  const { data: existing } = await getSupabaseAdmin()
    .from("user_settings")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  let settings: UserSettings;

  if (existing) {
    const { data, error } = await getSupabaseAdmin()
      .from("user_settings")
      .update({ ...body, onboarding_complete: true })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = data;
  } else {
    const { data, error } = await getSupabaseAdmin()
      .from("user_settings")
      .insert({ ...body, user_id: auth.userId, onboarding_complete: true })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = data;
  }

  await regenerateProgram(settings, auth.userId);

  return NextResponse.json(settings);
}

// PATCH → update profile/goal fields only (no program regeneration).
export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = ["sex", "birth_year", "height_cm", "activity_level", "goal"] as const;
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("user_settings")
    .update(updates)
    .eq("user_id", auth.userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

async function regenerateProgram(settings: UserSettings, userId: string) {
  await getSupabaseAdmin()
    .from("planned_workouts")
    .delete()
    .eq("user_id", userId);

  const { data: exercises } = await getSupabaseAdmin()
    .from("exercises")
    .select("*");

  if (!exercises || exercises.length === 0) return;

  const templates = generateWorkoutPlan(settings, exercises);
  const resolved = resolveExercisesForTemplates(templates, exercises);

  for (const { templateLabel, templateDay, isHomeWorkout, exercises: exList } of resolved) {
    const orderInWeek = resolved.findIndex((r) => r.templateDay === templateDay) + 1;

    const { data: pw, error: pwErr } = await getSupabaseAdmin()
      .from("planned_workouts")
      .insert({
        user_id: userId,
        label: templateLabel,
        day_of_week: templateDay,
        order_in_week: orderInWeek,
        is_home_workout: isHomeWorkout,
      })
      .select()
      .single();

    if (pwErr || !pw) continue;

    if (exList.length > 0) {
      await getSupabaseAdmin().from("planned_exercises").insert(
        exList.map((e) => ({
          user_id: userId,
          planned_workout_id: pw.id,
          exercise_id: e.exercise.id,
          order_index: e.order_index,
          target_sets: e.target_sets,
          target_reps_min: e.target_reps_min,
          target_reps_max: e.target_reps_max,
          progression_increment_kg: e.progression_increment_kg,
        }))
      );
    }
  }
}
