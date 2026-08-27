import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeBlockState, manualDeloadStart } from "@/lib/deload";
export const dynamic = "force-dynamic";

// Reading the anchor has three distinct outcomes and they must stay distinct: a stored
// date, a settings row whose anchor is still null (first run — safe to write one), and
// a read that FAILED. Collapsing the third into the second is how the anchor got
// silently rewritten to the current Monday, resetting the block clock to week 1.
async function readBlockStart(userId: string): Promise<{ row: boolean; start: string | null }> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_settings")
    .select("strength_block_start")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`failed to read the block anchor: ${error.message}`);
  return { row: !!data, start: data?.strength_block_start ?? null };
}

async function writeBlockStart(userId: string, date: string) {
  const { error } = await getSupabaseAdmin()
    .from("user_settings")
    .update({ strength_block_start: date })
    .eq("user_id", userId);
  if (error) throw new Error(`failed to store the block anchor: ${error.message}`);
}

// Current 6-week block state. The anchor is immutable (see lib/deload.ts), so it is
// written exactly once — on first read, when none is stored yet. Writing it on block
// advancement would reset the derived blockIndex and break the Phase 3 running
// rotation, which must survive regeneration.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { row, start } = await readBlockStart(auth.userId);
    if (!row) return NextResponse.json({ error: "no settings for this user" }, { status: 404 });

    const state = computeBlockState(start);
    if (!start) await writeBlockStart(auth.userId, state.blockStart);
    return NextResponse.json(state);
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed to read the block state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Trigger a deload now: the current week becomes the deload week, and a fresh block
// starts the following week.
export async function POST() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const start = manualDeloadStart();
  try {
    await writeBlockStart(auth.userId, start);
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed to start the deload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json(computeBlockState(start));
}
