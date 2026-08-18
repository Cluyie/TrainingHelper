// ============================================================
// Running content, derived from running_phase × weekInBlock (× blockIndex in Phase 3).
//
// Replaces the retired 16-week RUNNING_PROGRAM. Running no longer has its own calendar:
// it shares the 6-week block clock with strength, so week 6 deloads both at once.
// Previously the two drifted independently and could deload in different weeks.
//
// ── Phase separation ─────────────────────────────────────────────────────────
// running_phase is deliberately NOT current_phase. The strength phase gates
// shoulder-risky lifts and is advanced manually; the running phase gates interval
// work and advances automatically at block end (subject to a completion gate).
// Cranky shoulders shouldn't be able to block VO2 training — they're unrelated systems.
//
//   Phase 1 — Base:        2 easy Z2 + 1 long Z2. No intervals at all.
//   Phase 2 — Development: 1 easy + 1 VO2 (introduced gently) + 1 long.
//   Phase 3 — Full:        1 easy + 1 VO2 (full stimulus, rotating) + 1 long.
//
// The optional unstructured session exists to be enjoyable and to be skipped
// guilt-free. The planner places it last and only if a slot remains.
//
// ── Wave-loading, not a linear ramp ──────────────────────────────────────────
// Interval formats are NOT ordered by difficulty. 6 × 1.5 min is nine minutes of hard
// work; 4 × 4 min is sixteen. The short-interval week is a DIFFERENT stimulus, not a
// bigger one. Within every block, weeks 1→2→4 carry the progression, week 3 is a
// variation week, week 5 is a deliberate pull-back and week 6 is the deload.
// This waving is what makes years of interval training sustainable rather than a grind.
// ============================================================

import type { Phase, RunType } from "@/types";

export interface PlannedRun {
  session_in_week: number;
  type: RunType;
  target_duration_min: number;
  target_description: string;
  optional: boolean;
}

interface Interval {
  reps: number;
  workMin: number;
  recoveryMin: number;
  note: string;
}

const WARMUP_MIN = 5;
const COOLDOWN_MIN = 3;

