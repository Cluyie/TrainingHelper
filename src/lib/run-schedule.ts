import type { PlannedWorkout } from "@/types";

// Scheduling guidance for hard (VO2 max) runs relative to the strength week.
// Runs aren't pinned to weekdays, so we can't auto-coordinate — instead we advise:
//   • rest days are the ideal slot for intervals (cleanest recovery)
//   • the heavy squat day (Gym B) AND the day before it are what to avoid, so there's
//     ~48h between heavy patellar-tendon loading and high-impact hard running.

const WEEK_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

export interface RunSchedulingHint {
  haveSchedule: boolean; // false when no strength program is generated yet
  restShort: string;     // e.g. "Sat, Sun"  — ideal days for the VO2 run
  avoidShort: string;    // e.g. "Tue, Wed"  — around the heavy squat day
}

export function getRunSchedulingHint(workouts: PlannedWorkout[]): RunSchedulingHint {
  const assignedDays = workouts.map((w) => w.day_of_week as string);
  const restDays = WEEK_ORDER.filter((d) => !assignedDays.includes(d));
  const legDays = workouts.filter((w) => /squat/i.test(w.label)).map((w) => w.day_of_week as string);
  const avoidDays = Array.from(
    new Set(legDays.flatMap((d) => {
      const i = WEEK_ORDER.indexOf(d);
      return [WEEK_ORDER[(i + 6) % 7], d]; // day before + the squat day itself
    }))
  ).sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));

  return {
    haveSchedule: workouts.length > 0,
    restShort: restDays.map((d) => DAY_SHORT[d]).join(", "),
    avoidShort: avoidDays.map((d) => DAY_SHORT[d]).join(", "),
  };
}
