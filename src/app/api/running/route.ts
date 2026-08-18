import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeBlockState, BLOCK_WEEKS } from "@/lib/deload";
import { shouldAdvanceRunningPhase, runningWeek } from "@/lib/running-plan";
import { buildWeek } from "@/lib/week-builder";
import { writeRunningWeek } from "@/lib/persist-week";
import type { Phase, UserSettings } from "@/types";
export const dynamic = "force-dynamic";

// Running content changes every week as the block advances, unlike strength templates
// which are stable within a phase. So running is regenerated lazily on read — the same
// derive-on-read pattern used by computeBlockState — rather than on settings save.
// Regenerating strength this often would null workout_sessions.planned_workout_id
// every week and destroy the history links.
/** Date range [from, to) of the block immediately before the current one. */
function previousBlockWindow(anchor: string, blockIndex: number): [string, string] {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const start = new Date(anchor + "T00:00:00");
  start.setDate(start.getDate() + (blockIndex - 1) * BLOCK_WEEKS * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + BLOCK_WEEKS * 7);

  return [iso(start), iso(end)];
}

/** How many non-optional runs a full 6-week block should contain at a given phase. */
function requiredRunsPerBlock(phase: Phase): number {
  let total = 0;
  for (let week = 1; week <= BLOCK_WEEKS; week++) {
    total += runningWeek(phase, week).filter((r) => !r.optional).length;
  }
  return total;
}

async function ensureCurrentWeek(userId: string) {
  const db = getSupabaseAdmin();

  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings) return;

  const s = settings as UserSettings;
  const block = computeBlockState(s.strength_block_start);

  // ── Running-phase bump, once per block ──────────────────────────────────
  // Gated on actually having done the running: dropping someone into 4×4 intervals
  // after a block they barely ran is how Achilles and calf injuries happen.
  let runningPhase: Phase = (s.running_phase ?? 1) as Phase;

  // The marker records which BLOCK the gate was last evaluated for. Comparing block
  // index rather than a date means it fires once when a block completes, not on every
  // read and not again within the same block.
  const evaluatedBlock = s.running_phase_block;
  const currentBlockKey = `${block.blockStart}#${block.blockIndex}`;

  if (evaluatedBlock !== currentBlockKey) {
    // Only a completed block earns a bump — the first read of block 0 just records
    // the marker.
    if (block.blockIndex > 0) {
      // Scope the count to the block that just ENDED, by date. Rows are keyed by
      // week-in-block (1-6) and completed ones survive each weekly rebuild, so week 3
      // accumulates a completed row from every block. Counting them all would let one
      // good block satisfy the gate forever.
      const [from, to] = previousBlockWindow(block.blockStart, block.blockIndex);

      const { data: blockRuns } = await db
        .from("running_sessions")
        .select("completed")
        .eq("user_id", userId)
        .eq("optional", false)
        .eq("completed", true)
        .gte("date", from)
        .lt("date", to);

      const done = (blockRuns ?? []).length;
      const expected = requiredRunsPerBlock(runningPhase);

      const decision = shouldAdvanceRunningPhase(runningPhase, done, expected);
      if (decision.advance) runningPhase = Math.min(3, runningPhase + 1) as Phase;
    }

    await db
      .from("user_settings")
      .update({ running_phase: runningPhase, running_phase_block: currentBlockKey })
      .eq("user_id", userId);
  }

  // Rebuild this block-week's runs if they're missing.
  //
  // Only planner-placed rows count. program_week now means week-in-block (1-6), so
  // completed rows left over from the retired 16-week program share those numbers —
  // and a legacy row alone would otherwise convince this check the week already
  // exists, leaving you with no runs at all.
  const { count } = await db
    .from("running_sessions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("program_week", block.weekInBlock)
    .not("day_of_week", "is", null);

  if (count && count > 0) return;

  const { data: exercises } = await db.from("exercises").select("*");
  if (!exercises || exercises.length === 0) return;

  const week = buildWeek({
    currentPhase: s.current_phase,
    runningPhase,
    weekInBlock: block.weekInBlock,
    blockIndex: block.blockIndex,
    noGymDays: s.no_gym_days ?? ["saturday", "sunday"],
    exercises,
  });

  await writeRunningWeek(userId, block.weekInBlock, week);
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await ensureCurrentWeek(auth.userId);

  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");

  let query = getSupabaseAdmin()
    .from("running_sessions")
    .select("*")
    .eq("user_id", auth.userId)
    .order("program_week")
    .order("session_in_week");

  if (week) {
    query = query.eq("program_week", parseInt(week));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;

  const { data, error } = await getSupabaseAdmin()
    .from("running_sessions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