function intervalDuration(i: Interval): number {
  return WARMUP_MIN + i.reps * (i.workMin + i.recoveryMin) + COOLDOWN_MIN;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function intervalDescription(i: Interval): string {
  return (
    `VO2: ${WARMUP_MIN} min warm-up → ${i.reps} × (${fmt(i.workMin)} min hard / ` +
    `${fmt(i.recoveryMin)} min easy) → ${COOLDOWN_MIN} min cool-down. ` +
    `Hard means 90-95% HR — controlled and repeatable, never a sprint. ${i.note}`
  );
}

// ── Phase 2: VO2 introduced gently ───────────────────────────────────────────
// Index 0..4 = block weeks 1..5. Week 6 is the deload and has no intervals.
const PHASE_2_INTERVALS: Interval[] = [
  { reps: 4, workMin: 2, recoveryMin: 2, note: "Your first intervals — deliberately short. Keep them submaximal." },
  { reps: 4, workMin: 3, recoveryMin: 3, note: "Longer work intervals. Uncomfortable but controlled." },
  { reps: 5, workMin: 3, recoveryMin: 3, note: "One more rep at the same intensity — this is the progression." },
  { reps: 4, workMin: 3, recoveryMin: 3, note: "Back to four reps. Sharper than last week, not longer." },
  { reps: 3, workMin: 3, recoveryMin: 3, note: "Deliberate pull-back. Keep the stimulus, shed the fatigue — this waving is the point." },
];

// ── Phase 3: three rotating blocks, selected by blockIndex % 3 ───────────────
// Phase 3 is the steady state held for years, so a single fixed block would become
// the same six weeks forever. Three emphases — 4-minute, 2/3-minute and 5-minute
// reps — mean eighteen weeks pass before anything repeats.
//
// These blocks ROTATE CYCLICALLY. They are not an instruction to increase interval
// volume indefinitely: after Block C it returns to Block A. Long-term progression
// comes primarily from improved performance at a given workload, not from
// continuously increasing interval volume.
const PHASE_3_BLOCKS: Interval[][] = [
  // Block A — 4-minute benchmark (the classic Norwegian 4×4)
  [
    { reps: 4, workMin: 4, recoveryMin: 4, note: "The benchmark VO2 session. Hold 90-95% HR for each block." },
    { reps: 5, workMin: 4, recoveryMin: 4, note: "One more rep than the benchmark — this is the progression." },
    { reps: 6, workMin: 1.5, recoveryMin: 1.5, note: "VARIATION week: shorter and sharper. Less total work than 4×4, at a higher intensity — a different stimulus, not a bigger one." },
    { reps: 5, workMin: 4, recoveryMin: 4, note: "Back to the progression thread." },
    { reps: 3, workMin: 3, recoveryMin: 3, note: "Deliberate pull-back before the deload." },
  ],
  // Block B — shorter-interval emphasis
  [
    { reps: 5, workMin: 3, recoveryMin: 3, note: "Shorter reps this block — more of them, at a higher intensity." },
    { reps: 4, workMin: 4, recoveryMin: 4, note: "The benchmark session, for a reference point mid-block." },
    { reps: 6, workMin: 2, recoveryMin: 2, note: "VARIATION week: six sharp reps. Different stimulus, not a harder one." },
    { reps: 5, workMin: 3, recoveryMin: 3, note: "Back to the block's main format." },
    { reps: 3, workMin: 3, recoveryMin: 3, note: "Deliberate pull-back before the deload." },
  ],
  // Block C — long reps
  [
    { reps: 3, workMin: 5, recoveryMin: 4, note: "Long reps this block — five minutes is right at the edge of sustainable VO2 work." },
    { reps: 4, workMin: 5, recoveryMin: 4, note: "One more long rep. Pace it from the first minute or the last rep falls apart." },
    { reps: 4, workMin: 4, recoveryMin: 4, note: "VARIATION week: the benchmark 4×4 — shorter than this block's staple." },
    { reps: 4, workMin: 5, recoveryMin: 4, note: "Back to the block's main format." },
    { reps: 3, workMin: 3, recoveryMin: 3, note: "Deliberate pull-back before the deload." },
  ],
];

export const PHASE_3_BLOCK_NAMES = ["A — 4-min benchmark", "B — shorter-interval emphasis", "C — long reps"];

// Easy and long Zone 2 durations by block week (index 0..4 = weeks 1..5), then deload.
const EASY_MIN: Record<Phase, { ramp: number[]; deload: number }> = {
  1: { ramp: [30, 32, 35, 38, 40], deload: 25 },
  2: { ramp: [35, 36, 38, 39, 40], deload: 28 },
  3: { ramp: [40, 40, 40, 40, 40], deload: 30 },
};

const LONG_MIN: Record<Phase, { ramp: number[]; deload: number }> = {
  1: { ramp: [40, 45, 50, 55, 60], deload: 35 },
  2: { ramp: [45, 48, 52, 56, 60], deload: 38 },
  3: { ramp: [50, 55, 60, 62, 65], deload: 40 },
};

const ZONE_2_CUE =
  "Conversational the whole way — if you can't speak in full sentences, slow down.";

/** Which Phase 3 interval block a given block index uses. Rotates A → B → C → A. */
export function phase3BlockVariant(blockIndex: number): number {
  return ((blockIndex % 3) + 3) % 3; // guards against negatives
}

/**
 * The week's runs for a given running phase and position in the 6-week block.
 *
 * Every week 1-6 of every phase returns a defined set of sessions — there are no gaps,
 * because the block clock drives the content and a missing week would leave the
 * generator with nothing to emit.
 */
export function runningWeek(
  runningPhase: Phase,
  weekInBlock: number,
  blockIndex = 0
): PlannedRun[] {
  const isDeload = weekInBlock === 6;
  const i = Math.min(Math.max(weekInBlock, 1), 5) - 1; // ramp index 0..4

  const easyMin = isDeload ? EASY_MIN[runningPhase].deload : EASY_MIN[runningPhase].ramp[i];
  const longMin = isDeload ? LONG_MIN[runningPhase].deload : LONG_MIN[runningPhase].ramp[i];

  const runs: PlannedRun[] = [];
  let n = 1;

  const deloadPrefix = isDeload ? "DELOAD: " : "";

  // Phase 1 builds the base with two standard easy runs; phases 2 and 3 trade the
  // second easy run for the VO2 session so weekly load doesn't simply accumulate.
  const easyCount = runningPhase === 1 ? 2 : 1;
  for (let e = 0; e < easyCount; e++) {
    runs.push({
      session_in_week: n++,
      type: "easy",
      target_duration_min: easyMin,
      target_description: `${deloadPrefix}Zone 2: ${easyMin} min easy continuous. ${ZONE_2_CUE}`,
      optional: false,
    });
  }

  // VO2 — phase 2 and 3 only, and never during the deload week.
  if (runningPhase >= 2 && !isDeload) {
    const interval =
      runningPhase === 2
        ? PHASE_2_INTERVALS[i]
        : PHASE_3_BLOCKS[phase3BlockVariant(blockIndex)][i];

    runs.push({
      session_in_week: n++,
      type: "interval",
      target_duration_min: intervalDuration(interval),
      target_description: intervalDescription(interval),
      optional: false,
    });
  }

  runs.push({
    session_in_week: n++,
    type: "long",
    target_duration_min: longMin,
    target_description: `${deloadPrefix}Long Zone 2: ${longMin} min easy. Time on feet is the point — keep it genuinely easy throughout.`,
    optional: false,
  });

  // Optional, unstructured, no targets and no progression. Exists to be skipped.
  runs.push({
    session_in_week: n++,
    type: "unstructured",
    target_duration_min: 50,
    target_description:
      "OPTIONAL: 45-60 min easy walk or very easy jog. No structure, no targets, no progression. Skip it freely on a tired week.",
    optional: true,
  });

  return runs;
}

/**
 * Whether the running phase may advance at the end of a block.
 *
 * Aerobic progression is time-driven and carries no shoulder risk, so this advances
 * automatically — but VO2 intervals do carry real injury risk (Achilles, calf, knee)
 * for a returning runner. Jumping someone to 4×4s after a block they barely ran is a
 * bad idea, so the bump is gated on having actually done roughly two-thirds of the
 * block's non-optional runs.
 */
export const COMPLETION_GATE = 2 / 3;

export function shouldAdvanceRunningPhase(
  currentPhase: Phase,
  completedRequiredRuns: number,
  totalRequiredRuns: number
): { advance: boolean; reason: string } {
  if (currentPhase >= 3) {
    return { advance: false, reason: "Phase 3 is the steady state — it repeats rather than advancing." };
  }
  if (totalRequiredRuns === 0) {
    return { advance: false, reason: "No runs were scheduled in this block." };
  }

  const ratio = completedRequiredRuns / totalRequiredRuns;
  if (ratio >= COMPLETION_GATE) {
    return { advance: true, reason: `Completed ${completedRequiredRuns}/${totalRequiredRuns} runs — moving to phase ${currentPhase + 1}.` };
  }
  return {
    advance: false,
    reason: `Only ${completedRequiredRuns}/${totalRequiredRuns} runs completed — staying on phase ${currentPhase} to build the base first.`,
  };
}
