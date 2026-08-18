// ============================================================
// Weekly training planner.
//
// Owns placement of the entire week — 3 gym days, 2 home days and the runs — rather
// than letting the user pick days for strength and leaving running unplaced. The
// whole point is that these two share one recovery budget, so the week has to be
// optimised as a unit rather than session by session.
//
// This replaces run-schedule.ts, which could only print advice ("intervals: Sat, Sun;
// avoid Tue, Wed") because runs had no weekday at all. Its core principle — keep ~48h
// between heavy patellar-tendon loading and high-impact hard running — survives here
// as a real constraint, generalised: VO2 is scored against the actual lower-body and
// neuromuscular load of its surrounding days, so it is kept clear of Gym C, Home B or
// a long run too, not just the heavy squat day.
//
// Pure and deterministic: same input always yields the same week, which is what makes
// the scheduling rules testable.
// ============================================================

import type { DayOfWeek, RunType } from "@/types";
import {
  type SessionLoad,
  type WeeklyLoad,
  weeklyLoad,
  VO2_WINDOW_CEILING,
} from "@/lib/training-load";

export const WEEK_ORDER: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

export interface PlannerSession {
  id: string;
  kind: "gym" | "home" | "run";
  label: string;
  load: SessionLoad;
  runType?: RunType;
  optional?: boolean;
}

export interface PlanInput {
  strength: PlannerSession[]; // 3 gym + 2 home
  runs: PlannerSession[];
  noGymDays: DayOfWeek[];
}

export interface PlannedDay {
  day: DayOfWeek;
  sessions: PlannerSession[];
}

export interface WeekPlan {
  days: PlannedDay[]; // always 7, in calendar order
  restDay: DayOfWeek;
  weekly: WeeklyLoad;
  relaxations: string[]; // constraints given up, in the order they were given up
  dropped: PlannerSession[]; // sessions that could not be placed
}

// A day may hold two sessions only when the pairing is genuinely safe. Both of these
// must hold, which is what stops VO2 or the heavy squat day being stacked with anything.
const MAX_DOUBLE_NEURO = 3;

function isHeavyLower(s: PlannerSession): boolean {
  return s.load.lowerBody >= 3;
}

function isVO2(s: PlannerSession): boolean {
  return s.runType === "interval";
}

function canShareDay(a: PlannerSession, b: PlannerSession): boolean {
  if (isVO2(a) || isVO2(b)) return false;
  if (isHeavyLower(a) || isHeavyLower(b)) return false;
  return a.load.neuromuscular + b.load.neuromuscular <= MAX_DOUBLE_NEURO;
}

/** Circular neighbours — the week wraps, so Sunday and Monday are adjacent. */
function neighbourIndices(i: number): [number, number] {
  return [(i + 6) % 7, (i + 1) % 7];
}

type Grid = PlannerSession[][]; // 7 slots, index matches WEEK_ORDER

function emptyGrid(): Grid {
  return WEEK_ORDER.map(() => []);
}

/**
 * Summed lower-body + neuromuscular stress in the window around day `i`
 * (day before, the day itself, day after).
 *
 * VO2 placement is scored on this rather than on distance from the heavy squat day.
 * Distance from Gym B then falls out naturally — but so does separation from Gym C,
 * Home B, or a long run parked next to it, which a Gym-B-only rule would miss.
 */
export function vo2WindowLoad(grid: Grid, i: number): number {
  const [before, after] = neighbourIndices(i);
  let total = 0;
  for (const idx of [before, i, after]) {
    for (const s of grid[idx]) {
      if (isVO2(s)) continue; // don't score the VO2 session against itself
      total += s.load.lowerBody + s.load.neuromuscular;
    }
  }
  return total;
}

function adjacentTo(grid: Grid, i: number, pred: (s: PlannerSession) => boolean): boolean {
  const [before, after] = neighbourIndices(i);
  return grid[before].some(pred) || grid[after].some(pred);
}

interface Attempt {
  includeOptional: boolean;
  maxDoubles: number;
  gymDays: number;
  note: string;
}

// Fallback order when the week cannot be satisfied as specified. The full rest day is
// a hard constraint and is never relaxed — it is the only thing forcing the planner to
// be honest about total load rather than quietly filling all seven days.
const ATTEMPTS: Attempt[] = [
  { includeOptional: true, maxDoubles: 2, gymDays: 3, note: "" },
  { includeOptional: false, maxDoubles: 2, gymDays: 3, note: "Dropped the optional unstructured run." },
  { includeOptional: false, maxDoubles: 3, gymDays: 3, note: "Allowed a third safe double." },
  { includeOptional: false, maxDoubles: 3, gymDays: 2, note: "Reduced to two gym days — not enough available weekdays." },
];

