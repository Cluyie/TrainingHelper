import { describe, it, expect } from "vitest";
import { runningWeek, shouldAdvanceRunningPhase } from "@/lib/running-plan";
import type { Phase } from "@/types";

const PHASES: Phase[] = [1, 2, 3];
const WEEKS = [1, 2, 3, 4, 5, 6];

describe("running content by phase", () => {
  it("emits a defined week for every phase and every block week", () => {
    // The block clock drives running content, so a gap means the generator has
    // nothing to emit that week. Both phase rows previously skipped weeks.
    for (const phase of PHASES) {
      for (const week of WEEKS) {
        const runs = runningWeek(phase, week, 0);
        expect(runs.length, `phase ${phase} week ${week}`).toBeGreaterThan(0);
        for (const r of runs) {
          expect(r.target_duration_min).toBeGreaterThan(0);
          expect(r.target_description.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("never emits intervals in phase 1", () => {
    for (const week of WEEKS) {
      const runs = runningWeek(1, week, 0);
      expect(runs.some((r) => r.type === "interval")).toBe(false);
    }
  });

  it("gives phase 1 two easy runs plus a long run", () => {
    const runs = runningWeek(1, 1, 0);
    expect(runs.filter((r) => r.type === "easy")).toHaveLength(2);
    expect(runs.filter((r) => r.type === "long")).toHaveLength(1);
  });

  it("introduces exactly one interval session in phases 2 and 3", () => {
    for (const phase of [2, 3] as Phase[]) {
      for (const week of [1, 2, 3, 4, 5]) {
        const runs = runningWeek(phase, week, 0);
        expect(runs.filter((r) => r.type === "interval"), `phase ${phase} week ${week}`).toHaveLength(1);
      }
    }
  });

  it("drops intervals in the deload week for every phase", () => {
    for (const phase of PHASES) {
      const runs = runningWeek(phase, 6, 0);
      expect(runs.some((r) => r.type === "interval")).toBe(false);
    }
  });

  it("keeps phase 2 intervals shorter than the full phase 3 stimulus", () => {
    const p2 = runningWeek(2, 1, 0).find((r) => r.type === "interval")!;
    const p3 = runningWeek(3, 1, 0).find((r) => r.type === "interval")!;
    expect(p2.target_duration_min).toBeLessThan(p3.target_duration_min);
  });

  it("opens phase 3 block A with the 4x4 benchmark", () => {
    const run = runningWeek(3, 1, 0).find((r) => r.type === "interval")!;
    expect(run.target_description).toContain("4 × (4 min hard");
  });

  it("gives each phase 3 block a distinct week-1 session", () => {
    const week1 = [0, 1, 2].map(
      (block) => runningWeek(3, 1, block).find((r) => r.type === "interval")!.target_description
    );
    expect(new Set(week1).size).toBe(3);
  });

  it("labels the variation week as variation, not progression", () => {
    // 6x1.5 is nine minutes of work against 4x4's sixteen — a different stimulus, not
    // a bigger one. Presenting it as a ramp would misrepresent what the week is for.
    const run = runningWeek(3, 3, 0).find((r) => r.type === "interval")!;
    expect(run.target_description).toContain("VARIATION");
    expect(run.target_description).toContain("not a bigger one");
  });

  it("pulls intensity back in week 5 of every phase 3 block", () => {
    for (const block of [0, 1, 2]) {
      const wk4 = runningWeek(3, 4, block).find((r) => r.type === "interval")!;
      const wk5 = runningWeek(3, 5, block).find((r) => r.type === "interval")!;
      expect(wk5.target_duration_min).toBeLessThan(wk4.target_duration_min);
    }
  });

  it("always includes exactly one optional unstructured run", () => {
    for (const phase of PHASES) {
      for (const week of WEEKS) {
        const optional = runningWeek(phase, week, 0).filter((r) => r.optional);
        expect(optional).toHaveLength(1);
        expect(optional[0].type).toBe("unstructured");
      }
    }
  });

  it("shortens runs in the deload week", () => {
    for (const phase of PHASES) {
      const normal = runningWeek(phase, 3, 0).find((r) => r.type === "long")!;
      const deload = runningWeek(phase, 6, 0).find((r) => r.type === "long")!;
      expect(deload.target_duration_min).toBeLessThan(normal.target_duration_min);
    }
  });
});

describe("running phase advancement gate", () => {
  it("advances when at least two-thirds of required runs were completed", () => {
    expect(shouldAdvanceRunningPhase(1, 12, 18).advance).toBe(true);
    expect(shouldAdvanceRunningPhase(1, 18, 18).advance).toBe(true);
  });

  it("holds when the block was mostly missed", () => {
    // Dropping someone into 4x4 intervals off a block they barely ran is how calf and
    // Achilles injuries happen.
    const decision = shouldAdvanceRunningPhase(1, 4, 18);
    expect(decision.advance).toBe(false);
    expect(decision.reason).toContain("4/18");
  });

  it("holds exactly at the boundary below two-thirds", () => {
    expect(shouldAdvanceRunningPhase(2, 11, 18).advance).toBe(false);
    expect(shouldAdvanceRunningPhase(2, 12, 18).advance).toBe(true);
  });

  it("never advances past phase 3 — it is a steady state, not a finish line", () => {
    const decision = shouldAdvanceRunningPhase(3, 18, 18);
    expect(decision.advance).toBe(false);
    expect(decision.reason).toContain("steady state");
  });

  it("holds when no runs were scheduled at all", () => {
    expect(shouldAdvanceRunningPhase(1, 0, 0).advance).toBe(false);
  });
});
