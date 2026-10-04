// ============================================================
// The strength program.
//
// A FIXED, deterministic Tuesday-Saturday week. There is no placement search and no
// exercise picking: every day, exercise, set count, rep range and increment is
// written down below, and the only things that vary are the ones the program itself
// defines —
//
//   • the week of the 6-week block (RIR target, and the week-6 deload),
//   • the 3-week medicine-ball rotation on Tuesday/Thursday,
//   • the vertical-pull ladder (lat pulldown → pull-up → weighted pull-up), which
//     follows what you actually logged last rather than a stored flag.
//
// There are no phases: one program, progressed by double progression and deloads.
//
// The running week is the fixed frame around it, and running is NOT strength volume:
//
//   Mon  hard run — no strength
//   Tue  upper strength          (legs recover from Monday's run)
//   Wed  heavy lower             (~48 h after the hard run)
//   Thu  upper hypertrophy, then Zone 2
//   Fri  posterior chain         (two days after Wednesday's legs)
//   Sat  lowest-fatigue session, then Zone 2 — ahead of Sunday's rest and Monday's run
//   Sun  full rest
//
// Kit: Smith machine, dual cable (2 × 60 kg stacks), Olympic barbell + plates, trap
// bar (with a single-handle suitcase setup), adjustable bench, pull-up station, dip
// handles, safety bars, landmine, one medicine ball. No dumbbells, no kettlebell.
//
// Shoulders come first: where a shoulder-friendlier exercise gives the same training
// effect it is the primary — hence landmine pressing as the vertical press, and
// direct rotator-cuff work next to the face pulls.
//
// Every exercise has a job; see `purpose` on each slot. Nothing is here to fill a
// list — the function checklist in program-generator.test.ts is what guards that.
// ============================================================

import type { DayOfWeek, Exercise } from "@/types";
import { BLOCK_WEEKS, deloadSets } from "@/lib/deload";

/**
 * How a slot is trained — this sets its rest, its RIR target and how it progresses.
 *
 *   power     jumps and throws. Always fresh, never to fatigue, no RIR; progress by
 *             quality, height/distance and speed, never by piling on load.
 *   heavy     the main compound lifts. Controlled reserve always, no grinders.
 *   compound  hypertrophy-oriented compound work.
 *   accessory isolation work.
 *   core      loaded trunk work.
 *   carry     loaded carries, progressed by distance and then load.
 */
export type SlotRole = "power" | "heavy" | "compound" | "accessory" | "core" | "carry";
export type SlotUnit = "reps" | "meters" | "seconds";

export interface LadderRung {
  exercise: string;
  incrementKg: number;
}

export interface ProgramSlot {
  exercise: string; // catalogue name — the default when nothing below overrides it
  sets: number;
  repsMin: number;
  repsMax: number;
  incrementKg: number;
  role: SlotRole;
  unit: SlotUnit;
  perSide: boolean;
  purpose: string;
  /** Vertical pull only. Ordered easiest → hardest. */
  ladder?: LadderRung[];
  /** Medicine-ball slots only: which exercise each week of the 3-week rotation uses. */
  rotation?: [string, string, string];
}

export interface ProgramDay {
  day: DayOfWeek;
  label: string;
  focus: string;
  zone2After: boolean;
  /** Done before slot 1, as a checklist. */
  warmup: string[];
  /** Ramp-up sets before the first loaded working exercise (not logged). */
  rampUp: { slot: number; text: string };
  slots: ProgramSlot[];
}

// ── Slot helpers ─────────────────────────────────────────────────────────────

interface SlotOpts {
  unit?: SlotUnit;
  perSide?: boolean;
  ladder?: LadderRung[];
  rotation?: [string, string, string];
}

function s(
  exercise: string,
  sets: number,
  repsMin: number,
  repsMax: number,
  incrementKg: number,
  role: SlotRole,
  purpose: string,
  opts: SlotOpts = {}
): ProgramSlot {
  return {
    exercise,
    sets,
    repsMin,
    repsMax,
    incrementKg,
    role,
    unit: opts.unit ?? "reps",
    perSide: opts.perSide ?? false,
    purpose,
    ladder: opts.ladder,
    rotation: opts.rotation,
  };
}

