import type { UserSettings, Exercise, DayOfWeek } from "@/types";

export interface WorkoutTemplate {
  label: string;
  day_of_week: DayOfWeek;
  order_in_week: number;
  is_home_workout: boolean;
  slots: ExerciseSlot[];
}

interface ExerciseSlot {
  category: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  progression_increment_kg: number;
  isVerticalPull?: boolean;
  isVerticalPush?: boolean;
  preferredExercise?: string;
}

function slot(
  category: string,
  sets = 3,
  repsMin = 8,
  repsMax = 12,
  increment = 2.5,
  opts?: { isVerticalPull?: boolean; isVerticalPush?: boolean; preferredExercise?: string }
): ExerciseSlot {
  return {
    category,
    target_sets: sets,
    target_reps_min: repsMin,
    target_reps_max: repsMax,
    progression_increment_kg: increment,
    ...opts,
  };
}

// ─────────────────────────────────────────────────────────
// GYM WORKOUT TEMPLATES
//
// Science rationale for each day:
//
// Gym A — Hinge + Pull focus
//   RDL is the cornerstone longevity exercise (posterior chain, zero spinal compressive load).
//   Two pulls (horizontal + vertical) counterbalance ALL the pushing done in modern life.
//   Landmine Press adds the one vertical press of the week here — spreading pressing
//     across all three gym days (A vertical, B horizontal incline, C horizontal floor)
//     keeps per-session shoulder load low for cranky shoulders, and balances the week to
//     3 pushes / 3 pulls, each with 1 vertical + 2 horizontal.
//   Farmer's Walk is the single best functional exercise — trains grip, posture, gait, core.
//   Pallof Press (anti-rotation) covers the most clinically-relevant core function.
//   Face Pull is mandatory for shoulder health — do it every gym session.
//
// Gym B — Squat + Push focus
//   Goblet Squat teaches the pattern safely before loading.
//   Bulgarian Split Squat: single-leg strength has the strongest correlation with longevity outcomes.
//   Incline press is shoulder-friendly due to the arm angle.
//   Seated Cable Row balances the day's pressing work.
//   Ab Wheel is the hardest anti-extension core exercise — more challenging than plank.
//   Y-T-W directly trains the scapular stabilizers that protect every pressing movement.
//
// Gym C — Glute/Hip + Carry focus
//   Hip Thrust loads the glutes with minimal spinal involvement.
//   Step Up continues single-leg work from Day B.
//   Floor Press: ROM limited by floor = natural shoulder protection.
//   Suitcase Carry: anti-lateral flexion, the most neglected core function.
//   Cable Crunch: training spinal flexion under load is important for spine resilience.
// ─────────────────────────────────────────────────────────

const GYM_A_SLOTS: ExerciseSlot[] = [
  slot("hinge",          4, 6, 10, 5.0, { preferredExercise: "Dumbbell Romanian Deadlift" }),
  slot("pull",           3, 8, 12, 2.5, { preferredExercise: "Chest Supported Row" }),
  slot("pull",           3, 8, 12, 2.5, { isVerticalPull: true }),
  slot("push",           3, 8, 12, 2.5, { isVerticalPush: true }),
  slot("carry",          3, 20, 30, 2.5, { preferredExercise: "Farmer's Walk" }),
  slot("core",           3, 10, 12, 0,   { preferredExercise: "Pallof Press" }),
  slot("shoulder_health",3, 15, 20, 0,   { preferredExercise: "Cable Face Pull" }),
];

const GYM_B_SLOTS: ExerciseSlot[] = [
  slot("squat",          3, 8, 12, 2.5, { preferredExercise: "Goblet Squat" }),
  slot("squat",          3, 8, 12, 2.5, { preferredExercise: "Bulgarian Split Squat" }),
  slot("push",           3, 8, 12, 2.5, { preferredExercise: "Incline Dumbbell Press" }),
  slot("pull",           3, 8, 12, 2.5, { preferredExercise: "Seated Cable Row" }),
  slot("core",           3, 6, 10, 0,   { preferredExercise: "Ab Wheel Rollout" }),
  slot("shoulder_health",3, 12, 15, 0,  { preferredExercise: "Y-T-W on Incline Bench" }),
];

