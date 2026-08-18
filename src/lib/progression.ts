import type { WorkoutSet, PlannedExercise, ProgressionSuggestion } from "@/types";

// Given the history of sets for an exercise, suggest what to do today.
//
// Two separate progression models, because home and gym progress differently:
//
//   LOADED (progression_increment_kg > 0) — add weight once every set hits the top of
//   the rep range.
//
//   BODYWEIGHT (increment 0) — there is nothing to add. Home has a table, an ab wheel
//   and bodyweight, so progression is reps and then leverage: once the top of the range
//   falls across all sets, the next phase variant is the progression. This path used to
//   fall through to the loaded branch and produce "Great work! Increase to 0kg today",
//   which was both wrong and useless — it covers 42 of the week's 81 sets.

/**
 * The sets from the single most recent session, oldest-first within that session.
 *
 * The API returns sets for the last few sessions in one flat list, newest first. Two
 * things went wrong when that list was used directly:
 *
 *   • `sets[sets.length - 1]` was treated as "last time", but in a newest-first list
 *     that's the OLDEST set — so the last-session readout could show a set from
 *     several sessions ago.
 *   • the increase check ran `.every()` across the whole list, so it demanded that
 *     every set of the last ~3 sessions hit the top of the rep range. One 11-rep set
 *     weeks earlier blocked progression indefinitely.
 *
 * Grouping by session and keeping only the newest fixes both. Older sessions stay in
 * the response for history; they just no longer gate today's decision.
 */
function lastSessionSets(sets: WorkoutSet[]): WorkoutSet[] {
  if (sets.length === 0) return [];

  const bySession = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const group = bySession.get(s.session_id);
    if (group) group.push(s);
    else bySession.set(s.session_id, [s]);
  }

  // Most recent session = the one containing the newest completed_at.
  let newest: WorkoutSet[] = [];
  let newestAt = -Infinity;
  for (const group of bySession.values()) {
    const at = Math.max(...group.map((s) => new Date(s.completed_at).getTime()));
    if (at > newestAt) {
      newestAt = at;
      newest = group;
    }
  }

  return [...newest].sort((a, b) => a.set_number - b.set_number);
}

export function getProgressionSuggestion(
  plannedExercise: PlannedExercise,
  recentSets: WorkoutSet[],
  nextVariantName?: string | null
): ProgressionSuggestion {
  const exerciseId = plannedExercise.exercise_id;
  const increment = plannedExercise.progression_increment_kg;
  const isBodyweight = increment === 0;

  // Judge today against last time only — not against a rolling window of sessions.
  const lastSession = lastSessionSets(recentSets);

  if (lastSession.length === 0) {
    return {
      exercise_id: exerciseId,
      suggested_weight_kg: 0,
      last_weight_kg: null,
      last_reps: null,
      message: isBodyweight
        ? "First time — find a version you can control for every rep."
        : "First time — start light and focus on form.",
      is_increase: false,
    };
  }

  // The heaviest set of last session is the honest reference point: warm-up or
  // back-off sets shouldn't drag the suggestion down.
  const topSet = lastSession.reduce((a, b) => (b.weight_kg > a.weight_kg ? b : a));
  const lastWeight = topSet.weight_kg;
  const lastReps = topSet.reps;

  const allHitMax = lastSession.every((s) => s.reps >= plannedExercise.target_reps_max);
  const anyHitMin = lastSession.some((s) => s.reps >= plannedExercise.target_reps_min);

  // ── Bodyweight: reps, then leverage ──────────────────────────────────────
  if (isBodyweight) {
    const unit = plannedExercise.target_reps_min >= 20 ? "seconds" : "reps";

    if (allHitMax) {
      return {
        exercise_id: exerciseId,
        suggested_weight_kg: 0,
        last_weight_kg: null,
        last_reps: lastReps,
        message: nextVariantName
          ? `You're at the top of the range across every set — time to move up to ${nextVariantName}.`
          : `Top of the range on every set. Slow the tempo down and pause at the hardest point to keep making it harder.`,
        is_increase: true,
      };
    }

    if (anyHitMin) {
      return {
        exercise_id: exerciseId,
        suggested_weight_kg: 0,
        last_weight_kg: null,
        last_reps: lastReps,
        message: `Last time: ${lastReps} ${unit}. Add a rep where you can — ${plannedExercise.target_reps_max} across all sets unlocks the next variant.`,
        is_increase: false,
      };
    }

    return {
      exercise_id: exerciseId,
      suggested_weight_kg: 0,
      last_weight_kg: null,
      last_reps: lastReps,
      message: `Last time: ${lastReps} ${unit}. Aim for ${plannedExercise.target_reps_min} — regress the leverage if you can't get there with clean form.`,
      is_increase: false,
    };
  }

  // ── Loaded: add weight ───────────────────────────────────────────────────
  if (allHitMax) {
    const newWeight = lastWeight + increment;
    return {
      exercise_id: exerciseId,
      suggested_weight_kg: newWeight,
      last_weight_kg: lastWeight,
      last_reps: lastReps,
      message: `Great work! Increase to ${newWeight}kg today.`,
      is_increase: true,
    };
  }

  if (anyHitMin) {
    return {
      exercise_id: exerciseId,
      suggested_weight_kg: lastWeight,
      last_weight_kg: lastWeight,
      last_reps: lastReps,
      message: `Match last time: ${lastWeight}kg. Hit all ${plannedExercise.target_reps_max} reps to progress.`,
      is_increase: false,
    };
  }

  const deloadWeight = Math.max(0, lastWeight - increment);
  return {
    exercise_id: exerciseId,
    suggested_weight_kg: deloadWeight,
    last_weight_kg: lastWeight,
    last_reps: lastReps,
    message: `Drop slightly to ${deloadWeight}kg and rebuild. Recovery is progress too.`,
    is_increase: false,
  };
}
