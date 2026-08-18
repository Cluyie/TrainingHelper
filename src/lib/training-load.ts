// ============================================================
// Unified training-load model.
//
// Strength and running draw on ONE recovery budget, so they must be scored on one
// scale. Before this existed, the two were generated independently and nothing
// noticed when a heavy squat day landed next to a VO2 session.
//
// Everything here is derived from data the exercise library already carries —
// `category`, `equipment`, `muscle_groups` — plus the rep range and set count already
// on each slot. No new exercise columns, and deliberately no scientific-looking
// composite index the underlying data couldn't support.
//
// These are pure functions with no I/O, which is what makes the scheduling rules
// testable.
// ============================================================

import type { ExerciseCategory, RunType } from "@/types";

export type Stress = 0 | 1 | 2 | 3;

export interface SessionLoad {
  modality: "strength" | "running";
  label: string;
  durationMin: number;
  intensity: 1 | 2 | 3; // easy / moderate / hard
  lowerBody: Stress;
  upperBody: Stress;
  axial: Stress; // spinal / compressive loading
  neuromuscular: Stress;
  cardio: Stress;
  primaryMuscleGroups: string[];
  recoveryCost: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface StrengthItem {
  category: ExerciseCategory;
  sets: number;
  repsMax: number;
  equipment: string[];
  muscleGroups?: string[];
}

export interface StrengthSessionInput {
  label: string;
  isHome: boolean;
  items: StrengthItem[];
}

export interface RunningSessionInput {
  type: RunType;
  durationMin: number;
}

// Warm-up allowance. Gym sessions need more — heavier loading and a commute between
// stations; home sessions roll straight into the first movement.
const GYM_WARMUP_MIN = 8;
const HOME_WARMUP_MIN = 4;

// Equipment that only a gym provides. Note what's absent: "bodyweight" and "ab_wheel".
// An ab wheel is technically "not bodyweight", but treating it as gym kit would drag
// rollouts into the gym pool — and the whole point of the home-first rule is that you
// don't travel to a gym to use an ab wheel you already own.
//
// "pull_up_bar" is here for the opposite reason: a pull-up is bodyweight, but it needs
// a bar. Home has a table (inverted rows), not a bar, so pull-ups are gym-only.
const LOADED_EQUIPMENT = [
  "dumbbell", "barbell", "cable", "machine", "kettlebell", "medicine_ball",
  "weight_belt", "band", "pull_up_bar",
];

/**
 * Whether an exercise carries external load.
 *
 * Doubles as the gym-eligibility rule: gym slots take only loaded exercises, so
 * push-ups, planks, jumps and rollouts drop out of the gym pool without needing a
 * separate hand-maintained flag.
 */
export function isLoaded(equipment: string[]): boolean {
  return equipment.some((e) => LOADED_EQUIPMENT.includes(e));
}

function isHeavy(item: StrengthItem): boolean {
  return item.repsMax <= 6;
}

// ── Per-axis stress from a single slot ───────────────────────────────────────

function itemLowerBody(item: StrengthItem): Stress {
  switch (item.category) {
    case "squat":
    case "hinge":
      return isHeavy(item) ? 3 : 2;
    case "power":
      // Jumps and swings load the legs; throws and slams are trunk-driven.
      return item.muscleGroups?.some((m) => ["glutes", "quads", "calves", "hamstrings"].includes(m)) ? 2 : 1;
    case "carry":
    case "calf":
      return 1;
    default:
      return 0;
  }
}

function itemUpperBody(item: StrengthItem): Stress {
  switch (item.category) {
    case "push":
    case "pull":
      return isHeavy(item) ? 3 : 2;
    case "carry":
      return 1; // grip and traps
    case "shoulder_health":
      return 1;
    default:
      return 0;
  }
}

function itemAxial(item: StrengthItem): Stress {
  const barbell = item.equipment.includes("barbell");
  if (barbell && (item.category === "squat" || item.category === "hinge")) return 3;
  if (item.category === "carry") return 2;
  if (item.category === "squat" || item.category === "hinge") return 1;
  return 0;
}

function itemNeuro(item: StrengthItem): Stress {
  // Power work is explosive but explicitly low-volume, full-rest and never to
  // failure — high demand per rep, low residual fatigue.
  if (item.category === "power") return 2;
  if (isHeavy(item)) return 3;
  if (["squat", "hinge", "push", "pull"].includes(item.category)) return 1;
  return 0;
}

// ── Recovery cost ────────────────────────────────────────────────────────────

const CATEGORY_WEIGHT: Record<ExerciseCategory, number> = {
  squat: 1.4,
  hinge: 1.4,
  push: 1.0,
  pull: 1.0,
  carry: 1.1,
  power: 0.8,
  calf: 0.6,
  core: 0.5,
  shoulder_health: 0.4,
};

function itemCost(item: StrengthItem): number {
  // Power is capped at the neutral multiplier despite its low rep count: it is done
  // fresh, with full rest, and never to failure.
  const repMultiplier =
    item.category === "power" ? 1.0 : isHeavy(item) ? 1.5 : item.repsMax <= 12 ? 1.0 : 0.85;
  const loadMultiplier = isLoaded(item.equipment) ? 1.15 : 1.0;
  return item.sets * CATEGORY_WEIGHT[item.category] * repMultiplier * loadMultiplier;
}

// ── Duration ─────────────────────────────────────────────────────────────────

function restSec(item: StrengthItem): number {
  if (item.category === "power") return 120; // full recovery, quality over density
  if (item.category === "squat" || item.category === "hinge") {
    if (isHeavy(item)) return 180;
    return isLoaded(item.equipment) ? 150 : 90; // unloaded lower body recovers fast
  }
  if (item.category === "push" || item.category === "pull") return 120;
  if (item.category === "carry") return 90;
  return 60; // core, shoulder health, calves
}

function workSec(item: StrengthItem): number {
  if (item.category === "carry") return 30; // a 20-30 m walk
  // Holds store seconds in the rep field (planks, hollow body, side planks).
  if (item.category === "core" && item.repsMax >= 20) return item.repsMax;
  return item.repsMax * 3; // ~3 s per controlled rep
}

function bucketDifficulty(cost: number): 1 | 2 | 3 | 4 | 5 {
  if (cost < 6) return 1;
  if (cost < 12) return 2;
  if (cost < 18) return 3;
  if (cost < 24) return 4;
  return 5;
}

function maxStress(values: Stress[]): Stress {
  return values.reduce<Stress>((a, b) => (b > a ? b : a), 0);
}

/** Score a strength session. */
export function strengthLoad(input: StrengthSessionInput): SessionLoad {
  const { items, isHome, label } = input;

  const totalSets = items.reduce((s, i) => s + i.sets, 0);
  const recoveryCost = items.reduce((s, i) => s + itemCost(i), 0);

  const seconds = items.reduce((s, i) => s + i.sets * (workSec(i) + restSec(i)), 0);
  const durationMin = Math.round(seconds / 60) + (isHome ? HOME_WARMUP_MIN : GYM_WARMUP_MIN);

  const lowerBody = maxStress(items.map(itemLowerBody));
  const upperBody = maxStress(items.map(itemUpperBody));
  const axial = maxStress(items.map(itemAxial));
  const neuromuscular = maxStress(items.map(itemNeuro));

  const muscles = new Set<string>();
  for (const i of items) for (const m of i.muscleGroups ?? []) muscles.add(m);

  const difficulty = bucketDifficulty(recoveryCost);

  return {
    modality: "strength",
    label,
    durationMin,
    intensity: difficulty >= 4 ? 3 : difficulty >= 2 ? 2 : 1,
    lowerBody,
    upperBody,
    axial,
    neuromuscular,
    // Strength is not a cardio stimulus, but a long dense session still costs something.
    cardio: totalSets > 20 ? 2 : 1,
    primaryMuscleGroups: [...muscles],
    recoveryCost: Math.round(recoveryCost * 10) / 10,
    difficulty,
  };
}

// Cost per minute by run type. Intervals are ~3× an easy run minute-for-minute;
// a long Zone 2 costs more than an easy run through duration alone, not intensity —
// which is precisely why the two must not be treated as equivalent when scheduling.
const RUN_COST_PER_MIN: Record<RunType, number> = {
  easy: 0.1,
  long: 0.13,
  interval: 0.3,
  unstructured: 0.05,
};

const RUN_PROFILE: Record<
  RunType,
  { intensity: 1 | 2 | 3; lowerBody: Stress; neuromuscular: Stress; cardio: Stress }
> = {
  easy: { intensity: 1, lowerBody: 1, neuromuscular: 0, cardio: 2 },
  long: { intensity: 1, lowerBody: 2, neuromuscular: 1, cardio: 3 },
  interval: { intensity: 3, lowerBody: 2, neuromuscular: 3, cardio: 3 },
  unstructured: { intensity: 1, lowerBody: 1, neuromuscular: 0, cardio: 1 },
};

const RUN_LABEL: Record<RunType, string> = {
  easy: "Easy Zone 2",
  long: "Long Zone 2",
  interval: "VO2 intervals",
  unstructured: "Optional easy",
};

/** Score a running session. */
export function runningLoad(input: RunningSessionInput): SessionLoad {
  const p = RUN_PROFILE[input.type];
  const recoveryCost = Math.round(input.durationMin * RUN_COST_PER_MIN[input.type] * 10) / 10;

  return {
    modality: "running",
    label: RUN_LABEL[input.type],
    durationMin: input.durationMin,
    intensity: p.intensity,
    lowerBody: p.lowerBody,
    upperBody: 0,
    axial: input.type === "interval" ? 1 : 0, // impact loading, not compressive
    neuromuscular: p.neuromuscular,
    cardio: p.cardio,
    primaryMuscleGroups: ["quads", "hamstrings", "calves", "glutes"],
    recoveryCost,
    difficulty: bucketDifficulty(recoveryCost),
  };
}

export interface WeeklyLoad {
  recoveryCost: number;
  durationMin: number;
  sessions: number;
  hardSessions: number; // intensity 3
  byModality: { strength: number; running: number };
}

export function weeklyLoad(loads: SessionLoad[]): WeeklyLoad {
  return {
    recoveryCost: Math.round(loads.reduce((s, l) => s + l.recoveryCost, 0) * 10) / 10,
    durationMin: loads.reduce((s, l) => s + l.durationMin, 0),
    sessions: loads.length,
    hardSessions: loads.filter((l) => l.intensity === 3).length,
    byModality: {
      strength: Math.round(loads.filter((l) => l.modality === "strength").reduce((s, l) => s + l.recoveryCost, 0) * 10) / 10,
      running: Math.round(loads.filter((l) => l.modality === "running").reduce((s, l) => s + l.recoveryCost, 0) * 10) / 10,
    },
  };
}

// Weekly recovery budget by phase. Phase 1 has no intervals and a smaller aerobic
// load; phase 3 carries the full VO2 stimulus, so its ceiling is higher.
export const WEEKLY_BUDGET: Record<number, number> = { 1: 105, 2: 115, 3: 128 };

// Ceiling for the summed lower-body + neuromuscular stress in the window around a VO2
// session (day before, day of, day after). Above this, hard running is landing too
// close to heavy legs — whichever session that happens to be.
export const VO2_WINDOW_CEILING = 8;
