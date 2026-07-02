import type { UserSettings, Exercise, DayOfWeek } from "@/types";

export interface WorkoutTemplate {
  label: string;
  focus: string; // primary stress, used to vary sessions day-to-day
  day_of_week: DayOfWeek;
  order_in_week: number;
  is_home_workout: boolean;
  slots: ExerciseSlot[];
}

interface PhaseUpgrade {
  name: string;
  phase: number;
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
  // Harder variants to swap in once the user's phase unlocks them (best first).
  phaseUpgrades?: PhaseUpgrade[];
}

function slot(
  category: string,
  sets = 3,
  repsMin = 8,
  repsMax = 12,
  increment = 2.5,
  opts?: {
    isVerticalPull?: boolean;
    isVerticalPush?: boolean;
    preferredExercise?: string;
    phaseUpgrades?: PhaseUpgrade[];
  }
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
//   Trap Bar Deadlift is the heavy anchor lift — shoulder-friendly (neutral grip, no bar
//     on the back), kept to 3-5 strong reps and never ground to failure.
//   Bulgarian Split Squat: single-leg strength has the strongest correlation with longevity outcomes.
//   Incline press is shoulder-friendly due to the arm angle.
//   Seated Cable Row balances the day's pressing work.
//   Hollow Body Hold: a hard anti-extension core hold needing no equipment.
//   Y-T-W directly trains the scapular stabilizers that protect every pressing movement.
//
// Gym C — Glute/Hip + Carry focus
//   Hip Thrust loads the glutes with minimal spinal involvement.
//   Step Up continues single-leg work from Day B.
//   Floor Press: ROM limited by floor = natural shoulder protection.
//   Suitcase Carry: anti-lateral flexion, the most neglected core function.
//   Cable Crunch: training spinal flexion under load is important for spine resilience.
//
// Phase progression (phaseUpgrades / the vertical pools): the slots default to the
// shoulder-friendly Phase-1 variant and automatically swap to the harder lift once the
// user raises their phase — Barbell RDL @ P2, DB Shoulder Press & Pull-Up @ P2.
// Phase is a manual self-assessment gate the user controls in Settings.
//
// POWER work leads every session (first slot): explosive jumps / kettlebell swings,
// 3-5 reps, full rest, ALWAYS fresh and NEVER to failure. This is low-fatigue neural
// work, not added volume — it preserves the fast-twitch power that fades fastest with
// age without compromising recovery on the strength work that follows.
// ─────────────────────────────────────────────────────────

const GYM_A_SLOTS: ExerciseSlot[] = [
  slot("power",          3, 3, 5, 0,   { preferredExercise: "Box Jump" }),
  slot("hinge",          4, 6, 10, 5.0, {
    preferredExercise: "Dumbbell Romanian Deadlift",
    phaseUpgrades: [{ name: "Barbell Romanian Deadlift", phase: 2 }],
  }),
  slot("pull",           3, 8, 12, 2.5, { preferredExercise: "Chest Supported Row" }),
  slot("pull",           3, 8, 12, 2.5, { isVerticalPull: true }),
  slot("push",           3, 8, 12, 2.5, { isVerticalPush: true }),
  slot("carry",          3, 20, 30, 2.5, { preferredExercise: "Farmer's Walk" }),
  slot("core",           3, 10, 12, 0,   { preferredExercise: "Pallof Press" }),
  slot("shoulder_health",3, 15, 20, 0,   { preferredExercise: "Cable Face Pull" }),
];

const GYM_B_SLOTS: ExerciseSlot[] = [
  slot("power",          3, 10, 12, 0,  { preferredExercise: "Kettlebell Swing" }),
  // Heavy anchor lift. Trap Bar Deadlift is the shoulder-friendly default; Safety Bar
  // Squat is the manual fallback if the trap bar isn't available.
  slot("squat",          3, 3, 5, 5.0,  { preferredExercise: "Trap Bar Deadlift" }),
  slot("squat",          3, 8, 12, 2.5, { preferredExercise: "Bulgarian Split Squat" }),
  slot("push",           3, 8, 12, 2.5, { preferredExercise: "Incline Dumbbell Press" }),
  slot("pull",           3, 8, 12, 2.5, { preferredExercise: "Seated Cable Row" }),
  slot("core",           3, 20, 40, 0,  { preferredExercise: "Hollow Body Hold" }),
  slot("shoulder_health",3, 12, 15, 0,  { preferredExercise: "Y-T-W on Incline Bench" }),
];

const GYM_C_SLOTS: ExerciseSlot[] = [
  // Optional power — skip if kettlebell swings were already done on Gym B this week.
  slot("power",          3, 10, 12, 0,  { preferredExercise: "Kettlebell Swing" }),
  slot("hinge",          3, 10, 15, 2.5, { preferredExercise: "Hip Thrust" }),
  slot("squat",          3, 10, 12, 2.5, { preferredExercise: "Step Up" }),
  slot("push",           3, 8, 12, 2.5,  { preferredExercise: "Dumbbell Floor Press" }),
  slot("carry",          3, 20, 30, 2.5, { preferredExercise: "Suitcase Carry" }),
  slot("core",           3, 12, 15, 0,   { preferredExercise: "Cable Crunch" }),
  slot("shoulder_health",3, 15, 20, 0,   { preferredExercise: "Cable Face Pull" }),
];

const GYM_TEMPLATES = [
  { label: "Gym A — Hinge & Pull", focus: "posterior", slots: GYM_A_SLOTS },
  { label: "Gym B — Squat & Push", focus: "quad",      slots: GYM_B_SLOTS },
  { label: "Gym C — Glute & Carry", focus: "glute",    slots: GYM_C_SLOTS },
];

// ─────────────────────────────────────────────────────────
// HOME WORKOUT TEMPLATES (bodyweight only — real training, not filler)
//
// Both home days now include a PULL (Inverted Row under a sturdy table) and a hinge,
// so a home-heavy week still trains the posterior chain and protects the shoulders —
// the gym program's whole point. Carries and loaded vertical pulls stay gym-only
// (they need load / a bar), but the shoulder-protective pulling pattern is fully covered
// at home via the row + Prone Y-T-W.
//
// Home A — Push, Pull & Core
//   Push-Up: best upper-body bodyweight compound. Incline Pike Push-Up adds the vertical
//   press (hands elevated — the floor pike position wasn't accessible; progress downward).
//   Inverted Row: the missing home horizontal pull — balances all the pushing.
//   Ab Wheel Rollout: the hardest anti-extension core exercise (needs only an ab wheel).
//   Plank + Dead Bug: McGill's top anti-extension exercises.
//   Prone Y-T-W: no-equipment scapular-stabiliser work — shoulder health every home day.
//
// Home B — Lower, Pull & Core
//   Single Leg Glute Bridge: hip extension / hinge with no equipment.
//   Reverse Lunge: single-leg squat pattern maintenance between gym sessions.
//   Inverted Row: keeps pulling volume up on the lower-body day too.
//   Side Plank (anti-lateral flexion), Bird Dog (McGill's #1 for the lower back),
//   Superman Hold (counteracts the flexion dominance of daily life).
// ─────────────────────────────────────────────────────────

const HOME_A_SLOTS: ExerciseSlot[] = [
  slot("power", 3, 3, 5, 0,   { preferredExercise: "Broad Jump" }),
  slot("push",  3, 8, 15, 0,  { preferredExercise: "Push-Up" }),
  slot("push",  3, 8, 12, 0,  { preferredExercise: "Incline Pike Push-Up" }),
  slot("pull",  3, 8, 12, 0,  { preferredExercise: "Inverted Row" }),
  slot("core",  3, 6, 10, 0,  { preferredExercise: "Ab Wheel Rollout" }),
  slot("core",  3, 30, 60, 0, { preferredExercise: "Plank" }),
  slot("core",  3, 8, 10, 0,  { preferredExercise: "Dead Bug" }),
  slot("shoulder_health", 3, 8, 12, 0, { preferredExercise: "Prone Y-T-W (Floor)" }),
];

const HOME_B_SLOTS: ExerciseSlot[] = [
  slot("power", 3, 3, 5, 0,   { preferredExercise: "Vertical Jump" }),
  slot("hinge", 3, 12, 20, 0, { preferredExercise: "Single Leg Glute Bridge" }),
  slot("squat", 3, 10, 15, 0, { preferredExercise: "Reverse Lunge" }),
  slot("pull",  3, 8, 12, 0,  { preferredExercise: "Inverted Row" }),
  slot("core",  3, 30, 45, 0, { preferredExercise: "Side Plank" }),
  slot("core",  3, 8, 10, 0,  { preferredExercise: "Bird Dog" }),
  slot("core",  3, 20, 30, 0, { preferredExercise: "Superman Hold" }),
];

const HOME_TEMPLATES = [
  { label: "Home A — Push, Pull & Core", focus: "upper", slots: HOME_A_SLOTS },
  { label: "Home B — Lower, Pull & Core", focus: "lower", slots: HOME_B_SLOTS },
];

// ─────────────────────────────────────────────────────────

const VERTICAL_PULL_POOL = ["Lat Pulldown", "Assisted Pull-Up", "Pull-Up"];
const HORIZONTAL_PULL_POOL = ["Chest Supported Row", "Seated Cable Row", "Machine Row", "Dumbbell Single Arm Row"];
// Landmine Press (shoulder-friendly arc, Phase 1); DB Shoulder Press unlocks Phase 2.
const VERTICAL_PUSH_POOL = ["Landmine Press", "Dumbbell Shoulder Press"];

const DAY_ORDER: Record<DayOfWeek, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
};

