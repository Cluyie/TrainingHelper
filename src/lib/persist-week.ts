// ============================================================
// Persistence for the strength program (server-only).
//
// The program is a fixed Monday-Friday week (see program-generator.ts), so there is
// nothing to place — this just writes it. Running is no longer planned at all: runs
// are logged after the fact on the running page.
//
// Clearing planned_workouts nulls workout_sessions.planned_workout_id (ON DELETE SET
// NULL). That only unlinks sessions from the TEMPLATE; logged sets keep their
// exercise_id, which is what progression reads, so lifting history survives a
// regeneration. Still, regeneration happens only on an explicit settings save.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabase";
import { PROGRAM, resolveProgram } from "@/lib/program-generator";
import type { Exercise } from "@/types";

const ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/**
 * Replace the stored program with the current one.
 *
 * Throws on any failed or empty write. A half-written program renders as a week with
 * missing sessions, which is indistinguishable from a deliberate rest day — so a
 * failure here has to be loud.
 */
export async function regenerateProgram(userId: string): Promise<void> {
  const db = getSupabaseAdmin();

  const { data: exercises, error: exErr } = await db.from("exercises").select("*");
  if (exErr) throw new Error(`failed to read the exercise catalogue: ${exErr.message}`);
  if (!exercises || exercises.length === 0) {
    throw new Error("the exercise catalogue is empty — run POST /api/seed first");
  }

  // Resolve BEFORE deleting anything: a catalogue missing a program exercise throws
  // here and leaves the current program intact.
  const templates = resolveProgram(PROGRAM, exercises as Exercise[]);

  const { error: delErr } = await db.from("planned_workouts").delete().eq("user_id", userId);
  if (delErr) throw new Error(`failed to clear old program: ${delErr.message}`);

  for (const t of templates) {
    const { data: pw, error: pwErr } = await db
      .from("planned_workouts")
      .insert({
        user_id: userId,
        label: t.templateLabel,
        day_of_week: t.day,
        order_in_week: ORDER.indexOf(t.day) + 1,
        is_home_workout: t.isHomeWorkout,
      })
      .select()
      .single();

    if (pwErr || !pw) {
      throw new Error(`failed to write the ${t.day} session: ${pwErr?.message ?? "no row returned"}`);
    }

    const { data: rows, error: peErr } = await db
      .from("planned_exercises")
      .insert(
        t.exercises.map((e) => ({
          user_id: userId,
          planned_workout_id: pw.id,
          exercise_id: e.exercise.id,
          order_index: e.order_index,
          target_sets: e.target_sets,
          target_reps_min: e.target_reps_min,
          target_reps_max: e.target_reps_max,
          progression_increment_kg: e.progression_increment_kg,
        }))
      )
      .select("id");

    if (peErr) throw new Error(`failed to write the ${t.day} exercises: ${peErr.message}`);
    if (!rows || rows.length !== t.exercises.length) {
      throw new Error(
        `wrote ${rows?.length ?? 0} of ${t.exercises.length} exercises for ${t.day} — the program is incomplete`
      );
    }
  }
}