// Reps first, then load: pull-ups progress by reps before any weight is added.
export const VERTICAL_PULL_LADDER: LadderRung[] = [
  { exercise: "Lat Pulldown", incrementKg: 2.5 },
  { exercise: "Pull-Up", incrementKg: 0 },
  { exercise: "Weighted Pull-Up", incrementKg: 1.25 },
];

function verticalPull(sets: number): ProgramSlot {
  return s(
    "Lat Pulldown", sets, 6, 10, 2.5, "compound",
    "Vertical pull / lats. Ladder: lat pulldown → bodyweight pull-up → weighted pull-up.",
    { ladder: VERTICAL_PULL_LADDER }
  );
}

function externalRotation(): ProgramSlot {
  return s("Cable External Rotation", 2, 12, 15, 2.5, "accessory",
    "Direct rotator-cuff strength — the one shoulder function nothing else loads directly.",
    { perSide: true });
}

// ── Warm-up ──────────────────────────────────────────────────────────────────
// ~8-10 min, only kit that exists. General part every day, then a leg or upper add-on.

const WARMUP_GENERAL = [
  "60–90 s jumping jacks or brisk marching on the spot",
  "10 arm circles each way",
  "10 bodyweight squats",
  "10 bodyweight hip hinges (hands on hips, push the hips back)",
];

const WARMUP_LEGS = [
  "5 slow split squats per leg",
  "10 leg swings per leg, forward and sideways",
  "10 small pogo hops, then 2 easy practice jumps",
];

const WARMUP_UPPER = [
  "15 cable face pulls, very light",
  "12 cable external rotations per side, very light",
  "8 push-ups",
  "8 scapular pull-ups (hang, pull the shoulder blades down, arms stay straight)",
];

const RAMP_HEAVY =
  "Ramp-up sets (not logged): empty bar/very light × 8, ~50% × 5, ~70% × 3, ~85% × 1–2 — then working sets.";
const RAMP_LIGHT = "Ramp-up (not logged): 1–2 light sets of 8–10 before the working sets.";

// ── The 3-week medicine-ball rotation ────────────────────────────────────────
// Week 1: Tue rotational throw, Thu chest pass
// Week 2: Tue slam,             Thu chest pass
// Week 3: Tue rotational throw, Thu slam
// …then repeat. CMJ and broad jump are fixed.
const ROT = "Medicine Ball Rotational Throw";
const PASS = "Medicine Ball Chest Pass";
const SLAM = "Medicine Ball Slam";

// ── The week ─────────────────────────────────────────────────────────────────
// Order inside every session: warm-up → power → heavy strength → hypertrophy/
// accessory → core/carry → Zone 2 where relevant.

