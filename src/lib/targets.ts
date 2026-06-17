// ============================================================
// Adaptive calorie + protein target engine (pure, client/server safe).
//
// Calories are NOT a static formula. The Mifflin-St Jeor formula is only the
// cold-start estimate; once there are ~2 weeks of weigh-ins + food logs we
// estimate TRUE maintenance from the energy-balance identity
//   TDEE ≈ mean daily intake + (weight change in kg × 7700) / days
// and let it self-correct (a control loop). Protein scales by bodyweight but
// is goal-banded and stable. See memory: nutrition-coaching-philosophy.
//
// All tuning constants live here.
// ============================================================

import type { Goal, Sex, ActivityLevel } from "@/types";

// ---- tuning constants ----
export const KCAL_PER_KG = 7700; // energy in ~1 kg of body-fat tissue
const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};
/** Target weight-change rate as a fraction of bodyweight per week. */
const WEEKLY_RATE: Record<Goal, number> = {
  cut: -0.005, // −0.5 %/wk (~−0.4 kg at 80 kg)
  maintain: 0,
  lean_gain: 0.0025, // +0.25 %/wk
};
/** Protein g/kg by goal (chosen within evidence bands: cut 2.0–2.4, maintain 1.6–2.0, gain 1.6–2.2). */
const PROTEIN_PER_KG: Record<Goal, number> = {
  cut: 2.2,
  maintain: 1.8,
  lean_gain: 1.9,
};
const MA_WINDOW = 7; // days for the weight moving average (cancels water noise)
const ADAPTIVE_WINDOW_DAYS = 14; // trailing window for the data-derived TDEE
const MIN_LOGGED_DAYS = 10; // need this many well-logged days in the window
const MIN_KCAL_FLOOR = 800; // a day counts as "logged" only above this
const ADAPTIVE_CLAMP = 0.25; // adaptive TDEE must stay within ±25 % of formula

export interface Profile {
  sex: Sex | null;
  birth_year: number | null;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
}
export interface WeightPoint { date: string; weight_kg: number }
export interface IntakePoint { date: string; kcal: number }

export interface Maintenance {
  tdee: number;
  source: "adaptive" | "formula";
  weightKg: number;
}
export interface Targets {
  calories: number;
  protein_g: number;
  fat_g: number;
  maintenance: number;
  source: "adaptive" | "formula";
}

// Macro energy density (kcal/g) — fat balances whatever calories protein + carbs leave.
const KCAL_PER_G = { protein: 4, carb: 4, fat: 9 };

// ---- date helpers ----
function toDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}
function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}
const round10 = (n: number) => Math.round(n / 10) * 10;
const round5 = (n: number) => Math.round(n / 5) * 5;

/** Mean of the most recent `window` weigh-ins (smooths daily noise). */
export function latestAvgWeight(weights: WeightPoint[], window = MA_WINDOW): number | null {
  if (!weights.length) return null;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-window);
  return recent.reduce((s, w) => s + Number(w.weight_kg), 0) / recent.length;
}

/** Mifflin-St Jeor BMR × activity. Null if any input is missing. */
export function formulaTDEE(profile: Profile, weightKg: number): number | null {
  const { sex, birth_year, height_cm, activity_level } = profile;
  if (!sex || !birth_year || !height_cm || !activity_level) return null;
  const age = new Date().getFullYear() - birth_year;
  const bmr = 10 * weightKg + 6.25 * height_cm - 5 * age + (sex === "male" ? 5 : -161);
  return bmr * ACTIVITY_FACTORS[activity_level];
}

/**
 * Data-derived maintenance from the trailing window:
 *   TDEE ≈ meanIntake + (Δsmoothed-weight × 7700) / spanDays
 * Returns null until there's enough well-logged data; clamps to ±25 % of the
 * formula to reject noise from incomplete logging.
 */