const GYM_C_SLOTS: ExerciseSlot[] = [
  slot("hinge",          3, 10, 15, 2.5, { preferredExercise: "Hip Thrust" }),
  slot("squat",          3, 10, 12, 2.5, { preferredExercise: "Step Up" }),
  slot("push",           3, 8, 12, 2.5,  { preferredExercise: "Dumbbell Floor Press" }),
  slot("carry",          3, 20, 30, 2.5, { preferredExercise: "Suitcase Carry" }),
  slot("core",           3, 12, 15, 0,   { preferredExercise: "Cable Crunch" }),
  slot("shoulder_health",3, 15, 20, 0,   { preferredExercise: "Cable Face Pull" }),
];

const GYM_TEMPLATES = [
  { label: "Gym A — Hinge & Pull", slots: GYM_A_SLOTS },
  { label: "Gym B — Squat & Push", slots: GYM_B_SLOTS },
  { label: "Gym C — Glute & Carry", slots: GYM_C_SLOTS },
];

// ─────────────────────────────────────────────────────────
// HOME WORKOUT TEMPLATES
//
// Home A — Push + Anti-Extension Core
//   Plank and Dead Bug are McGill's top anti-extension exercises.
//   Push-Up is the best upper-body bodyweight compound movement.
//   Pike Push-Up adds vertical pressing to maintain shoulder function.
//   Side Plank adds anti-lateral flexion.
//   Hollow Body Hold builds full-body tension/core control.
//
// Home B — Posterior Chain + Core Variety
//   Single Leg Glute Bridge — hip extension without any equipment.
//   Reverse Lunge — single-leg pattern maintenance between gym sessions.
//   Bird Dog — Dr. McGill's #1 exercise for lower back health.
//   Superman Hold — counteracts flexion dominance of daily life.
//   Push-Up variation keeps pushing volume high.
// ─────────────────────────────────────────────────────────

const HOME_A_SLOTS: ExerciseSlot[] = [
  slot("core",  3, 30, 60, 0, { preferredExercise: "Plank" }),
  slot("push",  3, 8, 15, 0,  { preferredExercise: "Push-Up" }),
  slot("core",  3, 8, 10, 0,  { preferredExercise: "Dead Bug" }),
  slot("core",  3, 30, 45, 0, { preferredExercise: "Side Plank" }),
  slot("push",  3, 8, 12, 0,  { preferredExercise: "Pike Push-Up" }),
  slot("core",  3, 20, 30, 0, { preferredExercise: "Hollow Body Hold" }),
];

const HOME_B_SLOTS: ExerciseSlot[] = [
  slot("hinge", 3, 12, 20, 0, { preferredExercise: "Single Leg Glute Bridge" }),
  slot("squat", 3, 10, 15, 0, { preferredExercise: "Reverse Lunge" }),
  slot("core",  3, 8, 10, 0,  { preferredExercise: "Bird Dog" }),
  slot("push",  3, 8, 15, 0,  { preferredExercise: "Push-Up" }),
  slot("core",  3, 10, 12, 0, { preferredExercise: "Superman Hold" }),
  slot("core",  3, 30, 60, 0, { preferredExercise: "Plank" }),
];

const HOME_TEMPLATES = [
  { label: "Home A — Core & Push", slots: HOME_A_SLOTS },
  { label: "Home B — Lower & Core", slots: HOME_B_SLOTS },
];

// ─────────────────────────────────────────────────────────

const VERTICAL_PULL_POOL = ["Lat Pulldown", "Assisted Pull-Up", "Pull-Up"];
const HORIZONTAL_PULL_POOL = ["Chest Supported Row", "Seated Cable Row", "Machine Row", "Dumbbell Single Arm Row"];
// Landmine Press first (shoulder-friendly arc, Phase 1); DB Shoulder Press unlocks Phase 2.
const VERTICAL_PUSH_POOL = ["Landmine Press", "Dumbbell Shoulder Press"];

