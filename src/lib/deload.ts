// Strength runs in repeating 6-week blocks. Week 6 is a deload (lighter sets + loads),
// after which a fresh block begins automatically. The user can also trigger a deload
// early; doing so makes the CURRENT week the deload, and a new block starts the week after.
//
// The whole cycle is derived from a single stored date (strength_block_start).
//
// ── The anchor is IMMUTABLE ──────────────────────────────────────────────────
// This module used to advance blockStart past each completed block and hand the
// advanced date back for the caller to persist. That made the completed-block count
// reset to zero on every write, which is fine for a deload flag but fatal for anything
// that needs to know WHICH block you're in.
//
// Phase 3 running rotates through three interval blocks (A/B/C) selected by
// blockIndex % 3, and that rotation must survive regeneration — running content is
// rebuilt weekly and strength is rebuilt whenever settings change. So the anchor now
// stays put forever and everything is derived from it by modulo:
//
//   weeksElapsed = whole weeks since strength_block_start
//   weekInBlock  = (weeksElapsed % 6) + 1
//   blockIndex   = floor(weeksElapsed / 6)
//
// blockIndex is never stored and never incremented independently. There is no second
// counter and no separate rotation anchor.
//
// The one intentional exception is manualDeloadStart(), which rewrites the anchor by
// design so the current week becomes week 6. That necessarily shifts the derived
// rotation position — a manual deload restarts the block cycle, rotation included.
//
// ── The anchor is SNAPPED TO MONDAY ──────────────────────────────────────────
// The anchor is whatever date the block happened to start on, and weeks were counted
// from that date. A Wednesday anchor meant the block week rolled over on Wednesdays —
// while the plan it drives is laid out Monday→Sunday by day_of_week. Every Monday and
// Tuesday you were shown the previous block-week's schedule, already logged, with
// nothing left to do.
//
// So every derivation snaps the stored anchor back to the Monday of its week first.
// Counting from a Monday makes weekInBlock change on Mondays, which is both what the
// rendered week looks like and what a person means by "this week". The stored date is
// left alone — snapping is idempotent, so re-deriving from it forever is stable.

import type { BlockState } from "@/types";

export const BLOCK_WEEKS = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type { BlockState };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// The Monday of the week containing d. getDay() is 0 for Sunday, so Sunday goes back
// six days rather than one — the week runs Monday→Sunday, matching DAY_ORDER in the
// planner and every weekday list in the UI.
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const back = (day + 6) % 7; // Mon→0, Tue→1, … Sun→6
  const monday = startOfDay(d);
  monday.setDate(monday.getDate() - back); // calendar-safe across DST
  return monday;
}

// Whole days between two dates, counted on the calendar rather than the clock.
//
// Dividing raw milliseconds looks equivalent and isn't: across a DST boundary a day is
// 23 or 25 hours, so the floor division loses a day twice a year — which would shift
// the deload week AND the Phase 3 block rotation every spring and autumn. Projecting
// the local Y/M/D onto UTC removes the offset entirely.
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Current block state derived from the immutable stored anchor.
//
// The returned blockStart is the anchor snapped to the Monday of its week — callers
// should persist it only when none was stored yet (first run), never on block
// advancement. A stored anchor that is already a Monday comes back untouched.
export function computeBlockState(blockStart: string | null, today = new Date()): BlockState {
  const raw = blockStart ? startOfDay(new Date(blockStart + "T00:00:00")) : startOfDay(today);
  const start = startOfWeek(raw);
  const weeksElapsed = Math.max(0, Math.floor(daysBetween(start, today) / 7));

  const weekInBlock = (weeksElapsed % BLOCK_WEEKS) + 1; // 1..6
  const blockIndex = Math.floor(weeksElapsed / BLOCK_WEEKS); // 0, 1, 2, ...

  return {
    blockStart: toDateOnly(start),
    weekInBlock,
    blockIndex,
    isDeload: weekInBlock === BLOCK_WEEKS,
  };
}

// Anchor date that makes the CURRENT week the deload week (week 6) — used by the
// manual deload control. This deliberately rewrites the anchor, so it also restarts
// the block cycle: the next block begins at blockIndex 1 relative to the new anchor.
//
// Counts back from THIS week's Monday, so the anchor it writes is itself a Monday and
// the deload covers the whole current Monday→Sunday week rather than a window offset
// by whichever weekday the button happened to be pressed on.
export function manualDeloadStart(today = new Date()): string {
  const start = startOfWeek(startOfDay(today));
  start.setDate(start.getDate() - (BLOCK_WEEKS - 1) * 7); // calendar-safe across DST
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
