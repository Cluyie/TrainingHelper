import { describe, it, expect } from "vitest";
import { EXERCISES } from "@/lib/seed-data";
import { buildWeek } from "@/lib/week-builder";
import { planWeek, type PlannerSession } from "@/lib/week-planner";
import { runningLoad, strengthLoad, VO2_WINDOW_CEILING } from "@/lib/training-load";
import type { DayOfWeek, Exercise, ExerciseCategory, Phase } from "@/types";

const ALL: Exercise[] = EXERCISES.map((e, i) => ({
  ...e,
  id: `ex-${i}`,
  category: e.category as ExerciseCategory,
  phase_unlock: e.phase_unlock as Phase,
  animation_url: null,
})) as Exercise[];

const WEEKEND: DayOfWeek[] = ["saturday", "sunday"];

function build(opts: Partial<Parameters<typeof buildWeek>[0]> = {}) {
  return buildWeek({
    currentPhase: 3,
    runningPhase: 3,
    weekInBlock: 1,
    blockIndex: 0,
    noGymDays: WEEKEND,
    exercises: ALL,
    ...opts,
  });
}

function circularGap(a: number, b: number) {
  const raw = Math.abs(a - b);
  return Math.min(raw, 7 - raw);
}

describe("week placement", () => {
  it("never schedules a gym session on a no-gym day", () => {
    for (const phase of [1, 2, 3] as Phase[]) {
      const week = build({ runningPhase: phase, currentPhase: phase });
      for (const { template, day } of week.strength) {
        if (template.kind === "gym") {
          expect(WEEKEND, `${template.templateLabel} on ${day}`).not.toContain(day);
        }
      }
    }
  });

  it("still allows home sessions and runs at the weekend", () => {
    const week = build();
    const weekendSessions = week.plan.days
      .filter((d) => WEEKEND.includes(d.day))
      .flatMap((d) => d.sessions);
    expect(weekendSessions.length).toBeGreaterThan(0);
  });

  it("leaves exactly one full rest day", () => {
    for (const phase of [1, 2, 3] as Phase[]) {
      const week = build({ runningPhase: phase, currentPhase: phase });
      const empty = week.plan.days.filter((d) => d.sessions.length === 0);
      expect(empty, `phase ${phase}`).toHaveLength(1);
      expect(empty[0].day).toBe(week.plan.restDay);
    }
  });

  it("keeps the rest day even when the week is over-constrained", () => {
    // The rest day is a hard constraint: the fallback ladder drops the optional run,
    // then allows another double, then cuts a gym day — but never the rest day.
    //
    // A degraded week has fewer sessions to place, so it can end up with MORE free
    // days than one. The guarantee is a floor, not a cap — the designated rest day is
    // always genuinely empty.
    const week = build({ noGymDays: ["wednesday", "thursday", "friday", "saturday", "sunday"] });
    const empty = week.plan.days.filter((d) => d.sessions.length === 0);
    expect(empty.length).toBeGreaterThanOrEqual(1);
    expect(empty.map((d) => d.day)).toContain(week.plan.restDay);
  });

  it("spreads the gym sessions instead of stacking them", () => {
    // A soft preference, not a hard constraint — but with three gym days confined to
    // Mon-Fri there is always a layout that avoids back-to-back gym days, so the
    // planner should find it.
    for (const phase of [1, 2, 3] as Phase[]) {
      const week = build({ runningPhase: phase, currentPhase: phase });
      const gymDays = week.plan.days
        .map((d, i) => (d.sessions.some((s) => s.kind === "gym") ? i : -1))
        .filter((i) => i >= 0);

      for (const i of gymDays) {
        expect(gymDays, `phase ${phase}: gym on consecutive days`).not.toContain((i + 1) % 7);
      }
    }
  });

  it("uses home sessions as buffers between gym days", () => {
    const week = build();
    const kindsOn = (i: number) => week.plan.days[i].sessions.map((s) => s.kind);
    const gymIdx = week.plan.days
      .map((d, i) => (d.sessions.some((s) => s.kind === "gym") ? i : -1))
      .filter((i) => i >= 0);

    // Every gap between two gym days should hold something lighter, not be idle time
    // the planner failed to use.
    for (const i of gymIdx) {
      const next = (i + 2) % 7;
      if (gymIdx.includes(next)) {
        const between = (i + 1) % 7;
        expect(kindsOn(between).length, "gap between gym days is empty").toBeGreaterThan(0);
      }
    }
  });

  it("does not create a double while a day is still free", () => {
    for (const phase of [1, 2, 3] as Phase[]) {
      const week = build({ runningPhase: phase, currentPhase: phase });
      const free = week.plan.days.filter(
        (d) => d.sessions.length === 0 && d.day !== week.plan.restDay
      ).length;
      const doubles = week.plan.days.filter((d) => d.sessions.length === 2).length;
      if (free > 0) expect(doubles, `phase ${phase}`).toBe(0);
    }
  });

  it("reports what it gave up when it has to relax", () => {
    const week = build({ noGymDays: ["wednesday", "thursday", "friday", "saturday", "sunday"] });
    expect(week.plan.relaxations.length).toBeGreaterThan(0);
  });

  it("places all five strength sessions in a normal week", () => {
    const week = build();
    expect(week.strength).toHaveLength(5);
    expect(week.strength.filter((s) => s.template.kind === "gym")).toHaveLength(3);
    expect(week.strength.filter((s) => s.template.kind === "home")).toHaveLength(2);
  });
});

