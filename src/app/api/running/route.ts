import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeBlockState } from "@/lib/deload";
import type { RunType } from "@/types";
export const dynamic = "force-dynamic";

// Running is a LOG, not a plan. Nothing is generated here any more: you record the
// runs you actually did, and analytics and the activity-adjusted calorie target read
// the completed rows by date, exactly as before.
//
// Rows from the retired planner stay in the table. Completed ones are history and
// still show; never-run planned ones are simply not returned.

const RUN_TYPES: RunType[] = ["easy", "long", "interval", "unstructured"];

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("running_sessions")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("completed", true)
    .order("date", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Log a run.
export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();

  const duration = Number(body.actual_duration_min);
  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: "duration (minutes) is required" }, { status: 400 });
  }
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  const type: RunType = RUN_TYPES.includes(body.type) ? body.type : "easy";

  const db = getSupabaseAdmin();

  // Stamp the block position so a run can still be read against the strength block
  // (e.g. deload weeks). A failed read is not allowed to silently become week 1.
  const { data: settings, error: setErr } = await db
    .from("user_settings")
    .select("strength_block_start")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (setErr) {
    return NextResponse.json({ error: `failed to read the block: ${setErr.message}` }, { status: 500 });
  }
  const block = computeBlockState(
    settings?.strength_block_start ?? null,
    new Date(body.date + "T12:00:00")
  );

  const { data, error } = await db
    .from("running_sessions")
    .insert({
      user_id: auth.userId,
      block_index: block.blockIndex,
      program_week: block.weekInBlock,
      session_in_week: 1,
      day_of_week: null,
      date: body.date,
      type,
      // The table predates free logging and requires a target. A logged run's target
      // is simply what was done.
      target_duration_min: Math.round(duration),
      target_description: "Logged run",
      optional: false,
      completed: true,
      actual_duration_min: Math.round(duration),
      actual_distance_km: body.actual_distance_km ?? null,
      notes: body.notes ?? null,
      rpe: body.rpe ?? null,
      avg_hr: body.avg_hr ?? null,
      max_hr: body.max_hr ?? null,
      hr_end: body.hr_end ?? null,
      hr_60s: body.hr_60s ?? null,
      hr_120s: body.hr_120s ?? null,
      temperature_c: body.temperature_c ?? null,
      surface: body.surface ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "the run was not stored" }, { status: 500 });
  return NextResponse.json(data);
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

