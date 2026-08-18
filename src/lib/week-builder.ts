// ============================================================
// Assembles the week: resolves strength templates, generates the week's runs, scores
// everything on the shared load model, and hands it to the planner for placement.
//
// This is the join between the two halves of the app. Both write paths go through it —
// the settings route when strength is regenerated, and the running route when the
// block week rolls over — so strength and running can never again be planned in
// ignorance of each other.
// ============================================================

import type { DayOfWeek, Exercise, Phase } from "@/types";
import { getStrengthTemplates, resolveExercisesForTemplates, type ResolvedTemplate } from "@/lib/program-generator";
import { runningWeek, type PlannedRun } from "@/lib/running-plan";
import { strengthLoad, runningLoad } from "@/lib/training-load";
import { planWeek, type PlannerSession, type WeekPlan } from "@/lib/week-planner";

export interface BuiltWeek {
  plan: WeekPlan;
  strength: Array<{ template: ResolvedTemplate; day: DayOfWeek; orderInWeek: number }>;
  runs: Array<{ run: PlannedRun; day: DayOfWeek }>;
}

export interface BuildWeekOptions {
  currentPhase: Phase; // strength tier — manual, shoulder-gated
  runningPhase: Phase; // running tier — automatic
  weekInBlock: number; // 1..6
  blockIndex: number; // drives the Phase 3 A/B/C rotation
  noGymDays: DayOfWeek[];
  exercises: Exercise[];
}

export function buildWeek(opts: BuildWeekOptions): BuiltWeek {
  const { currentPhase, runningPhase, weekInBlock, blockIndex, noGymDays, exercises } = opts;

  // ── Strength ──────────────────────────────────────────────
  const resolved = resolveExercisesForTemplates(getStrengthTemplates(), exercises, currentPhase);

  const strengthSessions: PlannerSession[] = resolved.map((t, i) => ({
    id: `strength-${i}`,
    kind: t.kind,
    label: t.templateLabel,
    load: strengthLoad({
      label: t.templateLabel,
      isHome: t.isHomeWorkout,
      items: t.exercises.map((e) => ({
        category: e.exercise.category,
        sets: e.target_sets,
        repsMax: e.target_reps_max,
        equipment: e.exercise.equipment,
        muscleGroups: e.exercise.muscle_groups,
      })),
    }),
  }));

  // ── Running ───────────────────────────────────────────────
  const runs = runningWeek(runningPhase, weekInBlock, blockIndex);

  const runSessions: PlannerSession[] = runs.map((r, i) => ({
    id: `run-${i}`,
    kind: "run" as const,
    label: r.target_description.slice(0, 40),
    runType: r.type,
    optional: r.optional,
    load: runningLoad({ type: r.type, durationMin: r.target_duration_min }),
  }));

  // ── Placement ─────────────────────────────────────────────
  const plan = planWeek({ strength: strengthSessions, runs: runSessions, noGymDays });

  // Map the placed sessions back to their source objects.
  const dayOf = new Map<string, DayOfWeek>();
  for (const d of plan.days) for (const s of d.sessions) dayOf.set(s.id, d.day);

  const placedStrength = resolved
    .map((template, i) => ({ template, day: dayOf.get(`strength-${i}`) }))
    .filter((x): x is { template: ResolvedTemplate; day: DayOfWeek } => !!x.day)
    .sort((a, b) => dayIndex(a.day) - dayIndex(b.day))
    .map((x, i) => ({ ...x, orderInWeek: i + 1 }));

  const placedRuns = runs
    .map((run, i) => ({ run, day: dayOf.get(`run-${i}`) }))
    .filter((x): x is { run: PlannedRun; day: DayOfWeek } => !!x.day)
    .sort((a, b) => dayIndex(a.day) - dayIndex(b.day));

  return { plan, strength: placedStrength, runs: placedRuns };
}

const ORDER: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

function dayIndex(d: DayOfWeek): number {
  return ORDER.indexOf(d);
}