// From a pool of exercise names, pick the most advanced one the user's phase has
// unlocked (highest phase_unlock among those present in `exercises`), unused.
function pickFromPool(
  pool: string[],
  usedNames: Set<string>,
  exercises: Exercise[]
): Exercise | null {
  const ranked = pool
    .map((name) => exercises.find((e) => e.name === name))
    .filter((e): e is Exercise => !!e && !usedNames.has(e.name))
    .sort((a, b) => b.phase_unlock - a.phase_unlock);
  const ex = ranked[0];
  if (ex) { usedNames.add(ex.name); return ex; }
  return null;
}

function pickExercise(
  slot: ExerciseSlot,
  usedNames: Set<string>,
  exercises: Exercise[],
  currentPhase: number
): Exercise | null {
  const { category, isVerticalPull, isVerticalPush, preferredExercise, phaseUpgrades } = slot;

  // 1. Phase upgrade — swap in the hardest unlocked variant (best first).
  if (phaseUpgrades) {
    const unlocked = phaseUpgrades
      .filter((u) => u.phase <= currentPhase)
      .sort((a, b) => b.phase - a.phase);
    for (const u of unlocked) {
      if (usedNames.has(u.name)) continue;
      const ex = exercises.find((e) => e.name === u.name);
      if (ex) { usedNames.add(ex.name); return ex; }
    }
  }

  // 2. The explicit preferred (Phase-1 default) exercise.
  if (preferredExercise && !usedNames.has(preferredExercise)) {
    const ex = exercises.find((e) => e.name === preferredExercise);
    if (ex) { usedNames.add(ex.name); return ex; }
  }

  // 3. Pull slots choose from the horizontal or vertical pool (phase-aware).
  if (category === "pull") {
    const fromPool = pickFromPool(
      isVerticalPull ? VERTICAL_PULL_POOL : HORIZONTAL_PULL_POOL,
      usedNames,
      exercises
    );
    if (fromPool) return fromPool;
  }

  // 3b. Vertical-push slot prefers the vertical pressing pool (phase-aware).
  if (category === "push" && isVerticalPush) {
    const fromPool = pickFromPool(VERTICAL_PUSH_POOL, usedNames, exercises);
    if (fromPool) return fromPool;
  }

  // 4. Fallback: any exercise in the category not yet used.
  for (const ex of exercises.filter((e) => e.category === category)) {
    if (!usedNames.has(ex.name)) { usedNames.add(ex.name); return ex; }
  }

  return null;
}