export function planWeek(input: PlanInput): WeekPlan {
  const noGym = new Set(input.noGymDays);

  for (const attempt of ATTEMPTS) {
    const result = tryPlan(input, attempt, noGym);
    if (result) {
      const relaxations = ATTEMPTS.slice(0, ATTEMPTS.indexOf(attempt) + 1)
        .map((a) => a.note)
        .filter(Boolean);
      return { ...result, relaxations };
    }
  }

  // Unreachable in practice — the last attempt drops to two gym days and no optional
  // run, which always fits. Kept so the function is total rather than throwing.
  return {
    days: WEEK_ORDER.map((day) => ({ day, sessions: [] })),
    restDay: "sunday",
    weekly: weeklyLoad([]),
    relaxations: ["Could not build a valid week."],
    dropped: [...input.strength, ...input.runs],
  };
}

function tryPlan(
  input: PlanInput,
  attempt: Attempt,
  noGym: Set<DayOfWeek>
): Omit<WeekPlan, "relaxations"> | null {
  const gymAll = input.strength.filter((s) => s.kind === "gym");
  const home = input.strength.filter((s) => s.kind === "home");

  // When gym days are cut, drop the lowest-cost gym session — never the heavy anchor.
  const gym = [...gymAll]
    .sort((a, b) => b.load.recoveryCost - a.load.recoveryCost)
    .slice(0, attempt.gymDays);
  const droppedGym = gymAll.filter((s) => !gym.includes(s));

  const runs = input.runs.filter((r) => attempt.includeOptional || !r.optional);
  const droppedRuns = input.runs.filter((r) => !runs.includes(r));

  // Order matters: most-constrained first. The heavy day is pinned to a gym-eligible
  // weekday, VO2 has a window constraint, and the long run has a soft one.
  const heavy = gym.filter(isHeavyLower).sort((a, b) => b.load.recoveryCost - a.load.recoveryCost);
  const otherGym = gym.filter((g) => !heavy.includes(g));
  const vo2 = runs.filter(isVO2);
  const long = runs.filter((r) => r.runType === "long");
  const easy = runs.filter((r) => r.runType === "easy" || r.runType === "unstructured");

  const ordered = [...heavy, ...otherGym, ...vo2, ...long, ...home, ...easy];

  // Held in an object so the assignment inside the callback is visible to the type
  // checker, which otherwise narrows a plain `let` to never.
  const best: { value: { grid: Grid; restIdx: number; score: number } | null } = { value: null };

  // Explore many valid layouts per rest day rather than stopping at the first one.
  // Taking the first valid assignment made scoreWeek almost decorative — it could only
  // choose between rest days, never between arrangements — which is why the three gym
  // sessions ended up stacked on Mon/Tue/Wed.
  for (let restIdx = 0; restIdx < 7; restIdx++) {
    const grid = emptyGrid();
    const budget = { nodes: 0, solutions: 0 };
    search(ordered, 0, grid, restIdx, noGym, attempt, budget, (g) => {
      const score = scoreWeek(g, restIdx);
      if (!best.value || score < best.value.score) {
        best.value = { grid: g.map((day) => [...day]), restIdx, score };
      }
    });
  }

  const chosen = best.value;
  if (!chosen) return null;

  const days = WEEK_ORDER.map((day, i) => ({ day, sessions: chosen.grid[i] }));
  const allLoads = chosen.grid.flat().map((s) => s.load);

  return {
    days,
    restDay: WEEK_ORDER[chosen.restIdx],
    weekly: weeklyLoad(allLoads),
    dropped: [...droppedGym, ...droppedRuns],
  };
}

// Bounds on the search. The space is small enough that these are rarely reached, but
// they keep a pathological input from hanging the request.
const MAX_NODES = 120_000;
const MAX_SOLUTIONS = 4_000;

interface Budget {
  nodes: number;
  solutions: number;
}

/**
 * Depth-first placement with pruning, reporting every valid layout it finds.
 *
 * Deterministic: days are tried in a fixed order, so the same input always explores in
 * the same sequence and ties resolve to the first layout found.
 */
