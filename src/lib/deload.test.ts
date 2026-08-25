import { describe, it, expect } from "vitest";
import { computeBlockState, manualDeloadStart, BLOCK_WEEKS } from "@/lib/deload";
import { phase3BlockVariant } from "@/lib/running-plan";

// The Phase 3 A/B/C interval rotation is selected by blockIndex % 3, and blockIndex is
// derived from an immutable anchor rather than stored. These tests exist because the
// rotation must survive regeneration: running content is rebuilt weekly and strength is
// rebuilt whenever settings change, and either one resetting the rotation to Block A
// would silently undo the variety Phase 3 depends on.

const ANCHOR = "2026-01-05"; // a Monday

function weeksAfter(anchor: string, weeks: number): Date {
  const d = new Date(anchor + "T00:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

describe("block state derivation", () => {
  it("returns the same blockIndex when called repeatedly with the same date", () => {
    const today = weeksAfter(ANCHOR, 14);
    const a = computeBlockState(ANCHOR, today);
    const b = computeBlockState(ANCHOR, today);
    const c = computeBlockState(ANCHOR, today);

    expect(a.blockIndex).toBe(b.blockIndex);
    expect(b.blockIndex).toBe(c.blockIndex);
    expect(a.blockIndex).toBe(2);
  });

  it("leaves strength_block_start unchanged as blocks advance", () => {
    for (const w of [0, 5, 6, 11, 12, 23, 40]) {
      const state = computeBlockState(ANCHOR, weeksAfter(ANCHOR, w));
      expect(state.blockStart).toBe(ANCHOR);
    }
  });

  it("advances blockIndex exactly once crossing week 6 into week 7", () => {
    const week6 = computeBlockState(ANCHOR, weeksAfter(ANCHOR, 5));
    const week7 = computeBlockState(ANCHOR, weeksAfter(ANCHOR, 6));

    expect(week6.weekInBlock).toBe(6);
    expect(week6.isDeload).toBe(true);
    expect(week6.blockIndex).toBe(0);

    expect(week7.weekInBlock).toBe(1);
    expect(week7.isDeload).toBe(false);
    expect(week7.blockIndex).toBe(1);
  });

  it("walks weeks 1..6 within a block without skipping", () => {
    const seen = [0, 1, 2, 3, 4, 5].map(
      (w) => computeBlockState(ANCHOR, weeksAfter(ANCHOR, w)).weekInBlock
    );
    expect(seen).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("treats a missing anchor as starting today, at block 0 week 1", () => {
    const state = computeBlockState(null, new Date("2026-03-01T00:00:00"));
    expect(state.weekInBlock).toBe(1);
    expect(state.blockIndex).toBe(0);
  });

  it("does not drift across a DST boundary", () => {
    // Raw millisecond division loses a day when the clocks change, which silently
    // shifted both the deload week and the block rotation twice a year.
    const beforeDst = "2026-03-02"; // well before the late-March European shift
    for (let w = 0; w <= 20; w++) {
      const state = computeBlockState(beforeDst, weeksAfter(beforeDst, w));
      expect(state.weekInBlock, `week ${w}`).toBe((w % BLOCK_WEEKS) + 1);
      expect(state.blockIndex, `week ${w}`).toBe(Math.floor(w / BLOCK_WEEKS));
    }
  });
});

describe("Monday alignment", () => {
  // The block week has to turn over on Mondays. The plan it drives is laid out
  // Monday→Sunday by day_of_week, so an anchor on any other weekday meant that every
  // Monday and Tuesday you were shown the PREVIOUS block-week's schedule — already
  // logged, nothing left to do — and the app looked stuck on the same week.

  const WED = "2026-08-19"; // the anchor this bug was found on
  const MONDAY_OF_THAT_WEEK = "2026-08-17";

  it("snaps a mid-week anchor back to the Monday of its week", () => {
    const state = computeBlockState(WED, new Date("2026-08-19T00:00:00"));
    expect(state.blockStart).toBe(MONDAY_OF_THAT_WEEK);
  });

  it("leaves an anchor that is already a Monday untouched", () => {
    const state = computeBlockState(ANCHOR, new Date(ANCHOR + "T00:00:00"));
    expect(state.blockStart).toBe(ANCHOR);
  });

  it("is idempotent — re-deriving from its own output never moves", () => {
    let state = computeBlockState(WED, new Date("2026-09-30T00:00:00"));
    const first = { ...state };
    for (let i = 0; i < 5; i++) {
      state = computeBlockState(state.blockStart, new Date("2026-09-30T00:00:00"));
    }
    expect(state).toEqual(first);
  });

  it("turns the week over on Monday, not on the anchor's weekday", () => {
    // Anchored Wed 19 Aug. Sun 23 Aug is still week 1; Mon 24 Aug is week 2.
    const sunday = computeBlockState(WED, new Date("2026-08-23T00:00:00"));
    const monday = computeBlockState(WED, new Date("2026-08-24T00:00:00"));
    const tuesday = computeBlockState(WED, new Date("2026-08-25T00:00:00"));

    expect(sunday.weekInBlock).toBe(1);
    expect(monday.weekInBlock).toBe(2);
    expect(tuesday.weekInBlock).toBe(2); // the day the app was reported stuck on week 1
  });

  it("holds one week number for a whole Monday→Sunday week", () => {
    const days = ["24", "25", "26", "27", "28", "29", "30"].map(
      (d) => computeBlockState(WED, new Date(`2026-08-${d}T00:00:00`)).weekInBlock
    );
    expect(days).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it("puts a Sunday-anchored block's first week in the week that Sunday belongs to", () => {
    // Sunday is the far end of the week, so it snaps back six days rather than one.
    const sundayAnchor = "2026-03-01";
    const state = computeBlockState(sundayAnchor, new Date("2026-03-01T00:00:00"));
    expect(state.blockStart).toBe("2026-02-23");
    expect(state.weekInBlock).toBe(1);
  });

  it("still deloads in week 6, counted in whole calendar weeks", () => {
    // Six Mondays on from the snapped anchor is a new block, not a seventh week.
    const week6 = computeBlockState(WED, new Date("2026-09-21T00:00:00"));
    const week7 = computeBlockState(WED, new Date("2026-09-28T00:00:00"));

    expect(week6.weekInBlock).toBe(6);
    expect(week6.isDeload).toBe(true);
    expect(week7.weekInBlock).toBe(1);
    expect(week7.blockIndex).toBe(1);
  });
});

describe("Phase 3 block rotation", () => {
  it("rotates A → B → C → A across consecutive blocks", () => {
    const variants = [0, 1, 2, 3, 4, 5].map((block) =>
      phase3BlockVariant(computeBlockState(ANCHOR, weeksAfter(ANCHOR, block * BLOCK_WEEKS)).blockIndex)
    );
    expect(variants).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("holds the same variant for every week within one block", () => {
    // Block 1 spans weeks 6..11 from the anchor — all six must be Block B.
    const variants = [6, 7, 8, 9, 10, 11].map((w) =>
      phase3BlockVariant(computeBlockState(ANCHOR, weeksAfter(ANCHOR, w)).blockIndex)
    );
    expect(new Set(variants).size).toBe(1);
    expect(variants[0]).toBe(1);
  });

  it("cannot be reset by regenerating running content mid-block", () => {
    // Regeneration re-derives from the same stored anchor; it never writes a new one.
    const today = weeksAfter(ANCHOR, 8); // block 1, week 3
    const before = computeBlockState(ANCHOR, today);

    const afterRegen = computeBlockState(before.blockStart, today);
    const afterAnotherRegen = computeBlockState(afterRegen.blockStart, today);

    expect(afterRegen.blockIndex).toBe(before.blockIndex);
    expect(afterAnotherRegen.blockIndex).toBe(before.blockIndex);
    expect(phase3BlockVariant(afterAnotherRegen.blockIndex)).toBe(1);
  });

  it("cannot be reset by regenerating strength either", () => {
    // Strength regeneration used to persist an advanced anchor, which zeroed the
    // completed-block count. Feeding the returned blockStart back in must be a no-op.
    const today = weeksAfter(ANCHOR, 13); // block 2
    let state = computeBlockState(ANCHOR, today);
    const original = state.blockIndex;

    for (let i = 0; i < 5; i++) {
      state = computeBlockState(state.blockStart, today);
    }

    expect(state.blockIndex).toBe(original);
    expect(state.blockStart).toBe(ANCHOR);
    expect(phase3BlockVariant(state.blockIndex)).toBe(2);
  });
});

describe("manual deload", () => {
  it("makes the current week the deload week", () => {
    const today = new Date("2026-04-13T00:00:00");
    const state = computeBlockState(manualDeloadStart(today), today);
    expect(state.weekInBlock).toBe(BLOCK_WEEKS);
    expect(state.isDeload).toBe(true);
  });

  it("deloads the whole current week when triggered mid-week", () => {
    // Pressed on a Thursday: the deload covers Mon→Sun of that week, and the anchor it
    // writes is itself a Monday, so nothing downstream has to re-snap it.
    const thursday = new Date("2026-04-16T00:00:00");
    const anchor = manualDeloadStart(thursday);
    expect(new Date(anchor + "T00:00:00").getDay()).toBe(1); // Monday

    for (const d of ["13", "16", "19"]) {
      const state = computeBlockState(anchor, new Date(`2026-04-${d}T00:00:00`));
      expect(state.weekInBlock, `April ${d}`).toBe(BLOCK_WEEKS);
      expect(state.isDeload, `April ${d}`).toBe(true);
    }
  });

  it("restarts the block cycle — the documented, intentional exception", () => {
    // manualDeloadStart rewrites the anchor by design, so the rotation position moves
    // with it. This is the one place the anchor is allowed to change.
    const today = new Date("2026-04-13T00:00:00");
    const state = computeBlockState(manualDeloadStart(today), today);
    expect(state.blockIndex).toBe(0);
  });
});