export function adaptiveTDEE(
  weights: WeightPoint[],
  intake: IntakePoint[],
  formula: number
): number | null {
  if (!weights.length) return null;
  const sortedW = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const endDate = sortedW[sortedW.length - 1].date;

  // weigh-ins within the window
  const winW = sortedW.filter((w) => daysBetween(w.date, endDate) <= ADAPTIVE_WINDOW_DAYS - 1 && daysBetween(w.date, endDate) >= 0);
  if (winW.length < 2) return null;

  // smoothed start/end weight via trailing MA at each end of the window
  const ma = movingAverageWeights(sortedW);
  const startW = ma.find((p) => daysBetween(p.date, endDate) <= ADAPTIVE_WINDOW_DAYS - 1) ?? ma[0];
  const endW = ma[ma.length - 1];
  const spanDays = daysBetween(startW.date, endW.date);
  if (spanDays < ADAPTIVE_WINDOW_DAYS - 4) return null; // need the window roughly spanned

  // well-logged intake days within the window
  const winIntake = intake.filter(
    (d) =>
      d.kcal >= MIN_KCAL_FLOOR &&
      daysBetween(d.date, endDate) <= ADAPTIVE_WINDOW_DAYS - 1 &&
      daysBetween(d.date, endDate) >= 0
  );
  if (winIntake.length < MIN_LOGGED_DAYS) return null;

  const meanIntake = winIntake.reduce((s, d) => s + d.kcal, 0) / winIntake.length;
  const tdee = meanIntake + ((startW.avg - endW.avg) * KCAL_PER_KG) / spanDays;

  // reject implausible values from sparse/incomplete logging
  const lo = formula * (1 - ADAPTIVE_CLAMP);
  const hi = formula * (1 + ADAPTIVE_CLAMP);
  return Math.min(hi, Math.max(lo, tdee));
}

/** Prefer the data-derived estimate once available, else the formula. */
export function estimateMaintenance(
  profile: Profile,
  weights: WeightPoint[],
  intake: IntakePoint[]
): Maintenance | null {
  const weightKg = latestAvgWeight(weights);
  if (weightKg == null) return null;
  const formula = formulaTDEE(profile, weightKg);
  if (formula == null) return null;
  const adaptive = adaptiveTDEE(weights, intake, formula);
  return adaptive != null
    ? { tdee: adaptive, source: "adaptive", weightKg }
    : { tdee: formula, source: "formula", weightKg };
}

function goalCalories(tdee: number, goal: Goal, weightKg: number): number {
  const dailyDelta = (WEEKLY_RATE[goal] * weightKg * KCAL_PER_KG) / 7;
  return round10(tdee + dailyDelta);
}
function goalProtein(goal: Goal, weightKg: number): number {
  return round5(PROTEIN_PER_KG[goal] * weightKg);
}

/** Fat is the balancing macro: whatever calories remain after protein + carbs. */
function goalFat(calories: number, proteinG: number, netCarbG: number): number {
  const remaining = calories - proteinG * KCAL_PER_G.protein - netCarbG * KCAL_PER_G.carb;
  return Math.max(0, round5(remaining / KCAL_PER_G.fat));
}

/**
 * Full computed targets, or null if profile/weight insufficient (→ fall back to static defaults).
 * `netCarbTarget` is the user's net-carb target/cap (g) — used to balance fat.
 */
export function computeTargets(
  profile: Profile,
  weights: WeightPoint[],
  intake: IntakePoint[],
  netCarbTarget: number
): Targets | null {
  const m = estimateMaintenance(profile, weights, intake);
  if (!m) return null;
  const goal: Goal = profile.goal ?? "maintain";
  const calories = goalCalories(m.tdee, goal, m.weightKg);
  const protein_g = goalProtein(goal, m.weightKg);
  return {
    calories,
    protein_g,
    fat_g: goalFat(calories, protein_g, netCarbTarget),
    maintenance: Math.round(m.tdee),
    source: m.source,
  };
}

// ---- trend (charts + dashboard) ----
interface MAPoint { date: string; weight: number; avg: number }

function movingAverageWeights(weights: WeightPoint[]): MAPoint[] {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((w) => {
    // Average all weigh-ins within the trailing MA_WINDOW *calendar days* (not
    // the last N entries), so sparse logging doesn't silently widen the window.
    const slice = sorted.filter((x) => {
      const d = daysBetween(x.date, w.date);
      return d >= 0 && d <= MA_WINDOW - 1;
    });
    const avg = slice.reduce((s, x) => s + Number(x.weight_kg), 0) / slice.length;
    return { date: w.date, weight: Number(w.weight_kg), avg: Math.round(avg * 100) / 100 };
  });
}

export interface WeightTrend {
  series: MAPoint[];
  current: number | null; // latest 7-day average
  weeklyDelta: number | null; // change in the average over ~the last 7 days (kg/wk; − = losing)
}

export function weightTrend(weights: WeightPoint[]): WeightTrend {
  const series = movingAverageWeights(weights);
  if (!series.length) return { series, current: null, weeklyDelta: null };
  const last = series[series.length - 1];
  // most recent MA point at least 7 days back, then normalize the change to a
  // true per-7-day rate (the gap may exceed 7 days when logging is sparse).
  let prev: MAPoint | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (daysBetween(series[i].date, last.date) >= 7) { prev = series[i]; break; }
  }
  const span = prev ? daysBetween(prev.date, last.date) : 0;
  const weeklyDelta =
    prev && span > 0 ? Math.round(((last.avg - prev.avg) * 7) / span * 100) / 100 : null;
  return { series, current: last.avg, weeklyDelta };
}
