// ============================================================
// Persistence for the generated week (server-only).
//
// buildWeek() in week-builder.ts is pure; this is where its output reaches the
// database. Kept out of the route handlers so both write paths — the settings route
// for strength, the running route for the weekly running refresh — share one
// implementation.
//
// ── Why the two paths have different cadences ────────────────────────────────
// Strength templates are stable within a phase, and clearing planned_workouts nulls
// workout_sessions.planned_workout_id (ON DELETE SET NULL). Regenerating strength
// every week would therefore unlink logged history week after week. Running content
// genuinely changes weekly as the block advances, so it refreshes on read instead.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWeek, type BuiltWeek } from "@/lib/week-builder";
import { computeBlockState } from "@/lib/deload";
import type { Phase, UserSettings } from "@/types";

/**
 * Replace this block-week's unrun sessions. Completed runs are history — never touched.
 *
 * Scoped by block AND week. program_week is 1..6 and repeats, so keying on it alone
 * made this delete reach back into every previous block's copy of the same week number.
 *
 * Throws on a failed write. A rebuild that deletes the week's rows and then fails to
 * insert leaves the week empty, which the UI renders as "no runs scheduled yet" — the
 * same thing it shows for a week that genuinely has nothing to do. Silence here is
 * indistinguishable from success, so it isn't allowed to be silent.
 */
export async function writeRunningWeek(
  userId: string,
  blockIndex: number,
  weekInBlock: number,
  week: Pick<BuiltWeek, "runs">
): Promise<void> {
  const db = getSupabaseAdmin();

  const { error: delErr } = await db
    .from("running_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("block_index", blockIndex)
    .eq("program_week", weekInBlock)
    .eq("completed", false);

  if (delErr) {
    throw new Error(
      `failed to clear unrun runs for block ${blockIndex} week ${weekInBlock}: ${delErr.message}`
    );
  }

  if (week.runs.length === 0) return;

  const { data: inserted, error: insErr } = await db
    .from("running_sessions")
    .insert(
      week.runs.map(({ run, day }) => ({
        user_id: userId,
        block_index: blockIndex,
        program_week: weekInBlock,
        session_in_week: run.session_in_week,
        day_of_week: day,
        type: run.type,
        target_duration_min: run.target_duration_min,
        target_description: run.target_description,
        optional: run.optional,
        completed: false,
      }))
    )
    .select("id");

  if (insErr) {
    throw new Error(
      `failed to write runs for block ${blockIndex} week ${weekInBlock}: ${insErr.message}`
    );
  }

  // A write that is accepted but stores nothing is its own failure mode, distinct from
  // a rejected one, and the delete above has already run by this point.
  if (!inserted || inserted.length !== week.runs.length) {
    throw new Error(
      `wrote ${inserted?.length ?? 0} of ${week.runs.length} runs for block ${blockIndex} ` +
        `week ${weekInBlock} — the week is now incomplete`
    );
  }
}

/** Write the placed strength sessions, replacing whatever was there. */
export async function writeStrengthWeek(userId: string, week: BuiltWeek): Promise<void> {
  const db = getSupabaseAdmin();

  // Must succeed before inserting — otherwise old workouts stack up.
  const { error: delErr } = await db.from("planned_workouts").delete().eq("user_id", userId);
  if (delErr) throw new Error(`failed to clear old program: ${delErr.message}`);

  for (const { template, day, orderInWeek } of week.strength) {
    const { data: pw, error: pwErr } = await db
      .from("planned_workouts")
      .insert({
        user_id: userId,
        label: template.templateLabel,
        day_of_week: day,
        order_in_week: orderInWeek,
        is_home_workout: template.isHomeWorkout,
      })
      .select()
      .single();

    if (pwErr || !pw) continue;
    if (template.exercises.length === 0) continue;

    await db.from("planned_exercises").insert(
      template.exercises.map((e) => ({
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

/**
 * Regenerate the whole week — strength AND running — against one shared load model.
 * Called when settings or phase change.
 */
export async function regenerateProgram(settings: UserSettings, userId: string): Promise<void> {
  const { data: exercises } = await getSupabaseAdmin().from("exercises").select("*");
  if (!exercises || exercises.length === 0) return;

  const block = computeBlockState(settings.strength_block_start);

  const week = buildWeek({
    currentPhase: settings.current_phase,
    runningPhase: (settings.running_phase ?? 1) as Phase,
    weekInBlock: block.weekInBlock,
    blockIndex: block.blockIndex,
    noGymDays: settings.no_gym_days ?? ["saturday", "sunday"],
    exercises,
  });

  await writeStrengthWeek(userId, week);
  await writeRunningWeek(userId, block.blockIndex, block.weekInBlock, week);
}