function search(
  sessions: PlannerSession[],
  idx: number,
  grid: Grid,
  restIdx: number,
  noGym: Set<DayOfWeek>,
  attempt: Attempt,
  budget: Budget,
  onSolution: (grid: Grid) => void
): void {
  if (budget.nodes > MAX_NODES || budget.solutions > MAX_SOLUTIONS) return;
  budget.nodes++;

  if (idx >= sessions.length) {
    budget.solutions++;
    onSolution(grid);
    return;
  }

  const s = sessions[idx];

  // Empty days before occupied ones, so a double is only ever created when the week
  // genuinely has nowhere else to go. Within each tier the order stays calendar-based,
  // which keeps the whole search deterministic.
  const candidates = [
    ...[0, 1, 2, 3, 4, 5, 6].filter((d) => grid[d].length === 0),
    ...[0, 1, 2, 3, 4, 5, 6].filter((d) => grid[d].length === 1),
  ];

  for (const d of candidates) {
    if (d === restIdx) continue; // the rest day is never used
    if (s.kind === "gym" && noGym.has(WEEK_ORDER[d])) continue;

    const existing = grid[d];
    if (existing.length >= 2) continue;
    if (existing.length === 1) {
      if (!canShareDay(existing[0], s)) continue;
      const doubles = grid.filter((day) => day.length >= 2).length;
      if (doubles >= attempt.maxDoubles) continue;
    }

    grid[d].push(s);

    if (isPlacementValid(grid, d, s)) {
      search(sessions, idx + 1, grid, restIdx, noGym, attempt, budget, onSolution);
    }

    grid[d].pop();
  }
}

/** Hard constraints checked incrementally as each session lands. */
function isPlacementValid(grid: Grid, d: number, s: PlannerSession): boolean {
  // VO2 must sit in a window whose combined lower-body and neuromuscular load is
  // under the ceiling. Checked from both directions: when VO2 lands, and when
  // anything lands next to an already-placed VO2.
  if (isVO2(s)) {
    if (vo2WindowLoad(grid, d) > VO2_WINDOW_CEILING) return false;
  } else {
    for (let i = 0; i < 7; i++) {
      if (!grid[i].some(isVO2)) continue;
      if (vo2WindowLoad(grid, i) > VO2_WINDOW_CEILING) return false;
    }
  }
  return true;
}

/**
 * Lower is better. Soft preferences ONLY — everything mandatory is enforced in
 * isPlacementValid, so nothing here can override the VO2 window, the long-run rule,
 * the rest day or the double restrictions. When several layouts satisfy every hard
 * constraint at similar total load, these preferences break the tie.
 */
function scoreWeek(grid: Grid, restIdx: number): number {
  let score = 0;

  const hasGym = (i: number) => grid[i].some((s) => s.kind === "gym");
  const hasHome = (i: number) => grid[i].some((s) => s.kind === "home");

  for (let i = 0; i < 7; i++) {
    // Spread the gym sessions rather than stacking them. Back-to-back gym days are
    // legal but give the joints and CNS no room, so they cost.
    if (hasGym(i) && hasGym((i + 1) % 7)) score += 14;

    // A lighter home session sitting between two gym days is exactly the buffer we
    // want, so reward it. This can only apply when the gyms aren't adjacent, so it
    // never fights the penalty above.
    if (hasHome(i) && !hasGym(i) && hasGym((i + 6) % 7) && hasGym((i + 1) % 7)) score -= 8;

    // Two runs in one day is a specific training choice, not a sensible default —
    // when a double is needed, pair a run with a strength session instead.
    if (grid[i].length === 2 && grid[i].every((s) => s.kind === "run")) score += 16;
  }

  for (let i = 0; i < 7; i++) {
    // Long Zone 2 should not be the day before or after the heavy lower session,
    // unless no valid schedule exists without it — hence a heavy penalty rather
    // than a hard rejection.
    if (grid[i].some((s) => s.runType === "long") && adjacentTo(grid, i, isHeavyLower)) {
      score += 40;
    }
    // Prefer VO2 windows well under the ceiling, not merely at it.
    if (grid[i].some(isVO2)) score += vo2WindowLoad(grid, i) * 4;
    // Prefer fewer doubles.
    if (grid[i].length >= 2) score += 6;
    // Prefer the rest day to follow the heaviest stretch.
    if (grid[i].some(isHeavyLower)) {
      const distance = Math.min((restIdx - i + 7) % 7, (i - restIdx + 7) % 7);
      score += distance;
    }
  }

  // Prefer an even spread of load across the week.
  const costs = grid.map((day) => day.reduce((sum, s) => sum + s.load.recoveryCost, 0));
  const mean = costs.reduce((a, b) => a + b, 0) / 7;
  score += costs.reduce((sum, c) => sum + Math.abs(c - mean), 0) * 0.5;

  return score;
}