describe("VO2 separation", () => {
  it("keeps the VO2 adjacent window under the load ceiling", () => {
    for (const blockIndex of [0, 1, 2]) {
      const week = build({ blockIndex });
      const grid = week.plan.days.map((d) => d.sessions);
      const vo2Idx = grid.findIndex((s) => s.some((x) => x.runType === "interval"));
      expect(vo2Idx).toBeGreaterThanOrEqual(0);

      const before = (vo2Idx + 6) % 7;
      const after = (vo2Idx + 1) % 7;
      const windowLoad = [before, vo2Idx, after]
        .flatMap((i) => grid[i])
        .filter((s) => s.runType !== "interval")
        .reduce((sum, s) => sum + s.load.lowerBody + s.load.neuromuscular, 0);

      expect(windowLoad, `block ${blockIndex}`).toBeLessThanOrEqual(VO2_WINDOW_CEILING);
    }
  });

  it("keeps VO2 clear of the heavy lower-body session across the week boundary", () => {
    const week = build();
    const grid = week.plan.days.map((d) => d.sessions);
    const vo2Idx = grid.findIndex((s) => s.some((x) => x.runType === "interval"));
    const heavyIdx = grid.findIndex((s) => s.some((x) => x.load.lowerBody >= 3));

    if (heavyIdx >= 0) {
      // Sunday and Monday are adjacent — the gap must be measured circularly.
      expect(circularGap(vo2Idx, heavyIdx)).toBeGreaterThanOrEqual(2);
    }
  });

  it("rejects a week where any high-lower-body session sits beside VO2, not just Gym B", () => {
    // The rule is scored on actual load, so Gym C or Home B next to intervals is
    // rejected too — a Gym-B-only rule would have missed those entirely.
    const vo2: PlannerSession = {
      id: "vo2",
      kind: "run",
      label: "VO2",
      runType: "interval",
      load: runningLoad({ type: "interval", durationMin: 40 }),
    };
    const heavyish = (id: string): PlannerSession => ({
      id,
      kind: "gym",
      label: id,
      load: strengthLoad({
        label: id,
        isHome: false,
        items: [
          { category: "squat", sets: 4, repsMax: 10, equipment: ["dumbbell"] },
          { category: "hinge", sets: 4, repsMax: 10, equipment: ["dumbbell"] },
        ],
      }),
    });

    const plan = planWeek({
      strength: [heavyish("a"), heavyish("b"), heavyish("c")],
      runs: [vo2],
      noGymDays: [],
    });

    const grid = plan.days.map((d) => d.sessions);
    const vo2Idx = grid.findIndex((s) => s.some((x) => x.runType === "interval"));
    const windowLoad = [(vo2Idx + 6) % 7, vo2Idx, (vo2Idx + 1) % 7]
      .flatMap((i) => grid[i])
      .filter((s) => s.runType !== "interval")
      .reduce((sum, s) => sum + s.load.lowerBody + s.load.neuromuscular, 0);

    expect(windowLoad).toBeLessThanOrEqual(VO2_WINDOW_CEILING);
  });

  it("has no VO2 to place in phase 1", () => {
    const week = build({ runningPhase: 1 });
    expect(week.runs.some((r) => r.run.type === "interval")).toBe(false);
  });
});

describe("doubles", () => {
  it("never pairs VO2 with another session", () => {
    for (const blockIndex of [0, 1, 2]) {
      for (const day of build({ blockIndex }).plan.days) {
        if (day.sessions.some((s) => s.runType === "interval")) {
          expect(day.sessions, `${day.day}`).toHaveLength(1);
        }
      }
    }
  });

  it("never pairs the heavy lower-body session with anything", () => {
    for (const day of build().plan.days) {
      if (day.sessions.some((s) => s.load.lowerBody >= 3)) {
        expect(day.sessions, `${day.day}`).toHaveLength(1);
      }
    }
  });

  it("keeps any double under the combined neuromuscular limit", () => {
    for (const day of build().plan.days) {
      if (day.sessions.length === 2) {
        const total = day.sessions[0].load.neuromuscular + day.sessions[1].load.neuromuscular;
        expect(total, `${day.day}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("never puts three sessions on one day", () => {
    for (const day of build().plan.days) {
      expect(day.sessions.length).toBeLessThanOrEqual(2);
    }
  });

  it("drops the optional run rather than forcing a bad double", () => {
    // In phase 3 the week is 3 gym + 2 home + 3 required runs over six usable days.
    // The optional run only lands if a slot genuinely remains.
    const week = build();
    const placed = week.runs.map((r) => r.run);
    const optionalPlaced = placed.filter((r) => r.optional).length;
    const totalSessions = week.plan.days.reduce((s, d) => s + d.sessions.length, 0);
    expect(totalSessions).toBe(week.strength.length + placed.length);
    expect(optionalPlaced).toBeLessThanOrEqual(1);
  });
});

describe("determinism", () => {
  it("produces the same week for the same input", () => {
    const a = build();
    const b = build();
    const shape = (w: typeof a) =>
      w.plan.days.map((d) => `${d.day}:${d.sessions.map((s) => s.id).sort().join(",")}`).join("|");
    expect(shape(a)).toBe(shape(b));
  });
});

describe("weekly load", () => {
  it("grows across the phases as running intensity is added", () => {
    const cost = (p: Phase) => build({ runningPhase: p, currentPhase: p }).plan.weekly.recoveryCost;
    expect(cost(1)).toBeLessThan(cost(3));
  });

  it("counts every placed session in the weekly totals", () => {
    const week = build();
    const placed = week.plan.days.reduce((s, d) => s + d.sessions.length, 0);
    expect(week.plan.weekly.sessions).toBe(placed);
  });
});
