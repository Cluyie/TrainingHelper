// ============================================================
// Activity-adjusted calorie redistribution (pure, client/server safe).
//
// The adaptive TDEE engine (targets.ts) already captures the AVERAGE training
// burn implicitly via the intake-vs-weight-trend identity — so exercise
// calories must never be added on top (double counting). Instead we shift
// calories BETWEEN days, zero-sum around that average:
//
//   adjustment(date) = activityKcal(date) − mean(activityKcal over the window)
//
// Training/step-heavy days get more, rest days less; the weekly average stays
// anchored to the adaptive TDEE. All kcal estimates are NET (above resting,
// which the TDEE already covers) — precision matters less than usual because
// redistribution is zero-mean by construction.
//
// All tuning constants live here.
// ============================================================

// ---- tuning constants ----
export const ACTIVITY_WINDOW_DAYS = 14; // trailing window for the activity baseline
export const ADJUSTMENT_CLAMP_KCAL = 500; // max daily shift in either direction
const RUN_NET_KCAL_PER_KG_KM = 0.9; // net running cost ≈ 0.9 kcal/kg/km
const ASSUMED_EASY_PACE_MIN_PER_KM = 6.5; // distance fallback when only duration was logged
const STRENGTH_MET = 3.5; // moderate resistance training; net uses (MET − 1)
const STRENGTH_MIN_DURATION_MIN = 15; // clamp session length derived from timestamps
const STRENGTH_MAX_DURATION_MIN = 120;
const STRETCH_MET = 2.3; // light stretching
const STRETCH_ASSUMED_MIN = 15; // routines have no logged duration
const KCAL_PER_STEP_PER_KG = 0.0004; // walking ≈ 0.53 kcal/kg/km at ~1325 steps/km
const RUN_STEPS_PER_KM = 1300; // deducted from phone step totals on run days

// ---- input row types (subsets of the DB rows the targets route loads) ----
export interface RunDay {
  date: string;
  actual_duration_min: number | null;
  actual_distance_km: number | null;
}
export interface StrengthDay {
  date: string;
  started_at: string;
  completed_at: string;
}
export interface StretchDay {
  date: string;
}
export interface StepsDay {
  date: string;
  steps: number;
}
export interface ActivityInputs {
  runs: RunDay[];
  strength: StrengthDay[];
  stretches: StretchDay[];
  steps: StepsDay[];
}

export interface DayActivityKcal {
  run: number;
  strength: number;
  stretch: number;
  steps: number;
  total: number;
}
export interface ActivityAdjustment {
  /** Clamped, rounded to 10 — add to goal calories. Zero-mean over the window. */
  adjustment: number;
  today: DayActivityKcal;
  trailingAvg: number;
  /** Total run minutes on the requested date (for the UI explanation line). */
  runMinToday: number;
  /** Raw entered steps for the date; null = no entry that day. */
  stepsToday: number | null;
}

// ---- per-activity net kcal ----

/** Logged distance, else estimated from duration at an assumed easy pace. */
export function runDistanceKm(r: RunDay): number {
  if (r.actual_distance_km != null && Number(r.actual_distance_km) > 0) {
    return Number(r.actual_distance_km);
  }
  return (r.actual_duration_min ?? 0) / ASSUMED_EASY_PACE_MIN_PER_KM;
}

export function runKcal(weightKg: number, r: RunDay): number {
  return weightKg * runDistanceKm(r) * RUN_NET_KCAL_PER_KG_KM;
}

export function strengthKcal(weightKg: number, s: StrengthDay): number {
  const rawMin = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60_000;
  const min = Math.min(STRENGTH_MAX_DURATION_MIN, Math.max(STRENGTH_MIN_DURATION_MIN, rawMin));
  return (STRENGTH_MET - 1) * weightKg * (min / 60);
}

export function stretchKcal(weightKg: number): number {
  return (STRETCH_MET - 1) * weightKg * (STRETCH_ASSUMED_MIN / 60);
}

/** Steps kcal with the day's run steps deducted (phone totals include runs). */
export function stepsKcal(weightKg: number, steps: number, runKmSameDay: number): number {
  const walkingSteps = Math.max(0, steps - runKmSameDay * RUN_STEPS_PER_KM);
  return walkingSteps * weightKg * KCAL_PER_STEP_PER_KG;
}

// ---- date helpers (string-based, same convention as nutrition-client.ts) ----
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * The redistribution: today's activity kcal minus the trailing-window mean,
 * clamped. Days with no step entry substitute the window-average entered steps
 * (neutral — a skipped entry produces no adjustment); if no steps were ever
 * entered in the window, steps contribute 0 everywhere and the feature
 * degrades gracefully to logged-activities-only.
 */
export function computeActivityAdjustment(
  date: string,
  weightKg: number,
  inputs: ActivityInputs
): ActivityAdjustment {
  const windowDates: string[] = [];
  for (let i = ACTIVITY_WINDOW_DAYS - 1; i >= 0; i--) windowDates.push(shiftDate(date, -i));
  const inWindow = new Set(windowDates);

  const runsBy = groupBy(inputs.runs.filter((r) => inWindow.has(r.date)));
  const strengthBy = groupBy(inputs.strength.filter((s) => s.completed_at && inWindow.has(s.date)));
  const stretchBy = groupBy(inputs.stretches.filter((s) => inWindow.has(s.date)));
  const stepsByDate = new Map(
    inputs.steps.filter((s) => inWindow.has(s.date)).map((s) => [s.date, Number(s.steps)])
  );

  const enteredSteps = Array.from(stepsByDate.values());
  const avgEnteredSteps = enteredSteps.length
    ? enteredSteps.reduce((s, x) => s + x, 0) / enteredSteps.length
    : 0;

  const dayTotals = windowDates.map((d) => {
    const runs = runsBy.get(d) ?? [];
    const run = runs.reduce((s, r) => s + runKcal(weightKg, r), 0);
    const runKm = runs.reduce((s, r) => s + runDistanceKm(r), 0);
    const strength = (strengthBy.get(d) ?? []).reduce((s, x) => s + strengthKcal(weightKg, x), 0);
    const stretch = (stretchBy.get(d) ?? []).length * stretchKcal(weightKg);
    const daySteps = stepsByDate.get(d) ?? avgEnteredSteps;
    const steps = stepsKcal(weightKg, daySteps, runKm);
    const total = run + strength + stretch + steps;
    return { date: d, run, strength, stretch, steps, total } satisfies DayActivityKcal & { date: string };
  });

  const today = dayTotals[dayTotals.length - 1];
  const trailingAvg = dayTotals.reduce((s, d) => s + d.total, 0) / dayTotals.length;
  const raw = round10(today.total - trailingAvg);
  const adjustment = Math.min(ADJUSTMENT_CLAMP_KCAL, Math.max(-ADJUSTMENT_CLAMP_KCAL, raw));

  const runMinToday = (runsBy.get(date) ?? []).reduce(
    (s, r) => s + (r.actual_duration_min ?? 0),
    0
  );

  return {
    adjustment,
    today: {
      run: Math.round(today.run),
      strength: Math.round(today.strength),
      stretch: Math.round(today.stretch),
      steps: Math.round(today.steps),
      total: Math.round(today.total),
    },
    trailingAvg: Math.round(trailingAvg),
    runMinToday,
    stepsToday: stepsByDate.get(date) ?? null,
  };
}

function groupBy<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) (m.get(r.date) ?? m.set(r.date, []).get(r.date)!).push(r);
  return m;
}