export const PROGRAM: ProgramDay[] = [
  {
    day: "tuesday",
    label: "Upper Strength + Rotational Power",
    focus: "Heavy horizontal and landmine press, rows, shoulders, loaded flexion",
    zone2After: false,
    warmup: [...WARMUP_GENERAL, ...WARMUP_UPPER],
    rampUp: { slot: 1, text: RAMP_HEAVY },
    slots: [
      s(ROT, 3, 4, 4, 0, "power",
        "Rotational power (weeks 1 and 3) / whole-body slam (week 2). Maximal intent, no fatigue.",
        { perSide: true, rotation: [ROT, SLAM, ROT] }),
      s("Smith Bench Press", 3, 5, 8, 2.5, "heavy",
        "Primary horizontal pressing strength."),
      s("Landmine Press", 3, 5, 8, 2.5, "heavy",
        "Primary vertical-diagonal pressing strength on the shoulder-friendliest path."),
      s("Seated Cable Row", 3, 8, 12, 2.5, "compound",
        "Primary horizontal pull."),
      s("Half-Kneeling Cable Pulldown", 2, 8, 12, 2.5, "compound",
        "Unilateral lat work with trunk control and shoulder/hip coordination.",
        { perSide: true }),
      s("Cable Lateral Raise", 2, 12, 20, 2.5, "accessory",
        "Lateral deltoid.", { perSide: true }),
      s("Cable Face Pull", 2, 12, 20, 2.5, "accessory",
        "Posterior shoulder and scapular function."),
      externalRotation(),
      s("Cable Crunch", 3, 8, 15, 2.5, "core",
        "Heavy, progressive loaded spinal flexion."),
    ],
  },
  {
    day: "wednesday",
    label: "Lower Strength + Pull + Carry",
    focus: "Heavy hinge and squat, vertical pull, unilateral legs, heavy carry",
    zone2After: false,
    warmup: [...WARMUP_GENERAL, ...WARMUP_LEGS],
    rampUp: { slot: 1, text: RAMP_HEAVY },
    slots: [
      s("Countermovement Jump", 3, 3, 3, 0, "power",
        "Vertical lower-body power, rate of force development, bone-loading impact."),
      s("Trap Bar Deadlift", 3, 3, 5, 5, "heavy",
        "Total-body strength: posterior chain, glutes, hamstrings, traps, grip, bracing, bone loading."),
      s("Smith Squat", 3, 5, 8, 5, "heavy",
        "Heavy squat pattern: quads, glutes, leg strength reserve, bone loading."),
      verticalPull(3),
      s("Smith Bulgarian Split Squat", 2, 8, 10, 2.5, "compound",
        "Unilateral knee-dominant strength, balance and side-to-side hip/knee control.",
        { perSide: true }),
      s("Trap Bar Farmer Carry", 2, 20, 30, 5, "carry",
        "Bilateral carry: grip, traps, anti-lateral flexion, gait under load.",
        { unit: "meters" }),
      s("Smith Calf Raise", 2, 8, 12, 2.5, "accessory",
        "Direct plantarflexion — calf and Achilles capacity."),
    ],
  },
  {
    day: "thursday",
    label: "Upper Hypertrophy + Power",
    focus: "Incline press, chest-supported row, pull, landmine, shoulders",
    zone2After: true,
    warmup: [...WARMUP_GENERAL, ...WARMUP_UPPER],
    rampUp: { slot: 1, text: RAMP_LIGHT },
    slots: [
      s(PASS, 3, 4, 4, 0, "power",
        "Upper-body horizontal power (weeks 1-2) / whole-body slam (week 3). Stop before speed drops.",
        { rotation: [PASS, PASS, SLAM] }),
      s("Smith Incline Bench Press", 3, 8, 12, 2.5, "compound",
        "Incline pressing — upper-chest hypertrophy."),
      s("Chest Supported Row", 3, 8, 12, 2.5, "compound",
        "Hard upper-back rowing with no extra spinal load — the week already has trap bar and RDL."),
      verticalPull(2),
      s("Half-Kneeling Single-Arm Landmine Press", 2, 8, 12, 2.5, "compound",
        "Unilateral diagonal pressing with trunk control, shoulder-friendly.",
        { perSide: true }),
      s("Cable Lateral Raise", 2, 12, 20, 2.5, "accessory",
        "Lateral deltoid.", { perSide: true }),
      s("Cable Face Pull", 2, 12, 20, 2.5, "accessory",
        "Posterior shoulder and scapular function."),
      externalRotation(),
      s("Cable Crunch", 2, 10, 15, 2.5, "core",
        "Loaded spinal flexion."),
    ],
  },
  {
    day: "friday",
    label: "Posterior Chain + Unilateral + Core",
    focus: "RDL, glutes, step-ups, knee flexion, chest volume, rotation",
    zone2After: false,
    warmup: [...WARMUP_GENERAL, ...WARMUP_LEGS],
    rampUp: { slot: 1, text: RAMP_HEAVY },
    // No hip thrust: the trap bar, squat, split squat, RDL and step-ups already load the
    // glutes; a thrust here added size, not function.
    slots: [
      s("Broad Jump", 3, 3, 3, 0, "power",
        "Horizontal lower-body power. Maximal quality and distance, no conditioning."),
      s("Barbell Romanian Deadlift", 3, 6, 10, 5, "heavy",
        "Hamstrings (lengthened), glutes, spinal erectors, trunk bracing."),
      s("Step Up", 2, 8, 12, 2.5, "compound",
        "Unilateral hip-dominant strength, balance, functional leg strength.",
        { perSide: true }),
      // Friday, not Saturday: the soreness Nordics cause needs the three days before
      // Monday's hard run.
      s("Nordic Hamstring Curl", 2, 3, 6, 0, "accessory",
        "Eccentric knee flexion — hamstring strength and injury resistance for hard running. " +
        "Progress by lowering further and slower, not by load. First two weeks: 1–2 sets of 3."),
      s("Cable Chest Press", 2, 8, 12, 2.5, "compound",
        "Extra chest hypertrophy exposure without heavy systemic load."),
      s("Half-Kneeling Cable Chop", 2, 10, 12, 2.5, "core",
        "Obliques, rotation and controlled anti-rotation, diagonal force transfer.",
        { perSide: true }),
      s("Smith Calf Raise", 2, 10, 15, 2.5, "accessory",
        "Direct plantarflexion — calf and Achilles capacity."),
    ],
  },
  {
    // No leg training: the legs get Zone 2, Sunday's rest and Monday's hard run. The
    // upper body isn't used by the run, so push, pull and grip still do real work —
    // and bodyweight/free movement brings in what the rails and cables leave out.
    day: "saturday",
    label: "Upper, Trunk + Balance",
    focus: "Free-moving push and pull, grip, balance and anti-rotation — legs stay fresh for Monday",
    zone2After: true,
    warmup: [...WARMUP_GENERAL, ...WARMUP_UPPER.slice(0, 2)],
    rampUp: { slot: 0, text: "Ramp-up (not logged): 1–2 easy sets of 8 incline push-ups, hands on the Smith bar." },
    slots: [
      s("Push-Up", 3, 8, 15, 0, "compound",
        "Horizontal push with free-moving shoulder blades — shoulder-friendly. " +
        "Top of the range on every set → move to feet-elevated push-ups."),
      s("Inverted Row", 3, 8, 12, 0, "compound",
        "Bodyweight horizontal pull. Harder: lower the Smith bar or raise the feet."),
      s("Dead Hang", 2, 20, 45, 0, "accessory",
        "Grip and shoulders under a long, loaded stretch.", { unit: "seconds" }),
      s("Single-Leg Romanian Deadlift", 2, 6, 8, 0, "accessory",
        "Balance drill, not leg training: single-leg control through the hip, slow and steady.",
        { perSide: true }),
      s("Suitcase Carry", 2, 20, 30, 2.5, "carry",
        "Unilateral carry: anti-lateral flexion, obliques, grip, trunk stability.",
        { unit: "meters", perSide: true }),
      s("Pallof Press", 2, 10, 10, 2.5, "core",
        "Anti-rotation — resisting the twist rather than producing it.", { perSide: true }),
    ],
  },
];

