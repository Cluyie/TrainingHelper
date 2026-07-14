// The running program's "current week" is CALENDAR-driven, not completion-driven.
// It advances one week per real week regardless of how many sessions were actually
// run — a light or missed week leaves past weeks as history, never as a debt to
// catch up. This matches the program's base-building, skip-guilt-free philosophy:
// consistency over months matters far more than hitting every session in any one week.
//
// The whole thing is derived from a single stored anchor (program_start_date). The
// user can re-align it any time via the "I'm on week N" control (startDateForWeek).

export const PROGRAM_WEEKS = 16;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export interface RunningWeekState {
  programStart: string; // ISO date (YYYY-MM-DD)
  currentWeek: number; // 1..16, clamped to the program length
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

// Current calendar week from the stored anchor. When no anchor is stored yet, it
// defaults to today (week 1); the caller should persist the returned programStart
// so the anchor is fixed — otherwise "today" moves each day and the week never grows.
export function computeRunningWeek(programStart: string | null, today = new Date()): RunningWeekState {
  const start = programStart ? startOfDay(new Date(programStart + "T00:00:00")) : startOfDay(today);
  const weeks = Math.max(
    0,
    Math.floor((startOfDay(today).getTime() - start.getTime()) / MS_PER_WEEK)
  );
  const currentWeek = Math.min(PROGRAM_WEEKS, weeks + 1);
  return { programStart: toDateOnly(start), currentWeek };
}

// Anchor date that makes `week` the current calendar week as of today — used by the
// "I'm on week N" control to re-align the program to real life.
export function startDateForWeek(week: number, today = new Date()): string {
  const w = Math.min(PROGRAM_WEEKS, Math.max(1, Math.floor(week)));
  const start = new Date(startOfDay(today).getTime() - (w - 1) * MS_PER_WEEK);
  return toDateOnly(start);
}
