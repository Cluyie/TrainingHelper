import { describe, it, expect } from "vitest";
import { EXERCISES } from "@/lib/seed-data";
import {
  PROGRAM,
  HARD_RUN_DAY,
  isHeavyLowerDay,
  MissingExercisesError,
  programExerciseNames,
  resolveProgram,
  scheduledExercise,
  slotFor,
  swapPool,
  targetRir,
  prescriptionFor,
  rotationIndex,
  multiDayExercises,
  restSeconds,
  type ProgramDay,
  type ProgramSlot,
} from "@/lib/program-generator";
import { deloadSets, deloadWeight } from "@/lib/deload";
import type { Exercise, ExerciseCategory, Phase } from "@/types";

// The seed library with synthetic ids, standing in for the exercises table.
const ALL: Exercise[] = EXERCISES.map((e, i) => ({
  ...e,
  id: `ex-${i}`,
  category: e.category as ExerciseCategory,
  phase_unlock: e.phase_unlock as Phase,
  animation_url: null,
})) as Exercise[];

const byName = new Map(ALL.map((e) => [e.name, e]));
const day = (d: string) => PROGRAM.find((p) => p.day === d)!;
const names = (d: ProgramDay) => d.slots.map((s) => s.exercise);
const allSlots = PROGRAM.flatMap((d) => d.slots);

// Every name any slot can resolve to (default, rotation picks, ladder rungs).
function slotNames(s: ProgramSlot): string[] {
  return [s.exercise, ...(s.rotation ?? []), ...(s.ladder?.map((r) => r.exercise) ?? [])];
}

