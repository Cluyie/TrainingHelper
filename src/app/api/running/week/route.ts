import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeRunningWeek, startDateForWeek, PROGRAM_WEEKS } from "@/lib/running-week";
export const dynamic = "force-dynamic";

async function readStart(userId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("user_settings")
    .select("program_start_date")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.program_start_date ?? null;
}

async function writeStart(userId: string, date: string) {
  await getSupabaseAdmin()
    .from("user_settings")
    .update({ program_start_date: date })
    .eq("user_id", userId);
}

// Current calendar week of the running program. Persists the anchor on first read so
// the week stays fixed rather than resetting to 1 as "today" moves.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const stored = await readStart(auth.userId);
  const state = computeRunningWeek(stored);
  if (state.programStart !== stored) {
    await writeStart(auth.userId, state.programStart);
  }
  return NextResponse.json(state);
}

// Re-align the program: "I'm on week N" → anchor so that N is the current week today.
export async function PUT(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const week = Number(body.week);
  if (!Number.isFinite(week) || week < 1 || week > PROGRAM_WEEKS) {
    return NextResponse.json({ error: `week must be 1..${PROGRAM_WEEKS}` }, { status: 400 });
  }

  const start = startDateForWeek(week);
  await writeStart(auth.userId, start);
  return NextResponse.json(computeRunningWeek(start));
}
