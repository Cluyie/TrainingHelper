import { describe, it, expect } from "vitest";
import { EXERCISES } from "@/lib/seed-data";
import {
  getStrengthTemplates,
  resolveExercisesForTemplates,
  gymPool,
  homePool,
} from "@/lib/program-generator";
import { isLoaded, strengthLoad } from "@/lib/training-load";
import type { Exercise, ExerciseCategory, Phase } from "@/types";

// The seed library with synthetic ids, standing in for the exercises table.
const ALL: Exercise[] = EXERCISES.map((e, i) => ({
  ...e,
  id: `ex-${i}`,
  category: e.category as ExerciseCategory,
  phase_unlock: e.phase_unlock as Phase,
  animation_url: null,
})) as Exercise[];

const PHASES: Phase[] = [1, 2, 3];

function resolve(phase: Phase) {
  return resolveExercisesForTemplates(getStrengthTemplates(), ALL, phase);
}

describe("exercise pools", () => {
  it("keeps bodyweight-only exercises out of the gym pool", () => {
    // The home-first rule: there is no reason to travel to a gym to do push-ups.
    const pool = gymPool(ALL, 3);
    for (const ex of pool) {
      expect(isLoaded(ex.equipment), `${ex.name} is not loaded`).toBe(true);
    }
    const names = pool.map((e) => e.name);
    expect(names).not.toContain("Push-Up");
    expect(names).not.toContain("Plank");
    expect(names).not.toContain("Box Jump");
    expect(names).not.toContain("Inverted Row");
  });

  it("treats an ab wheel as home equipment, not gym equipment", () => {
    expect(gymPool(ALL, 3).map((e) => e.name)).not.toContain("Ab Wheel Rollout");
  });

  it("keeps loaded exercises out of the home pool", () => {
    // Home is a table, an ab wheel and bodyweight — there are no dumbbells.
    for (const ex of homePool(ALL, 3)) {
      const loadedButNotBodyweightDoable =
        isLoaded(ex.equipment) && !ex.equipment.includes("bodyweight") && !ex.equipment.includes("ab_wheel");
      expect(loadedButNotBodyweightDoable, `${ex.name} needs equipment not available at home`).toBe(false);
    }
  });

  it("phase-gates the home pool as well as the gym pool", () => {
    // Home has no load to add, so the phase ladder is the ONLY progression mechanism
    // there. Missing this filter meant home days could never get harder.
    const p1 = homePool(ALL, 1).map((e) => e.name);
    expect(p1).not.toContain("Nordic Hamstring Curl"); // phase 3
    expect(p1).not.toContain("Feet-Elevated Push-Up"); // phase 2
    expect(homePool(ALL, 3).map((e) => e.name)).toContain("Nordic Hamstring Curl");
  });
});

describe("generated sessions", () => {
  it("never puts an unloaded exercise in a gym session, at any phase", () => {
    for (const phase of PHASES) {
      for (const t of resolve(phase).filter((t) => t.kind === "gym")) {
        for (const e of t.exercises) {
          expect(isLoaded(e.exercise.equipment), `${e.exercise.name} in ${t.templateLabel} @P${phase}`).toBe(true);
        }
      }
    }
  });

  it("never puts a gym-only exercise in a home session, at any phase", () => {
    for (const phase of PHASES) {
      for (const t of resolve(phase).filter((t) => t.kind === "home")) {
        for (const e of t.exercises) {
          expect(e.exercise.home_compatible, `${e.exercise.name} in ${t.templateLabel} @P${phase}`).toBe(true);
        }
      }
    }
  });

  it("fills every slot in every template", () => {
    for (const phase of PHASES) {
      const templates = getStrengthTemplates();
      resolve(phase).forEach((t, i) => {
        expect(t.exercises.length, `${t.templateLabel} @P${phase}`).toBe(templates[i].slots.length);
      });
    }
  });

  it("produces five sessions — three gym, two home", () => {
    const t = resolve(1);
    expect(t.filter((x) => x.kind === "gym")).toHaveLength(3);
    expect(t.filter((x) => x.kind === "home")).toHaveLength(2);
  });
});

