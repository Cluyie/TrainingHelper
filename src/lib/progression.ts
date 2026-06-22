import type { WorkoutSet, PlannedExercise, ProgressionSuggestion } from "@/types";

// Given the history of sets for an exercise across sessions, return a suggestion
export function getProgressionSuggestion(
  plannedExercise: PlannedExercise,
  recentSets: WorkoutSet[]
): ProgressionSuggestion {
  const exerciseId = plannedExercise.exercise_id;

  if (recentSets.length === 0) {
    return {
      exercise_id: exerciseId,
      suggested_weight_kg: 0,
      last_weight_kg: null,
      last_reps: null,
      message: "First time — start light and focus on form.",
      is_increase: false,
    };
  }

  // Use the most recent session's sets for this exercise
  const lastWeight = recentSets[recentSets.length - 1].weight_kg;
  const lastReps = recentSets[recentSets.length - 1].reps;

  // Group sets by checking if all hit the top of the rep range
  const allHitMax = recentSets.every((s) => s.reps >= plannedExercise.target_reps_max);
  const anyHitMin = recentSets.some((s) => s.reps >= plannedExercise.target_reps_min);
  const increment = plannedExercise.progression_increment_kg;

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

  // Missed minimum — slight deload
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
