import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeBlockState, BLOCK_WEEKS } from "@/lib/deload";
import { PHASE_3_BLOCK_NAMES, phase3BlockVariant } from "@/lib/running-plan";
export const dynamic = "force-dynamic";

// Running no longer has its own 16-week calendar — it shares the 6-week block clock
// with strength, so the two finally deload in the same week instead of drifting apart.
//
// The old "I'm on week N of 16" re-align control (PUT) is gone with it: the week is
// derived from a single immutable anchor, so there is nothing left to re-align.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  const { data } = await db
    .from("user_settings")
    .select("strength_block_start, running_phase")
    .eq("user_id", auth.userId)
    .maybeSingle();

  const stored = data?.strength_block_start ?? null;
  const block = computeBlockState(stored);

  // The anchor is immutable, so it is written exactly once — on first read. Writing it
  // on block advancement would reset the derived block index and, with it, the Phase 3
  // interval rotation.
  if (!stored) {
    await db
      .from("user_settings")
      .update({ strength_block_start: block.blockStart })
      .eq("user_id", auth.userId);
  }

  const runningPhase = data?.running_phase ?? 1;

  return NextResponse.json({
    ...block,
    blockWeeks: BLOCK_WEEKS,
    runningPhase,
    // Phase 3 rotates through three interval blocks so the steady state doesn't become
    // the same six weeks forever. Phases 1 and 2 have a single progression each.
    blockVariant:
      runningPhase === 3 ? PHASE_3_BLOCK_NAMES[phase3BlockVariant(block.blockIndex)] : null,
  });
}
