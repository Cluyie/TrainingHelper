import { describe, it, expect } from "vitest";
import { getProgressionSuggestion } from "@/lib/progression";
import type { PlannedExercise, WorkoutSet } from "@/types";

function planned(overrides: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    id: "pe-1",
    planned_workout_id: "pw-1",
    exercise_id: "ex-1",
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    progression_increment_kg: 2.5,
    ...overrides,
  };
}

function sets(reps: number[], weight = 0, session = "sess", day = "2026-01-01"): WorkoutSet[] {
  return reps.map((r, i) => ({
    id: `${session}-${i}`,
    session_id: session,
    exercise_id: "ex-1",
    set_number: i + 1,
    weight_kg: weight,
    reps: r,
    rpe: null,
    completed_at: `${day}T18:0${i}:00Z`,
  }));
}

/** How the API actually returns history: several sessions, flat, newest first. */
function apiOrder(...sessions: WorkoutSet[][]): WorkoutSet[] {
  return sessions
    .flat()
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
}

describe("loaded progression", () => {
  it("adds a plate once every set hits the top of the range", () => {
    const s = getProgressionSuggestion(planned(), sets([12, 12, 12], 40));
    expect(s.is_increase).toBe(true);
    expect(s.suggested_weight_kg).toBe(42.5);
    expect(s.message).toContain("42.5kg");
  });

  it("holds the weight when only the minimum was reached", () => {
    const s = getProgressionSuggestion(planned(), sets([10, 9, 8], 40));
    expect(s.is_increase).toBe(false);
    expect(s.suggested_weight_kg).toBe(40);
  });

  it("backs off when the minimum was missed", () => {
    const s = getProgressionSuggestion(planned(), sets([6, 5, 5], 40));
    expect(s.suggested_weight_kg).toBe(37.5);
  });
});

describe("multi-session history, as the API returns it", () => {
  // The API sends the last ~3 sessions in one flat list, newest first. Reading that
  // list directly produced two failures: the "last session" readout showed the OLDEST
  // set, and the increase check demanded that every set of every recent session hit
  // the top of the range — so it effectively never fired.
  const older = sets([8, 8, 8], 35, "sess-old", "2026-01-01");
  const middle = sets([10, 10, 10], 37.5, "sess-mid", "2026-01-08");
  const latest = sets([12, 12, 12], 40, "sess-new", "2026-01-15");

  it("reads the most recent session, not the oldest in the list", () => {
    const s = getProgressionSuggestion(planned(), apiOrder(older, middle, latest));
    expect(s.last_weight_kg).toBe(40);
    expect(s.last_reps).toBe(12);
  });

  it("awards the increase on last session alone", () => {
    const s = getProgressionSuggestion(planned(), apiOrder(older, middle, latest));
    expect(s.is_increase).toBe(true);
    expect(s.suggested_weight_kg).toBe(42.5);
  });

  it("is not blocked by a weak set from an earlier session", () => {
    // 8-rep sets three weeks ago must not veto today's progression.
    const weakOld = sets([6, 6, 6], 30, "sess-old", "2026-01-01");
    const s = getProgressionSuggestion(planned(), apiOrder(weakOld, latest));
    expect(s.is_increase).toBe(true);
  });

  it("holds when the most recent session fell short, despite a strong older one", () => {
    const strongOld = sets([12, 12, 12], 40, "sess-old", "2026-01-01");
    const weakLatest = sets([9, 8, 8], 40, "sess-new", "2026-01-15");
    const s = getProgressionSuggestion(planned(), apiOrder(strongOld, weakLatest));
    expect(s.is_increase).toBe(false);
    expect(s.suggested_weight_kg).toBe(40);
  });

  it("reports the heaviest set of last session, not a back-off set", () => {
    const mixed = [
      ...sets([12], 40, "sess-new", "2026-01-15"),
      ...sets([12], 30, "sess-new", "2026-01-15").map((s) => ({ ...s, id: "backoff", set_number: 2 })),
    ];
    const s = getProgressionSuggestion(planned(), mixed);
    expect(s.last_weight_kg).toBe(40);
  });

  it("handles a single session with one set", () => {
    const s = getProgressionSuggestion(planned(), sets([12], 40));
    expect(s.last_weight_kg).toBe(40);
    expect(s.is_increase).toBe(true);
  });
});

describe("bodyweight progression", () => {
  const bw = planned({ progression_increment_kg: 0 });

  it("never mentions kg at the top of the range", () => {
    // The old code fell through to the loaded branch and produced
    // "Great work! Increase to 0kg today" for every bodyweight exercise.
    const s = getProgressionSuggestion(bw, sets([12, 12, 12]));
    expect(s.message).not.toContain("kg");
    expect(s.message).not.toContain("0kg");
  });

  it("names the next variant when one is available", () => {
    const s = getProgressionSuggestion(bw, sets([12, 12, 12]), "Feet-Elevated Push-Up");
    expect(s.is_increase).toBe(true);
    expect(s.message).toContain("Feet-Elevated Push-Up");
  });

  it("suggests tempo work when there is no harder variant left", () => {
    const s = getProgressionSuggestion(bw, sets([12, 12, 12]), null);
    expect(s.message).toContain("tempo");
    expect(s.message).not.toContain("kg");
  });

  it("points at the rep target that unlocks the next variant", () => {
    const s = getProgressionSuggestion(bw, sets([10, 9, 8]));
    expect(s.message).toContain("12");
    expect(s.message).not.toContain("kg");
  });

  it("uses seconds rather than reps for holds", () => {
    const hold = planned({ progression_increment_kg: 0, target_reps_min: 30, target_reps_max: 45 });
    const s = getProgressionSuggestion(hold, sets([35, 33, 30]));
    expect(s.message).toContain("seconds");
  });

  it("never reports a last weight for bodyweight work", () => {
    const s = getProgressionSuggestion(bw, sets([10, 10, 10]));
    expect(s.last_weight_kg).toBeNull();
  });

  it("gives bodyweight-specific advice on the first session", () => {
    const s = getProgressionSuggestion(bw, []);
    expect(s.message).not.toContain("kg");
    expect(s.message).toContain("control");
  });
});
