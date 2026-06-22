// Strength runs in repeating 6-week blocks. Week 6 is a deload (lighter sets + loads),
// after which a fresh block begins automatically. The user can also trigger a deload
// early; doing so makes the CURRENT week the deload, and a new block starts the week after.
//
// The whole cycle is derived from a single stored date (strength_block_start) via lazy
// advancement on read — no scheduled job needed.

export const BLOCK_WEEKS = 6;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export interface BlockState {
  blockStart: string; // ISO date (YYYY-MM-DD); may be advanced past completed blocks
  weekInBlock: number; // 1..6
  isDeload: boolean; // true on week 6
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Current block state from the stored start date, lazily advancing past any completed
// 6-week blocks. Returns the (possibly advanced) blockStart so the caller can persist it.
export function computeBlockState(blockStart: string | null, today = new Date()): BlockState {
  const start = blockStart ? startOfDay(new Date(blockStart + "T00:00:00")) : startOfDay(today);
  const weeks = Math.max(
    0,
    Math.floor((startOfDay(today).getTime() - start.getTime()) / MS_PER_WEEK)
  );
  const completedBlocks = Math.floor(weeks / BLOCK_WEEKS);
  const newStart = new Date(start.getTime() + completedBlocks * BLOCK_WEEKS * MS_PER_WEEK);
  const weekInBlock = (weeks % BLOCK_WEEKS) + 1; // 1..6

  return {
    blockStart: toDateOnly(newStart),
    weekInBlock,
    isDeload: weekInBlock === BLOCK_WEEKS,
  };
}

// Start date that makes the CURRENT week the deload week (week 6) — used for a manual
// deload. The lazy advance then restarts the block at week 1 the following week.
export function manualDeloadStart(today = new Date()): string {
  const start = new Date(startOfDay(today).getTime() - (BLOCK_WEEKS - 1) * MS_PER_WEEK);
  return toDateOnly(start);
}

// Deload adjustments: fewer working sets and ~10% lighter loads, never to failure.
export function deloadSets(sets: number): number {
  return Math.max(2, sets - 1);
}

export function deloadWeight(kg: number, increment = 2.5): number {
  if (!kg) return kg;
  const step = increment || 2.5;
  return Math.max(0, Math.round((kg * 0.9) / step) * step);
}
