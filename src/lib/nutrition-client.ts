// ============================================================
// Client-safe nutrition aggregation helpers (no server imports).
// Used by the nutrition pages to turn raw log entries + supplements + targets
// into the day and week views.
// ============================================================

import { NUTRIENTS, sumSnapshots, type NutrientSnapshot } from "@/lib/nutrients";
import type { FoodLogEntry, Supplement, NutrientTarget, TargetDirection } from "@/types";

export type NutrientStatus = "ok" | "below" | "over" | "nodata";

/** Food-only totals for a set of entries (one day). */
export function foodTotals(entries: FoodLogEntry[]): NutrientSnapshot {
  return sumSnapshots(entries.map((e) => e.nutrients ?? {}));
}

/** Daily supplement dose per nutrient key. */
export function supplementTotals(supps: Supplement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of supps) {
    out[s.nutrient_key] = (out[s.nutrient_key] ?? 0) + Number(s.dose_amount);
  }
  return out;
}

export function targetMap(targets: NutrientTarget[]): Record<string, NutrientTarget> {
  return Object.fromEntries(targets.map((t) => [t.nutrient_key, t]));
}

export function statusFor(
  total: number,
  hasData: boolean,
  target: number,
  direction: TargetDirection
): NutrientStatus {
  if (!hasData) return "nodata";
  if (direction === "limit") return total > target ? "over" : "ok";
  return total < target ? "below" : "ok";
}

// ---------- Weekly view ----------

export interface WeeklyStat {
  key: string;
  avg: number;
  daysLogged: number;
  daysBelow: number; // for limit nutrients, days over the cap
  trend: "up" | "down" | "stable";
  hasData: boolean;
}

/** Aggregate a range of entries (across multiple days) into per-nutrient
 * weekly stats. Supplements are treated as a daily intake and added to every
 * day that has at least one logged food. */
export function weeklyStats(
  entries: FoodLogEntry[],
  supps: Supplement[],
  targets: NutrientTarget[]
): WeeklyStat[] {
  const suppMap = supplementTotals(supps);
  const tMap = targetMap(targets);

  // group entries by date
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const dates = Array.from(byDate.keys()).sort();

  return NUTRIENTS.map((n) => {
    const target = tMap[n.key]?.target_amount ?? n.defaultTarget;
    const direction = tMap[n.key]?.direction ?? n.direction;

    // per-day total (food + supplement) and whether the day had any data
    const daily: { total: number; hasData: boolean }[] = dates.map((d) => {
      const food = foodTotals(byDate.get(d)!)[n.key];
      const hasFood = food != null;
      const supp = suppMap[n.key] ?? 0;
      return { total: (food ?? 0) + supp, hasData: hasFood || supp > 0 };
    });

    const loggedDays = daily.filter((d) => d.hasData);
    const daysLogged = loggedDays.length;
    const hasData = daysLogged > 0;
    const avg = hasData
      ? loggedDays.reduce((s, d) => s + d.total, 0) / daysLogged
      : 0;

    const daysBelow = loggedDays.filter((d) =>
      direction === "limit" ? d.total > target : d.total < target
    ).length;

    // trend: mean of first half vs second half of logged days
    let trend: WeeklyStat["trend"] = "stable";
    if (daysLogged >= 2) {
      const vals = loggedDays.map((d) => d.total);
      const mid = Math.floor(vals.length / 2);
      const firstHalf = vals.slice(0, mid);
      const secondHalf = vals.slice(mid);
      const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      const a = mean(firstHalf.length ? firstHalf : secondHalf);
      const b = mean(secondHalf);
      const delta = (b - a) / (Math.abs(a) || 1);
      if (delta > 0.1) trend = "up";
      else if (delta < -0.1) trend = "down";
    }

    return { key: n.key, avg, daysLogged, daysBelow, trend, hasData };
  });
}

/** Format a Date as YYYY-MM-DD in *local* time. `toISOString()` is UTC, so in
 * timezones ahead of UTC local midnight lands on the previous UTC day —
 * `shiftDate(d, +1)` would return `d` unchanged and `-1` would jump 2 days. */
export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function formatDateLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === shiftDate(today, -1)) return "Yesterday";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Round a displayed amount sensibly (more precision for tiny µg values). */
export function fmt(n: number, unit: string): string {
  if (unit === "µg" || n < 1) return (Math.round(n * 10) / 10).toString();
  if (n < 100) return (Math.round(n * 10) / 10).toString();
  return Math.round(n).toString();
}
