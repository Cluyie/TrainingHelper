import type { Exercise, ExerciseCategory } from "@/types";
import { isLoaded } from "@/lib/training-load";

export interface WorkoutTemplate {
  label: string;
  focus: string;
  kind: "gym" | "home";
  slots: ExerciseSlot[];
}

interface PhaseUpgrade {
  name: string;
  phase: number;
}

interface ExerciseSlot {
  category: ExerciseCategory;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  progression_increment_kg: number;
  isVerticalPull?: boolean;
  isVerticalPush?: boolean;
  preferredExercise?: string;
  // Harder variants swapped in automatically once the user's phase unlocks them.
  phaseUpgrades?: PhaseUpgrade[];
}

function slot(
  category: ExerciseCategory,
  sets: number,
  repsMin: number,
  repsMax: number,
  increment: number,
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
// THE WEEK
//
// Five sessions: three gym, two home. Roughly 81 working sets a week, down from 112 —
// the cut came almost entirely out of redundant core and accessory volume, not out of
// movement patterns. All thirteen patterns are still covered: squat, hinge, horizontal
// and vertical push, horizontal and vertical pull, unilateral lower, carry,
// anti-extension core, anti-rotation core, power, calf/ankle and scapular health.
//
// Two rules shape which exercise lands where:
//
//   HOME FIRST — anything doable with a table, an ab wheel and bodyweight does not
//   occupy a gym slot. There is no reason to travel to a gym to do push-ups or planks.
//   Gym slots go where equipment genuinely buys something.
//
//   CABLE PREFERENCE — when two options are otherwise equivalent, the cable wins.
//   It does not override free weights where those are clearly better: the heavy
//   anchor, the RDL, carries and power work all stay free-weight. Research doesn't
//   show a universal hypertrophy edge either way, so this is a practical preference
//   rather than a claim that cables are superior.
//
// Power leads every session, always fresh, 2 sets, never to failure. It's low-fatigue
// neural work that preserves the fast-twitch capacity which fades earliest with age —
// not added volume. Each gym day uses a different power movement so nothing is
// repeated across the week.
// ─────────────────────────────────────────────────────────

// Gym A — hinge and pull. The RDL is the cornerstone posterior-chain lift and loads
// the hamstrings with no spinal compression. Two pulls against one press counterbalance
// a life spent facing forward. The week's only vertical press sits here, which keeps
// per-session shoulder load low. Face pulls every gym session, without exception.
const GYM_A_SLOTS: ExerciseSlot[] = [
  slot("power", 2, 10, 12, 4.0, { preferredExercise: "Kettlebell Swing" }),
  slot("hinge", 3, 6, 10, 5.0, {
    preferredExercise: "Dumbbell Romanian Deadlift",
    phaseUpgrades: [{ name: "Barbell Romanian Deadlift", phase: 2 }],
  }),
  slot("pull", 3, 8, 12, 2.5, {
    isVerticalPull: true,
    preferredExercise: "Lat Pulldown",
    phaseUpgrades: [
      { name: "Weighted Pull-Up", phase: 3 },
      { name: "Pull-Up", phase: 2 },
    ],
  }),
  slot("pull", 3, 8, 12, 2.5, { preferredExercise: "Seated Cable Row" }),
  slot("push", 3, 8, 12, 2.5, {
    isVerticalPush: true,
    preferredExercise: "Landmine Press",
    phaseUpgrades: [
      { name: "Barbell Overhead Press", phase: 3 },
      { name: "Dumbbell Shoulder Press", phase: 2 },
    ],
  }),
  slot("carry", 2, 20, 30, 2.5, { preferredExercise: "Farmer's Walk" }),
  slot("shoulder_health", 2, 15, 20, 2.5, { preferredExercise: "Cable Face Pull" }),
];

// Gym B — the heavy day. Trap bar is the anchor: neutral grip, no bar on the back,
// less spinal shear than a conventional pull. Kept to 3-5 strong reps, never ground
// out. Single-leg strength has the strongest link to staying functional with age, so
// the Bulgarian sits right behind it while the legs are still fresh.
const GYM_B_SLOTS: ExerciseSlot[] = [
  slot("power", 2, 5, 5, 1.0, { preferredExercise: "Medicine Ball Slam" }),
  slot("squat", 4, 3, 5, 5.0, {
    preferredExercise: "Trap Bar Deadlift",
    phaseUpgrades: [
      { name: "Barbell Back Squat", phase: 3 },
      { name: "Safety Bar Squat", phase: 2 },
    ],
  }),
  slot("squat", 3, 8, 12, 2.5, { preferredExercise: "Bulgarian Split Squat" }),
  slot("push", 3, 8, 12, 2.5, {
    preferredExercise: "Incline Dumbbell Press",
    phaseUpgrades: [{ name: "Barbell Bench Press", phase: 3 }],
  }),
  slot("pull", 3, 8, 12, 2.5, { preferredExercise: "Chest Supported Row" }),
  slot("core", 2, 12, 15, 2.5, { preferredExercise: "Cable Crunch" }),
];

// Gym C — glutes, carries and the second vertical pull. The hip thrust loads the
// glutes hard with the spine barely involved, which is exactly what a day after the
// heavy session should do. The pull here is VERTICAL: without it the week runs three
// vertical sets against eleven horizontal, and vertical pulling is the one pattern
// home training genuinely cannot cover.
const GYM_C_SLOTS: ExerciseSlot[] = [
  slot("power", 2, 5, 5, 1.0, { preferredExercise: "Medicine Ball Rotational Throw" }),
  slot("hinge", 3, 10, 15, 2.5, {
    preferredExercise: "Hip Thrust",
    phaseUpgrades: [{ name: "Barbell Hip Thrust", phase: 2 }],
  }),
  slot("squat", 3, 10, 12, 2.5, { preferredExercise: "Step Up" }),
  slot("push", 3, 8, 12, 2.5, { preferredExercise: "Cable Chest Press" }),
  slot("pull", 3, 8, 12, 2.5, {
    isVerticalPull: true,
    preferredExercise: "Half-Kneeling Cable Pulldown",
    phaseUpgrades: [
      { name: "Pull-Up", phase: 3 },
      { name: "Assisted Pull-Up", phase: 2 },
    ],
  }),
  slot("carry", 2, 20, 30, 2.5, { preferredExercise: "Suitcase Carry" }),
  slot("core", 2, 10, 12, 2.5, { preferredExercise: "Half-Kneeling Cable Chop" }),
];

// ─────────────────────────────────────────────────────────
// HOME SESSIONS — table, ab wheel, bodyweight. That is the entire inventory.
//
// There is nothing to add load to, so EVERY progression here is leverage, and the
// phase ladder is the only thing that makes a home day harder over time. That makes
// the phase filter on the home pool load-bearing rather than cosmetic — without it
// these sessions would never progress at all.
//
// Home sessions are deliberately cheaper than gym sessions (~14 sets, 25-40 min):
// they are supplemental, and the shared recovery budget is mostly spent at the gym
// and on the runs.
// ─────────────────────────────────────────────────────────

// Home A — upper body. Two presses and a pull, with the ab wheel covering
// anti-extension harder than any plank does, and shoulder taps covering the
// anti-rotation work that has no home equivalent of a Pallof press.
const HOME_A_SLOTS: ExerciseSlot[] = [
  slot("power", 2, 3, 5, 0, { preferredExercise: "Broad Jump" }),
  slot("push", 3, 8, 15, 0, {
    preferredExercise: "Push-Up",
    phaseUpgrades: [
      { name: "Deficit Push-Up", phase: 3 },
      { name: "Feet-Elevated Push-Up", phase: 2 },
    ],
  }),
  slot("push", 2, 8, 12, 0, {
    isVerticalPush: true,
    preferredExercise: "Incline Pike Push-Up",
    phaseUpgrades: [
      { name: "Deficit Pike Push-Up", phase: 3 },
      { name: "Pike Push-Up", phase: 2 },
    ],
  }),
  slot("pull", 3, 8, 12, 0, {
    preferredExercise: "Inverted Row",
    phaseUpgrades: [
      { name: "Archer Inverted Row", phase: 3 },
      { name: "Feet-Elevated Inverted Row", phase: 2 },
    ],
  }),
  slot("core", 2, 6, 10, 0, {
    preferredExercise: "Ab Wheel Rollout",
    phaseUpgrades: [
      { name: "Standing Rollout", phase: 3 },
      { name: "Long-Lever Rollout", phase: 2 },
    ],
  }),
  slot("shoulder_health", 2, 8, 12, 0, { preferredExercise: "Prone Y-T-W (Floor)" }),
];

// Home B — lower body. The table does real work: rear foot elevated for the Bulgarian,
// heel elevated for the glute bridge, and heels hooked underneath to anchor the Nordic
// curl — an elite hamstring exercise that costs nothing. Calf work is here because
// ankle strength underpins gait and balance, and running loads it hard.
const HOME_B_SLOTS: ExerciseSlot[] = [
  slot("power", 2, 3, 5, 0, { preferredExercise: "Vertical Jump" }),
  slot("hinge", 3, 12, 20, 0, {
    preferredExercise: "Single Leg Glute Bridge",
    phaseUpgrades: [
      { name: "Nordic Hamstring Curl", phase: 3 },
      { name: "Feet-Elevated Single Leg Glute Bridge", phase: 2 },
    ],
  }),
  slot("squat", 3, 10, 15, 0, {
    preferredExercise: "Reverse Lunge",
    phaseUpgrades: [
      { name: "Skater Squat", phase: 3 },
      { name: "Bulgarian Split Squat", phase: 2 },
    ],
  }),
  slot("pull", 2, 8, 12, 0, {
    preferredExercise: "Inverted Row",
    phaseUpgrades: [
      { name: "Archer Inverted Row", phase: 3 },
      { name: "Feet-Elevated Inverted Row", phase: 2 },
    ],
  }),
  slot("calf", 2, 12, 15, 0, { preferredExercise: "Single-Leg Calf Raise" }),
  slot("core", 2, 30, 45, 0, { preferredExercise: "Side Plank" }),
];

export const STRENGTH_TEMPLATES: WorkoutTemplate[] = [
  { label: "Gym A — Hinge & Pull", focus: "posterior", kind: "gym", slots: GYM_A_SLOTS },
  { label: "Gym B — Squat & Push", focus: "quad", kind: "gym", slots: GYM_B_SLOTS },
  { label: "Gym C — Glute, Pull & Carry", focus: "glute", kind: "gym", slots: GYM_C_SLOTS },
  { label: "Home A — Push, Pull & Core", focus: "upper", kind: "home", slots: HOME_A_SLOTS },
  { label: "Home B — Lower, Pull & Core", focus: "lower", kind: "home", slots: HOME_B_SLOTS },
];

/** The five strength sessions. Weekday placement belongs to the week planner. */
export function getStrengthTemplates(): WorkoutTemplate[] {
  return STRENGTH_TEMPLATES;
}

// ─────────────────────────────────────────────────────────

const VERTICAL_PULL_POOL = ["Lat Pulldown", "Half-Kneeling Cable Pulldown", "Assisted Pull-Up", "Pull-Up"];
const HORIZONTAL_PULL_POOL = ["Seated Cable Row", "Chest Supported Row", "Single Arm Cable Row", "Machine Row", "Dumbbell Single Arm Row"];
const VERTICAL_PUSH_POOL = ["Landmine Press", "Dumbbell Shoulder Press"];

/** Cable-first ordering, applied when nothing more specific decides the pick. */
function cablePreferred(a: Exercise, b: Exercise): number {
  const aCable = a.equipment.includes("cable") ? 0 : 1;
  const bCable = b.equipment.includes("cable") ? 0 : 1;
  return aCable - bCable;
}

// From a pool of names, take the most advanced one the user's phase has unlocked.
function pickFromPool(
  pool: string[],
  usedNames: Set<string>,
  exercises: Exercise[]
): Exercise | null {
  const ranked = pool
    .map((name) => exercises.find((e) => e.name === name))
    .filter((e): e is Exercise => !!e && !usedNames.has(e.name))
    .sort((a, b) => b.phase_unlock - a.phase_unlock || cablePreferred(a, b));
  const ex = ranked[0];
  if (ex) {
    usedNames.add(ex.name);
    return ex;
  }
  return null;
}

function pickExercise(
  slot: ExerciseSlot,
  usedNames: Set<string>,
  exercises: Exercise[],
  currentPhase: number
): Exercise | null {
  const { category, isVerticalPull, isVerticalPush, preferredExercise, phaseUpgrades } = slot;

  // 1. Phase upgrade — the hardest unlocked variant wins. This is what makes phases
  //    mean something on every day rather than only on Gym A.
  if (phaseUpgrades) {
    const unlocked = phaseUpgrades
      .filter((u) => u.phase <= currentPhase)
      .sort((a, b) => b.phase - a.phase);
    for (const u of unlocked) {
      if (usedNames.has(u.name)) continue;
      const ex = exercises.find((e) => e.name === u.name);
      if (ex) {
        usedNames.add(ex.name);
        return ex;
      }
    }
  }

  // 2. The explicit Phase-1 default.
  if (preferredExercise && !usedNames.has(preferredExercise)) {
    const ex = exercises.find((e) => e.name === preferredExercise);
    if (ex) {
      usedNames.add(ex.name);
      return ex;
    }
  }

  // 3. Pattern pools for pull and vertical push slots.
  if (category === "pull") {
    const fromPool = pickFromPool(
      isVerticalPull ? VERTICAL_PULL_POOL : HORIZONTAL_PULL_POOL,
      usedNames,
      exercises
    );
    if (fromPool) return fromPool;
  }
  if (category === "push" && isVerticalPush) {
    const fromPool = pickFromPool(VERTICAL_PUSH_POOL, usedNames, exercises);
    if (fromPool) return fromPool;
  }

  // 4. Anything unused in the category — cable first, since by this point the
  //    candidates are otherwise equivalent for the slot.
  const candidates = exercises
    .filter((e) => e.category === category && !usedNames.has(e.name))
    .sort(cablePreferred);
  if (candidates[0]) {
    usedNames.add(candidates[0].name);
    return candidates[0];
  }

  return null;
}

export interface ResolvedExercise {
  exercise: Exercise;
  order_index: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  progression_increment_kg: number;
}

export interface ResolvedTemplate {
  templateLabel: string;
  kind: "gym" | "home";
  isHomeWorkout: boolean;
  exercises: ResolvedExercise[];
}

/**
 * Which exercises a gym session may draw on.
 *
 * Phase-gated AND genuinely loaded. The loaded test is also the home-first rule:
 * push-ups, planks, jumps and ab-wheel work carry no loaded equipment, so they drop
 * out of the gym pool automatically and stay where they belong.
 */
export function gymPool(all: Exercise[], phase: number): Exercise[] {
  return all.filter((e) => e.phase_unlock <= phase && isLoaded(e.equipment));
}

/**
 * Which exercises a home session may draw on.
 *
 * Phase-gated too. That filter was missing before, which meant home days could never
 * progress — and now that every home progression is a leverage ladder, it is the only
 * mechanism making them harder over time.
 */
export function homePool(all: Exercise[], phase: number): Exercise[] {
  return all.filter((e) => e.home_compatible && e.phase_unlock <= phase);
}

export function resolveExercisesForTemplates(
  templates: WorkoutTemplate[],
  allExercises: Exercise[],
  currentPhase: number
): ResolvedTemplate[] {
  return templates.map((template) => {
    const usedNames = new Set<string>();
    const pool =
      template.kind === "home"
        ? homePool(allExercises, currentPhase)
        : gymPool(allExercises, currentPhase);

    const resolved = template.slots
      .map((s, i) => {
        const ex = pickExercise(s, usedNames, pool, currentPhase);
        if (!ex) return null;
        return {
          exercise: ex,
          order_index: i,
          target_sets: s.target_sets,
          target_reps_min: s.target_reps_min,
          target_reps_max: s.target_reps_max,
          progression_increment_kg: s.progression_increment_kg,
        };
      })
      .filter((x): x is ResolvedExercise => x !== null);

    return {
      templateLabel: template.label,
      kind: template.kind,
      isHomeWorkout: template.kind === "home",
      exercises: resolved,
    };
  });
}