// ── The frame around the lifting (not part of strength volume) ───────────────

export const WEEK_FRAME: Record<DayOfWeek, string> = {
  monday: "Hard run — no strength",
  tuesday: "Strength",
  wednesday: "Strength",
  thursday: "Strength, then Zone 2",
  friday: "Strength",
  saturday: "Strength (lowest fatigue), then Zone 2",
  sunday: "Full rest",
};

/** The weekly hard run — eased in the deload week. */
export const HARD_RUN_DAY: DayOfWeek = "monday";

/** Days whose session loads the legs heavily — used for recovery/nutrition nudges. */
export function isHeavyLowerDay(day: DayOfWeek | string | undefined): boolean {
  return day === "wednesday" || day === "friday";
}

// ── Week-dependent prescription ──────────────────────────────────────────────

export const DELOAD_WEEK = BLOCK_WEEKS;

/** Which leg of the 3-week medicine-ball rotation a block week is in (0, 1, 2). */
export function rotationIndex(weekInBlock: number): 0 | 1 | 2 {
  const w = Math.min(Math.max(Math.round(weekInBlock), 1), BLOCK_WEEKS);
  return ((w - 1) % 3) as 0 | 1 | 2;
}

export interface RirTarget {
  min: number;
  max: number | null; // null = "or more"
  label: string;
}