describe("phases actually change the program", () => {
  it("gives every phase a distinct set of exercises", () => {
    // Phase 3 previously changed nothing at all: its only exercise was Barbell Back
    // Squat, and no slot could ever select it.
    const sets = PHASES.map((p) =>
      resolve(p)
        .flatMap((t) => t.exercises.map((e) => e.exercise.name))
        .sort()
        .join("|")
    );
    expect(new Set(sets).size).toBe(3);
  });

  it("changes at least one exercise on every session between phase 1 and 3", () => {
    const p1 = resolve(1);
    const p3 = resolve(3);
    p1.forEach((t, i) => {
      const a = t.exercises.map((e) => e.exercise.name);
      const b = p3[i].exercises.map((e) => e.exercise.name);
      expect(a.join("|"), `${t.templateLabel} is identical at P1 and P3`).not.toBe(b.join("|"));
    });
  });

  it("makes the previously unreachable exercises reachable", () => {
    const p3 = resolve(3).flatMap((t) => t.exercises.map((e) => e.exercise.name));
    expect(p3).toContain("Barbell Back Squat");
    expect(p3).toContain("Barbell Bench Press");
    expect(p3).toContain("Barbell Overhead Press");
    expect(p3).toContain("Weighted Pull-Up");

    const p2 = resolve(2).flatMap((t) => t.exercises.map((e) => e.exercise.name));
    expect(p2).toContain("Safety Bar Squat");
    expect(p2).toContain("Barbell Hip Thrust");
  });

  it("can select a plain Pull-Up at the gym", () => {
    // A pull-up is bodyweight but needs a bar, so tagging it ["bodyweight"] alone
    // silently excluded it from the gym pool and Gym C fell back to Assisted Pull-Up
    // even at phase 3.
    expect(gymPool(ALL, 3).map((e) => e.name)).toContain("Pull-Up");
    expect(resolve(3).flatMap((t) => t.exercises.map((e) => e.exercise.name))).toContain("Pull-Up");
  });

  it("still keeps pull-ups out of home sessions", () => {
    // Home has a table for inverted rows, not a bar.
    for (const phase of PHASES) {
      const home = resolve(phase)
        .filter((t) => t.kind === "home")
        .flatMap((t) => t.exercises.map((e) => e.exercise.name));
      expect(home, `phase ${phase}`).not.toContain("Pull-Up");
    }
  });

  it("progresses home sessions purely by leverage", () => {
    const home = (p: Phase) =>
      resolve(p).filter((t) => t.kind === "home").flatMap((t) => t.exercises.map((e) => e.exercise.name));
    expect(home(1)).toContain("Push-Up");
    expect(home(2)).toContain("Feet-Elevated Push-Up");
    expect(home(3)).toContain("Deficit Push-Up");
    expect(home(3)).toContain("Nordic Hamstring Curl");
  });
});

describe("cable preference", () => {
  it("chooses the cable option when candidates are otherwise equivalent", () => {
    // Two horizontal rows are equally good for the slot; the cable one should win.
    const candidates = ALL.filter(
      (e) => e.name === "Dumbbell Single Arm Row" || e.name === "Single Arm Cable Row"
    );
    const templates = [
      {
        label: "test",
        focus: "test",
        kind: "gym" as const,
        slots: [
          {
            category: "pull" as ExerciseCategory,
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            progression_increment_kg: 2.5,
          },
        ],
      },
    ];
    const [result] = resolveExercisesForTemplates(templates, candidates, 3);
    expect(result.exercises[0].exercise.name).toBe("Single Arm Cable Row");
  });

  it("uses cables for the gym's rows, chops, crunches and face pulls", () => {
    const gym = resolve(1).filter((t) => t.kind === "gym").flatMap((t) => t.exercises.map((e) => e.exercise));
    for (const name of ["Seated Cable Row", "Cable Face Pull", "Cable Crunch", "Half-Kneeling Cable Chop"]) {
      expect(gym.map((e) => e.name)).toContain(name);
    }
  });

  it("still uses free weights where they are clearly better", () => {
    // The rule is "best exercise first, cable as the tiebreak" — not "cable always".
    const gym = resolve(1).filter((t) => t.kind === "gym").flatMap((t) => t.exercises.map((e) => e.exercise.name));
    expect(gym).toContain("Trap Bar Deadlift");
    expect(gym).toContain("Dumbbell Romanian Deadlift");
    expect(gym).toContain("Farmer's Walk");
  });
});