// Generate the week plan (gym + home days combined), 3–6 days, any gym/home mix.
// Templates are assigned in calendar order, cycling gym A→B→C and home A→B. Because
// assignment follows the calendar, two consecutive same-type days always get different
// templates — so you never repeat the same session two days running.
export function generateWorkoutPlan(settings: UserSettings): WorkoutTemplate[] {
  const gymDays = settings.training_days ?? [];
  const homeDays = settings.home_days ?? [];

  const days = [
    ...gymDays.map((day) => ({ day, home: false })),
    ...homeDays.map((day) => ({ day, home: true })),
  ].sort((a, b) => DAY_ORDER[a.day] - DAY_ORDER[b.day]);

  let gymIdx = 0;
  let homeIdx = 0;

  return days.map(({ day, home }, i) => {
    const t = home
      ? HOME_TEMPLATES[homeIdx++ % HOME_TEMPLATES.length]
      : GYM_TEMPLATES[gymIdx++ % GYM_TEMPLATES.length];
    return {
      label: t.label,
      focus: t.focus,
      day_of_week: day,
      order_in_week: i + 1,
      is_home_workout: home,
      slots: t.slots,
    };
  });
}

// Resolve actual exercises for each template, respecting the user's current phase.
export function resolveExercisesForTemplates(
  templates: WorkoutTemplate[],
  allExercises: Exercise[],
  currentPhase: number
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
  // Gym pool is gated by phase only: phase_unlock already encodes shoulder/back
  // readiness (every Phase-1 lift is shoulder- & back-safe; the heavier barbell
  // variants sit behind the phases the user opts into).
  const gymExercises = allExercises.filter((e) => e.phase_unlock <= currentPhase);
  const homeExercises = allExercises.filter((e) => e.home_compatible);

  return templates.map((template) => {
    const usedNames = new Set<string>();
    const pool = template.is_home_workout ? homeExercises : gymExercises;

    const resolved = template.slots.map((slot, i) => {
      const ex = pickExercise(slot, usedNames, pool, currentPhase);
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