/**
 * Planned reps in reserve for a role in a block week. Power has none — it is judged
 * on speed and quality, never on proximity to failure.
 *
 *   wk1 ~3 · wk2 2-3 · wk3 ~2 · wk4 1-2 · wk5 1-2 (hypertrophy: last sets; heavy
 *   compounds keep a controlled reserve, no grinders) · wk6 deload 4+
 */
export function targetRir(role: SlotRole, weekInBlock: number): RirTarget | null {
  if (role === "power") return null;
  if (weekInBlock >= DELOAD_WEEK) return { min: 4, max: null, label: "4+ RIR — deload" };
  switch (weekInBlock) {
    case 1:
      return { min: 3, max: 3, label: "~3 RIR" };
    case 2:
      return { min: 2, max: 3, label: "2–3 RIR" };
    case 3:
      return { min: 2, max: 2, label: "~2 RIR" };
    case 4:
      return { min: 1, max: 2, label: "1–2 RIR" };
    default:
      return role === "heavy"
        ? { min: 1, max: 2, label: "1–2 RIR — controlled, no grinders" }
        : { min: 1, max: 2, label: "1–2 RIR on the last sets" };
  }
}

/** Rest between sets, in seconds — enough to hold performance, never cut short to add difficulty. */
export function restSeconds(role: SlotRole): number {
  switch (role) {
    case "power":
      return 150; // 2-3+ min
    case "heavy":
      return 180; // 2.5-4 min
    case "compound":
      return 150; // 2-3 min
    case "carry":
      return 150; // 2-3 min
    default:
      return 120; // isolation/core 1.5-2.5 min
  }
}

export function restLabel(role: SlotRole): string {
  switch (role) {
    case "power":
      return "2–3+ min";
    case "heavy":
      return "2.5–4 min";
    case "compound":
    case "carry":
      return "2–3 min";
    default:
      return "1.5–2.5 min";
  }
}

export interface Prescription {
  sets: number;
  repsMin: number;
  repsMax: number;
  rir: RirTarget | null;
  restSec: number;
  isDeload: boolean;
}

export function prescriptionFor(slot: ProgramSlot, weekInBlock: number): Prescription {
  const isDeload = weekInBlock >= DELOAD_WEEK;
  return {
    sets: isDeload ? deloadSets(slot.sets) : slot.sets,
    repsMin: slot.repsMin,
    repsMax: slot.repsMax,
    rir: targetRir(slot.role, weekInBlock),
    restSec: restSeconds(slot.role),
    isDeload,
  };
}

// ── Resolving slots against the catalogue ────────────────────────────────────

/** Every catalogue name the program can put in front of you. */
export function programExerciseNames(program: ProgramDay[] = PROGRAM): string[] {
  const names = new Set<string>();
  for (const d of program) {
    for (const sl of d.slots) {
      names.add(sl.exercise);
      sl.ladder?.forEach((r) => names.add(r.exercise));
      sl.rotation?.forEach((n) => names.add(n));
    }
  }
  return [...names];
}

/** Exercises that appear on more than one day — their history must be read per day. */
export function multiDayExercises(program: ProgramDay[] = PROGRAM): Set<string> {
  const days = new Map<string, Set<DayOfWeek>>();
  for (const d of program) {
    for (const sl of d.slots) {
      const names = [sl.exercise, ...(sl.ladder?.map((r) => r.exercise) ?? []), ...(sl.rotation ?? [])];
      for (const n of names) {
        if (!days.has(n)) days.set(n, new Set());
        days.get(n)!.add(d.day);
      }
    }
  }
  return new Set([...days].filter(([, ds]) => ds.size > 1).map(([n]) => n));
}

export class MissingExercisesError extends Error {
  constructor(public missing: string[]) {
    super(
      `The exercise catalogue is missing ${missing.length} program exercise(s): ${missing.join(", ")}. ` +
        `Run POST /api/seed to add them, then regenerate the program.`
    );
  }
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
  day: DayOfWeek;
  templateLabel: string;
  isHomeWorkout: boolean;
  exercises: ResolvedExercise[];
}