describe("volume and duration targets", () => {
  it("lands the week around 70-85 working sets, well down from 112", () => {
    const total = resolve(1).reduce(
      (sum, t) => sum + t.exercises.reduce((s, e) => s + e.target_sets, 0),
      0
    );
    expect(total).toBeGreaterThanOrEqual(70);
    expect(total).toBeLessThanOrEqual(85);
  });

  it("keeps gym sessions at 16-20 sets and home sessions at 10-14", () => {
    for (const t of resolve(1)) {
      const sets = t.exercises.reduce((s, e) => s + e.target_sets, 0);
      if (t.kind === "gym") {
        expect(sets, t.templateLabel).toBeGreaterThanOrEqual(16);
        expect(sets, t.templateLabel).toBeLessThanOrEqual(20);
      } else {
        expect(sets, t.templateLabel).toBeGreaterThanOrEqual(10);
        expect(sets, t.templateLabel).toBeLessThanOrEqual(14);
      }
    }
  });

  it("keeps gym sessions to 50-65 min and home sessions to 25-40 min", () => {
    for (const t of resolve(1)) {
      const load = strengthLoad({
        label: t.templateLabel,
        isHome: t.isHomeWorkout,
        items: t.exercises.map((e) => ({
          category: e.exercise.category,
          sets: e.target_sets,
          repsMax: e.target_reps_max,
          equipment: e.exercise.equipment,
          muscleGroups: e.exercise.muscle_groups,
        })),
      });
      if (t.kind === "gym") {
        expect(load.durationMin, t.templateLabel).toBeGreaterThanOrEqual(50);
        expect(load.durationMin, t.templateLabel).toBeLessThanOrEqual(65);
      } else {
        expect(load.durationMin, t.templateLabel).toBeGreaterThanOrEqual(25);
        expect(load.durationMin, t.templateLabel).toBeLessThanOrEqual(40);
      }
    }
  });

  it("makes home sessions genuinely cheaper than gym sessions", () => {
    const cost = (kind: "gym" | "home") =>
      resolve(1)
        .filter((t) => t.kind === kind)
        .map((t) =>
          strengthLoad({
            label: t.templateLabel,
            isHome: kind === "home",
            items: t.exercises.map((e) => ({
              category: e.exercise.category,
              sets: e.target_sets,
              repsMax: e.target_reps_max,
              equipment: e.exercise.equipment,
              muscleGroups: e.exercise.muscle_groups,
            })),
          }).recoveryCost
        );
    expect(Math.max(...cost("home"))).toBeLessThan(Math.min(...cost("gym")));
  });
});

describe("movement pattern coverage", () => {
  it("covers every required pattern across the week", () => {
    const categories = new Set(
      resolve(1).flatMap((t) => t.exercises.map((e) => e.exercise.category))
    );
    for (const c of ["squat", "hinge", "push", "pull", "carry", "core", "power", "calf", "shoulder_health"]) {
      expect(categories.has(c as ExerciseCategory), `missing ${c}`).toBe(true);
    }
  });

  it("gives vertical pull a real share of the week", () => {
    // Vertical pull needs a bar or pulldown station and cannot be trained at home, so
    // it gets a slot on two of the three gym days rather than just one.
    const vertical = ["Lat Pulldown", "Half-Kneeling Cable Pulldown", "Pull-Up", "Assisted Pull-Up", "Weighted Pull-Up"];
    const sets = resolve(1)
      .flatMap((t) => t.exercises)
      .filter((e) => vertical.includes(e.exercise.name))
      .reduce((s, e) => s + e.target_sets, 0);
    expect(sets).toBeGreaterThanOrEqual(6);
  });

  it("balances pushing and pulling across the week", () => {
    const byCat = (cat: string) =>
      resolve(1)
        .flatMap((t) => t.exercises)
        .filter((e) => e.exercise.category === cat)
        .reduce((s, e) => s + e.target_sets, 0);
    // A slight pull bias is deliberate for shoulder health and desk posture.
    expect(byCat("pull")).toBeGreaterThanOrEqual(byCat("push"));
  });

  it("gives every gym session both a push and a pull", () => {
    // Gym C used to program pressing with no pulling at all.
    for (const t of resolve(1).filter((t) => t.kind === "gym")) {
      const cats = t.exercises.map((e) => e.exercise.category);
      expect(cats, `${t.templateLabel} has no push`).toContain("push");
      expect(cats, `${t.templateLabel} has no pull`).toContain("pull");
    }
  });

  it("keeps power in the program but low-volume", () => {
    for (const t of resolve(1)) {
      const power = t.exercises.filter((e) => e.exercise.category === "power");
      expect(power.length, `${t.templateLabel} has no power work`).toBe(1);
      expect(power[0].target_sets).toBeLessThanOrEqual(2);
    }
  });

  it("uses a different power movement on each gym day", () => {
    const names = resolve(1)
      .filter((t) => t.kind === "gym")
      .map((t) => t.exercises.find((e) => e.exercise.category === "power")!.exercise.name);
    expect(new Set(names).size).toBe(3);
  });
});
