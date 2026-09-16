import { describe, it, expect } from "vitest";
import { adaptiveTDEE, KCAL_PER_KG, type WeightPoint, type IntakePoint } from "@/lib/targets";

// Maintenance is re-derived from scratch on every page load, so its stability
// IS the product: a target that jumps hundreds of kcal between two days with the
// same eating is untrustworthy. These tests pin the energy-balance maths, the
// alignment of intake with the weight trend, and resistance to single noisy
// weigh-ins.

const FORMULA = 3000; // clamp band 2250–3750, wide enough not to interfere

function dateAt(i: number): string {
  const d = new Date("2026-08-01T00:00:00");
  d.setDate(d.getDate() + i);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function days(n: number, fn: (i: number) => number): { date: string; value: number }[] {
  return Array.from({ length: n }, (_, i) => ({ date: dateAt(i), value: fn(i) }));
}
const weights = (n: number, fn: (i: number) => number): WeightPoint[] =>
  days(n, fn).map(({ date, value }) => ({ date, weight_kg: value }));
const intake = (n: number, fn: (i: number) => number): IntakePoint[] =>
  days(n, fn).map(({ date, value }) => ({ date, kcal: value }));

describe("adaptive maintenance", () => {
  it("equals mean intake when weight is flat", () => {
    const tdee = adaptiveTDEE(weights(28, () => 87), intake(28, () => 2600), FORMULA);
    expect(tdee).toBeCloseTo(2600, 5);
  });

  it("adds the deficit implied by a steady loss", () => {
    // −0.5 kg/week at a steady 2400 kcal → deficit of 0.5 × 7700 / 7 ≈ 550 kcal/day
    const tdee = adaptiveTDEE(weights(28, (i) => 90 - (0.5 / 7) * i), intake(28, () => 2400), FORMULA);
    expect(tdee).toBeCloseTo(2400 + (0.5 * KCAL_PER_KG) / 7, 5);
  });

  it("ignores intake on the last weigh-in day, which is still being logged", () => {
    const food = intake(28, () => 2600);
    food[27] = { date: dateAt(27), kcal: 900 }; // half-logged today
    const tdee = adaptiveTDEE(weights(28, () => 87), food, FORMULA);
    expect(tdee).toBeCloseTo(2600, 5);
  });

  it("only uses the last 28 days", () => {
    // 20 older days of heavy loss must not leak into a flat recent month
    const w = weights(48, (i) => (i < 20 ? 95 - i * 0.4 : 87));
    const tdee = adaptiveTDEE(w, intake(48, () => 2600), FORMULA);
    expect(tdee).toBeCloseTo(2600, 5);
  });

  it("moves little when one weigh-in is a +1.3 kg outlier", () => {
    const w = weights(28, () => 87);
    w[14] = { date: dateAt(14), weight_kg: 88.3 };
    const tdee = adaptiveTDEE(w, intake(28, () => 2600), FORMULA)!;
    // a mid-window point barely tilts the regression line
    expect(Math.abs(tdee - 2600)).toBeLessThan(20);
  });

  it("does not jump when a noisy reading drops out of the window", () => {
    // realistic ±0.5 kg scatter on a flat trend; compare consecutive days
    const scatter = [0.4, -0.3, 0.1, -0.5, 0.6, 0, -0.2, 0.3, -0.4, 0.5, -0.1, 0.2, -0.6, 0.1, 0.4];
    const w = weights(45, (i) => 87 + scatter[i % scatter.length]);
    const food = intake(45, () => 2600);
    const estimates: number[] = [];
    for (let end = 28; end <= 45; end++) {
      estimates.push(adaptiveTDEE(w.slice(0, end), food.slice(0, end), FORMULA)!);
    }
    for (let i = 1; i < estimates.length; i++) {
      expect(Math.abs(estimates[i] - estimates[i - 1])).toBeLessThan(60);
    }
  });

  it("falls back (null) with under two weeks of weigh-ins", () => {
    expect(adaptiveTDEE(weights(13, () => 87), intake(13, () => 2600), FORMULA)).toBeNull();
    expect(adaptiveTDEE(weights(14, () => 87), intake(14, () => 2600), FORMULA)).not.toBeNull();
  });

  it("falls back (null) when too few days are well logged", () => {
    // 28-day span needs ≥ 19 logged days (70 % of 27); log only every other day
    const food = intake(28, (i) => (i % 2 === 0 ? 2600 : 400));
    expect(adaptiveTDEE(weights(28, () => 87), food, FORMULA)).toBeNull();
  });

  it("clamps to ±25 % of the formula", () => {
    const tdee = adaptiveTDEE(weights(28, (i) => 90 - 0.3 * i), intake(28, () => 2600), FORMULA);
    expect(tdee).toBe(FORMULA * 1.25);
  });
});
