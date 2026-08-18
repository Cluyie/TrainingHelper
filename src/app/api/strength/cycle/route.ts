import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeBlockState, manualDeloadStart } from "@/lib/deload";
export const dynamic = "force-dynamic";

async function readBlockStart(userId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("user_settings")
    .select("strength_block_start")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.strength_block_start ?? null;
}

async function writeBlockStart(userId: string, date: string) {
  await getSupabaseAdmin()
    .from("user_settings")
    .update({ strength_block_start: date })
    .eq("user_id", userId);
}

// Current 6-week block state. The anchor is immutable (see lib/deload.ts), so it is
// written exactly once — on first read, when none is stored yet. Writing it on block
// advancement would reset the derived blockIndex and break the Phase 3 running
// rotation, which must survive regeneration.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const stored = await readBlockStart(auth.userId);
  const state = computeBlockState(stored);
  if (!stored) {
    await writeBlockStart(auth.userId, state.blockStart);
  }
  return NextResponse.json(state);
}

// Trigger a deload now: the current week becomes the deload week, and a fresh block
// starts the following week.
export async function POST() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const start = manualDeloadStart();
  await writeBlockStart(auth.userId, start);
  return NextResponse.json(computeBlockState(start));
}