function pickExercise(
  slot: ExerciseSlot,
  usedNames: Set<string>,
  exercises: Exercise[]
): Exercise | null {
  const { category, isVerticalPull, isVerticalPush, preferredExercise } = slot;

  // 1. Try the explicit preferred exercise first
  if (preferredExercise && !usedNames.has(preferredExercise)) {
    const ex = exercises.find((e) => e.name === preferredExercise);
    if (ex) { usedNames.add(ex.name); return ex; }
  }

  // 2. For pull slots, choose horizontal or vertical pool
  if (category === "pull") {
    const pool = isVerticalPull ? VERTICAL_PULL_POOL : HORIZONTAL_PULL_POOL;
    for (const name of pool) {
      if (usedNames.has(name)) continue;
      const ex = exercises.find((e) => e.name === name);
      if (ex) { usedNames.add(name); return ex; }
    }
  }

  // 2b. For a vertical-push slot, prefer the vertical pressing pool
  if (category === "push" && isVerticalPush) {
    for (const name of VERTICAL_PUSH_POOL) {
      if (usedNames.has(name)) continue;
      const ex = exercises.find((e) => e.name === name);
      if (ex) { usedNames.add(name); return ex; }
    }
  }

  // 3. Fallback: any exercise in category not yet used
  for (const ex of exercises.filter((e) => e.category === category)) {
    if (!usedNames.has(ex.name)) { usedNames.add(ex.name); return ex; }
  }

  return null;
}

// Generate the full workout week plan (gym + home days combined)
export function generateWorkoutPlan(
  settings: UserSettings,
  exercises: Exercise[]
): WorkoutTemplate[] {
  const gymDays = settings.training_days ?? [];
  const homeDays = settings.home_days ?? [];

  const gymExercises = exercises.filter(
    (e) => e.phase_unlock <= settings.current_phase && e.shoulder_safe && e.lower_back_safe
  );
  const homeExercises = exercises.filter((e) => e.home_compatible);

  const templates: WorkoutTemplate[] = [];
  let orderIndex = 0;

  // Assign gym workouts cycling A→B→C
  gymDays.forEach((day, i) => {
    const t = GYM_TEMPLATES[i % GYM_TEMPLATES.length];
    templates.push({
      label: t.label,
      day_of_week: day,
      order_in_week: orderIndex++,
      is_home_workout: false,
      slots: t.slots,
    });
  });

  // Assign home workouts cycling A→B
  homeDays.forEach((day, i) => {
    const t = HOME_TEMPLATES[i % HOME_TEMPLATES.length];
    templates.push({
      label: t.label,
      day_of_week: day,
      order_in_week: orderIndex++,
      is_home_workout: true,
      slots: t.slots,
    });
  });

  // Sort by natural week order
  const DAY_ORDER: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 7,
  };
  templates.sort((a, b) => DAY_ORDER[a.day_of_week] - DAY_ORDER[b.day_of_week]);
  templates.forEach((t, i) => (t.order_in_week = i + 1));

  return templates;
}

// Resolve actual exercises for each template
export function resolveExercisesForTemplates(
  templates: WorkoutTemplate[],
  allExercises: Exercise[]
): Array<{
  templateLabel: string;
  templateDay: DayOfWeek;
  isHomeWorkout: boolean;
  exercises: Array<{
    exercise: Exercise;
    order_index: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    progression_increment_kg: number;
  }>;
}> {
  const gymExercises = allExercises.filter(
    (e) => e.phase_unlock <= 1 && e.shoulder_safe && e.lower_back_safe
  );
  const homeExercises = allExercises.filter((e) => e.home_compatible);

  return templates.map((template) => {
    const usedNames = new Set<string>();
    const pool = template.is_home_workout ? homeExercises : gymExercises;

    const resolved = template.slots.map((slot, i) => {
      const ex = pickExercise(slot, usedNames, pool);
      if (!ex) return null;

      return {
        exercise: ex,
        order_index: i,
        target_sets: slot.target_sets,
        target_reps_min: slot.target_reps_min,
        target_reps_max: slot.target_reps_max,
        progression_increment_kg: slot.progression_increment_kg,
      };
    }).filter(Boolean) as Array<{
      exercise: Exercise;
      order_index: number;
      target_sets: number;
      target_reps_min: number;
      target_reps_max: number;
      progression_increment_kg: number;
    }>;

    return {
      templateLabel: template.label,
      templateDay: template.day_of_week,
      isHomeWorkout: template.is_home_workout,
      exercises: resolved,
    };
  });
}