describe("the week (criteria 1-4, new running frame)", () => {
  it("has exactly five strength days, Tuesday to Saturday — Monday is the hard run", () => {
    expect(PROGRAM.map((d) => d.day)).toEqual([
      "tuesday", "wednesday", "thursday", "friday", "saturday",
    ]);
    expect(HARD_RUN_DAY).toBe("monday");
  });

  it("matches the specified sessions exactly", () => {
    expect(names(day("tuesday"))).toEqual([
      "Medicine Ball Rotational Throw", "Smith Bench Press", "Landmine Press",
      "Seated Cable Row", "Half-Kneeling Cable Pulldown", "Cable Lateral Raise",
      "Cable Face Pull", "Cable External Rotation", "Cable Crunch",
    ]);
    expect(names(day("wednesday"))).toEqual([
      "Countermovement Jump", "Trap Bar Deadlift", "Smith Squat", "Lat Pulldown",
      "Smith Bulgarian Split Squat", "Trap Bar Farmer Carry", "Smith Calf Raise",
    ]);
    expect(names(day("thursday"))).toEqual([
      "Medicine Ball Chest Pass", "Smith Incline Bench Press", "Chest Supported Row",
      "Lat Pulldown", "Half-Kneeling Single-Arm Landmine Press", "Cable Lateral Raise",
      "Cable Face Pull", "Cable External Rotation", "Cable Crunch",
    ]);
    expect(names(day("friday"))).toEqual([
      "Broad Jump", "Barbell Romanian Deadlift", "Step Up", "Nordic Hamstring Curl",
      "Cable Chest Press", "Half-Kneeling Cable Chop", "Smith Calf Raise",
    ]);
    expect(names(day("saturday"))).toEqual([
      "Push-Up", "Inverted Row", "Dead Hang", "Single-Leg Romanian Deadlift",
      "Suitcase Carry", "Pallof Press",
    ]);
  });

  it("uses the specified sets and rep ranges", () => {
    const rx = (d: string) => day(d).slots.map((s) => `${s.sets}x${s.repsMin}-${s.repsMax}`);
    expect(rx("tuesday")).toEqual(["3x4-4", "3x5-8", "3x5-8", "3x8-12", "2x8-12", "2x12-20", "2x12-20", "2x12-15", "3x8-15"]);
    expect(rx("wednesday")).toEqual(["3x3-3", "3x3-5", "3x5-8", "3x6-10", "2x8-10", "2x20-30", "2x8-12"]);
    expect(rx("thursday")).toEqual(["3x4-4", "3x8-12", "3x8-12", "2x6-10", "2x8-12", "2x12-20", "2x12-20", "2x12-15", "2x10-15"]);
    expect(rx("friday")).toEqual(["3x3-3", "3x6-10", "2x8-12", "2x3-6", "2x8-12", "2x10-12", "2x10-15"]);
    expect(rx("saturday")).toEqual(["3x8-15", "3x8-12", "2x20-45", "2x6-8", "2x20-30", "2x10-10"]);
  });

  it("puts Zone 2 after strength on Thursday and Saturday only", () => {
    expect(PROGRAM.filter((d) => d.zone2After).map((d) => d.day)).toEqual(["thursday", "saturday"]);
  });

  it("keeps heavy legs away from the hard run: never the day before or after Monday", () => {
    // Sunday is rest and Tuesday is upper body, so the hard run has legs-free neighbours.
    for (const d of PROGRAM) {
      const heavyLegs = d.slots.some((s) => s.role === "heavy" && ["Trap Bar Deadlift", "Smith Squat", "Barbell Romanian Deadlift"].includes(s.exercise));
      if (d.day === "tuesday") expect(heavyLegs).toBe(false);
    }
    expect(isHeavyLowerDay("wednesday")).toBe(true);
    expect(isHeavyLowerDay("friday")).toBe(true);
    expect(isHeavyLowerDay("tuesday")).toBe(false);
  });

  it("keeps Saturday the lowest-fatigue day: no heavy lifts, no power, fewest sets", () => {
    const sat = day("saturday");
    expect(sat.slots.some((s) => s.role === "heavy" || s.role === "power")).toBe(false);
    const setsPerDay = PROGRAM.map((d) => d.slots.reduce((n, s) => n + s.sets, 0));
    expect(Math.min(...setsPerDay)).toBe(setsPerDay[4]);
  });

  it("keeps Saturday from repeating Friday — they are back-to-back", () => {
    const fri = new Set(names(day("friday")));
    expect(names(day("saturday")).filter((n) => fri.has(n))).toEqual([]);
  });

  it("does no leg training on Saturday, two days before the hard run", () => {
    // The single-leg RDL is a bodyweight balance drill; nothing else loads the legs.
    const legWork = ["Smith Hip Thrust", "Cable Leg Curl", "Smith Calf Raise", "Nordic Hamstring Curl"];
    expect(names(day("saturday")).some((n) => legWork.includes(n))).toBe(false);
    const sat = day("saturday").slots;
    expect(sat.find((s) => s.exercise === "Single-Leg Romanian Deadlift")?.incrementKg).toBe(0);
  });

  it("logs the dead hang in seconds", () => {
    expect(day("saturday").slots.find((s) => s.exercise === "Dead Hang")?.unit).toBe("seconds");
  });

  it("contains no strength on Monday or Sunday", () => {
    expect(PROGRAM.some((d) => d.day === "monday" || d.day === "sunday")).toBe(false);
  });

  it("gives every day a concrete warm-up and a ramp-up on a real slot", () => {
    for (const d of PROGRAM) {
      expect(d.warmup.length, d.day).toBeGreaterThanOrEqual(5);
      expect(d.slots[d.rampUp.slot], d.day).toBeDefined();
      expect(d.slots[d.rampUp.slot].role, d.day).not.toBe("power");
    }
  });
});

describe("session order (criterion 7)", () => {
  it("puts power first and heavy lifts before accessory work", () => {
    const rank = { power: 0, heavy: 1, compound: 2, accessory: 2, core: 2, carry: 2 } as const;
    for (const d of PROGRAM) {
      const ranks = d.slots.map((s) => rank[s.role]);
      expect([...ranks].sort((a, b) => a - b), d.day).toEqual(ranks);
      if (d.slots.some((s) => s.role === "power")) expect(d.slots[0].role, d.day).toBe("power");
    }
  });
});

