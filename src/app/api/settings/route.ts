import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";
import type { UserSettings } from "@/types";
import { resolveExercisesForTemplates, generateWorkoutPlan } from "@/lib/program-generator";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("user_settings")
    .select("*")
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function POST(request: NextRequest) {
  const body: Partial<UserSettings> = await request.json();

  const { data: existing } = await getSupabaseAdmin()
    .from("user_settings")
    .select("id")
    .limit(1)
    .single();

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
      .insert({ ...body, onboarding_complete: true })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = data;
  }

  await regenerateProgram(settings);

  return NextResponse.json(settings);
}

async function regenerateProgram(settings: UserSettings) {
  await getSupabaseAdmin()
    .from("planned_workouts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

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