/**
 * The program as rows ready to store. Throws when any program exercise is missing
 * from the catalogue — silently dropping a slot is exactly the kind of "success" that
 * hides a broken program.
 */
export function resolveProgram(program: ProgramDay[], exercises: Exercise[]): ResolvedTemplate[] {
  const byName = new Map(exercises.map((e) => [e.name, e]));
  const missing = programExerciseNames(program).filter((n) => !byName.has(n));
  if (missing.length > 0) throw new MissingExercisesError(missing);

  return program.map((d) => ({
    day: d.day,
    templateLabel: d.label,
    isHomeWorkout: false,
    exercises: d.slots.map((sl, i) => ({
      exercise: byName.get(sl.exercise)!,
      order_index: i,
      target_sets: sl.sets,
      target_reps_min: sl.repsMin,
      target_reps_max: sl.repsMax,
      progression_increment_kg: sl.incrementKg,
    })),
  }));
}

/**
 * The program slot a stored planned exercise belongs to.
 *
 * Matched on weekday + position AND checked against the names the slot can hold, so a
 * stale pre-rework program in the database is never dressed up with the wrong
 * prescription — it just gets no slot until the program is regenerated.
 */
export function slotFor(
  day: DayOfWeek,
  orderIndex: number,
  storedExerciseName: string | undefined,
  program: ProgramDay[] = PROGRAM
): ProgramSlot | null {
  const sl = program.find((d) => d.day === day)?.slots[orderIndex];
  if (!sl) return null;
  const allowed = [sl.exercise, ...(sl.ladder?.map((r) => r.exercise) ?? []), ...(sl.rotation ?? [])];
  return storedExerciseName && allowed.includes(storedExerciseName) ? sl : null;
}

export interface ScheduledChoice {
  exercise: string;
  incrementKg: number;
  /** Next ladder rung, when there is one — shown as the progression target. */
  nextRung: string | null;
  perSide: boolean;
}

/**
 * What a slot actually is this week.
 *
 *   rotation → the rotation's pick for this block week
 *   ladder   → the rung you logged MOST RECENTLY (a swap up or down sticks, because
 *              it's what you did last); the first rung if you've logged none
 *
 * `lastLoggedRung` is the ladder exercise name with the newest logged set, or null.
 */
export function scheduledExercise(
  slot: ProgramSlot,
  weekInBlock: number,
  lastLoggedRung: string | null = null
): ScheduledChoice {
  if (slot.rotation) {
    const pick = slot.rotation[rotationIndex(weekInBlock)];
    // Only the rotational throw is done per side; the slam and chest pass are not.
    return { exercise: pick, incrementKg: slot.incrementKg, nextRung: null, perSide: pick === ROT };
  }
  if (slot.ladder) {
    const idx = Math.max(0, slot.ladder.findIndex((r) => r.exercise === lastLoggedRung));
    const rung = slot.ladder[idx];
    return {
      exercise: rung.exercise,
      incrementKg: rung.incrementKg,
      nextRung: slot.ladder[idx + 1]?.exercise ?? null,
      perSide: slot.perSide,
    };
  }
  return { exercise: slot.exercise, incrementKg: slot.incrementKg, nextRung: null, perSide: slot.perSide };
}

// ── Swaps ────────────────────────────────────────────────────────────────────

/** Equipment actually available. Anything needing other kit never appears as a swap. */
export const AVAILABLE_EQUIPMENT = new Set([
  "bodyweight", "barbell", "smith", "cable", "trap_bar", "bench", "pull_up_bar",
  "plate", "medicine_ball",
]);

/**
 * Candidates for a one-day swap: same movement category, doable with the kit on hand.
 * No dumbbells, kettlebells, machines, bands or ab wheel.
 */
export function swapPool(all: Exercise[]): Exercise[] {
  return all.filter(
    (e) => e.equipment.length > 0 && e.equipment.every((eq) => AVAILABLE_EQUIPMENT.has(eq))
  );
}