describe("block progression (criteria 5, 6, 8, 9)", () => {
  it("lowers the RIR target across weeks 1-5 and deloads in week 6", () => {
    const mins = [1, 2, 3, 4, 5].map((w) => targetRir("compound", w)!.min);
    expect(mins).toEqual([3, 2, 2, 1, 1]);
    expect(targetRir("heavy", 6)).toMatchObject({ min: 4 });
  });

  it("never prescribes 0 RIR — nothing goes to failure", () => {
    for (let w = 1; w <= 6; w++) {
      for (const role of ["heavy", "compound", "accessory", "core", "carry"] as const) {
        expect(targetRir(role, w)!.min).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("gives power no RIR at all — it is judged on speed, not closeness to failure", () => {
    for (let w = 1; w <= 6; w++) expect(targetRir("power", w)).toBeNull();
  });

  it("cuts roughly 40-50% of the week's sets in the deload", () => {
    const normal = allSlots.reduce((n, s) => n + s.sets, 0);
    const deload = allSlots.reduce((n, s) => n + prescriptionFor(s, 6).sets, 0);
    const cut = 1 - deload / normal;
    expect(cut).toBeGreaterThanOrEqual(0.38);
    expect(cut).toBeLessThanOrEqual(0.5);
  });

  it("lightens deload loads by 10-15%, rounded to the increment", () => {
    expect(deloadWeight(100, 5)).toBe(90); // 87.5 → nearest 5
    expect(deloadWeight(100, 2.5)).toBe(87.5);
    expect(deloadSets(3)).toBe(2);
    expect(deloadSets(2)).toBe(1);
  });

  it("rests longest on heavy lifts and never shortens rest below 90s", () => {
    expect(restSeconds("heavy")).toBeGreaterThanOrEqual(150);
    for (const s of allSlots) expect(restSeconds(s.role)).toBeGreaterThanOrEqual(90);
  });
});

describe("medicine-ball rotation and pull ladder (criterion 10: deterministic)", () => {
  const tue = day("tuesday").slots[0];
  const thu = day("thursday").slots[0];

  it("follows the 3-week rotation and repeats it", () => {
    const pick = (s: ProgramSlot, w: number) => scheduledExercise(s, w).exercise;
    expect([1, 2, 3, 4, 5, 6].map((w) => pick(tue, w))).toEqual([
      "Medicine Ball Rotational Throw", "Medicine Ball Slam", "Medicine Ball Rotational Throw",
      "Medicine Ball Rotational Throw", "Medicine Ball Slam", "Medicine Ball Rotational Throw",
    ]);
    expect([1, 2, 3].map((w) => pick(thu, w))).toEqual([
      "Medicine Ball Chest Pass", "Medicine Ball Chest Pass", "Medicine Ball Slam",
    ]);
    expect(rotationIndex(4)).toBe(0);
  });

  it("only treats the rotational throw as per side", () => {
    expect(scheduledExercise(tue, 1).perSide).toBe(true);
    expect(scheduledExercise(tue, 2).perSide).toBe(false);
  });

  it("walks the pull ladder by what was logged last", () => {
    const pull = day("wednesday").slots[3];
    expect(scheduledExercise(pull, 1, null)).toMatchObject({ exercise: "Lat Pulldown", nextRung: "Pull-Up" });
    expect(scheduledExercise(pull, 1, "Pull-Up")).toMatchObject({
      exercise: "Pull-Up", incrementKg: 0, nextRung: "Weighted Pull-Up",
    });
    expect(scheduledExercise(pull, 1, "Weighted Pull-Up").nextRung).toBeNull();
  });

  it("returns the same answer for the same input", () => {
    for (const s of allSlots) {
      expect(scheduledExercise(s, 3, null)).toEqual(scheduledExercise(s, 3, null));
    }
  });
});

describe("specific exercises (criteria 11-14, 17-20)", () => {
  const every = allSlots.flatMap(slotNames);

  it.each([
    ["Chest Supported Row"], ["Landmine Press"], ["Nordic Hamstring Curl"],
    ["Push-Up"], ["Inverted Row"], ["Dead Hang"], ["Single-Leg Romanian Deadlift"], ["Pallof Press"],
    ["Countermovement Jump"], ["Broad Jump"],
    ["Trap Bar Farmer Carry"], ["Suitcase Carry"],
    ["Medicine Ball Rotational Throw"], ["Medicine Ball Chest Pass"], ["Medicine Ball Slam"],
    ["Smith Bulgarian Split Squat"], ["Step Up"],
  ])("includes %s", (n) => {
    expect(every).toContain(n);
  });

  it("needs no dumbbell or kettlebell anywhere", () => {
    for (const n of programExerciseNames()) {
      const ex = byName.get(n);
      expect(ex, `${n} missing from seed`).toBeDefined();
      expect(ex!.equipment, n).not.toContain("dumbbell");
      expect(ex!.equipment, n).not.toContain("kettlebell");
      expect(ex!.equipment, n).not.toContain("machine");
    }
  });

  it("adds no kettlebell swing, back extension or direct arm isolation", () => {
    expect(every).not.toContain("Kettlebell Swing");
    expect(every.some((n) => /curl/i.test(n) && n !== "Nordic Hamstring Curl")).toBe(false);
    expect(every.some((n) => /extension/i.test(n))).toBe(false);
  });
});

describe("function checklist (section 19)", () => {
  // Every function the spec lists, mapped to the exercise that covers it.
  const coverage: Record<string, string> = {
    "squat": "Smith Squat",
    "hinge": "Trap Bar Deadlift",
    "unilateral knee dominant": "Smith Bulgarian Split Squat",
    "unilateral hip dominant": "Step Up",
    "knee flexion": "Nordic Hamstring Curl",
    "calf/ankle": "Smith Calf Raise",
    "horizontal push": "Smith Bench Press",
    "incline push": "Smith Incline Bench Press",
    "vertical push": "Landmine Press",
    "diagonal / unilateral push": "Half-Kneeling Single-Arm Landmine Press",
    "rotator cuff": "Cable External Rotation",
    "vertical pull": "Lat Pulldown",
    "horizontal pull": "Seated Cable Row",
    "unilateral pull": "Half-Kneeling Cable Pulldown",
    "lateral delt": "Cable Lateral Raise",
    "posterior delt / scapula": "Cable Face Pull",
    "loaded flexion": "Cable Crunch",
    "rotation": "Half-Kneeling Cable Chop",
    "bilateral carry": "Trap Bar Farmer Carry",
    "unilateral carry / anti-lateral flexion": "Suitcase Carry",
    "vertical power": "Countermovement Jump",
    "horizontal power": "Broad Jump",
    "upper-body horizontal power": "Medicine Ball Chest Pass",
    "rotational power": "Medicine Ball Rotational Throw",
  };

  it.each(Object.entries(coverage))("covers %s", (_fn, exercise) => {
    expect(allSlots.flatMap(slotNames)).toContain(exercise);
  });

  it("gives every slot a stated purpose", () => {
    for (const s of allSlots) expect(s.purpose.length, s.exercise).toBeGreaterThan(10);
  });
});

describe("resolving against the catalogue", () => {
  it("resolves every slot from the seed library", () => {
    const t = resolveProgram(PROGRAM, ALL);
    expect(t.map((x) => x.exercises.length)).toEqual(PROGRAM.map((d) => d.slots.length));
    expect(t.every((x) => !x.isHomeWorkout)).toBe(true);
  });

  it("refuses to build a program with a missing exercise rather than dropping the slot", () => {
    const without = ALL.filter((e) => e.name !== "Nordic Hamstring Curl");
    expect(() => resolveProgram(PROGRAM, without)).toThrow(MissingExercisesError);
  });

  it("matches stored rows to slots only when the exercise fits the slot", () => {
    expect(slotFor("wednesday", 1, "Trap Bar Deadlift")?.role).toBe("heavy");
    expect(slotFor("wednesday", 3, "Pull-Up")).not.toBeNull(); // ladder rung
    expect(slotFor("tuesday", 0, "Medicine Ball Slam")).not.toBeNull(); // rotation pick
    expect(slotFor("wednesday", 1, "Goblet Squat")).toBeNull(); // stale pre-rework row
    expect(slotFor("monday", 1, "Trap Bar Deadlift")).toBeNull(); // old day, program moved
  });

  it("reads history per day for lifts that appear on several days", () => {
    const multi = multiDayExercises();
    expect(multi.has("Smith Calf Raise")).toBe(true);
    expect(multi.has("Cable Crunch")).toBe(true);
    expect(multi.has("Trap Bar Deadlift")).toBe(false);
  });

  it("offers swaps only from available equipment", () => {
    const pool = swapPool(ALL).map((e) => e.name);
    expect(pool).toContain("Smith Squat");
    expect(pool).not.toContain("Goblet Squat"); // dumbbell
    expect(pool).not.toContain("Kettlebell Swing");
    expect(pool).not.toContain("Machine Row");
  });
});
