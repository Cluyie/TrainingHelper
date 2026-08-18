import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { gymPool, homePool } from "@/lib/program-generator";
import type { Exercise } from "@/types";
export const dynamic = "force-dynamic";

// Swap candidates for an exercise mid-workout — for when a machine is occupied or a
// shoulder is complaining today.
//
// Candidates are drawn from the same pool the generator itself uses, so a swap can
// never introduce something the session shouldn't contain: no bodyweight filler at the
// gym, no loaded exercise at home, nothing above the user's phase.
export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const exerciseId = searchParams.get("exercise_id");
  const isHome = searchParams.get("home") === "true";

  if (!exerciseId) {
    return NextResponse.json({ error: "exercise_id is required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  const { data: settings } = await db
    .from("user_settings")
    .select("current_phase")
    .eq("user_id", auth.userId)
    .maybeSingle();
  const phase = settings?.current_phase ?? 1;

  const { data: all, error } = await db.from("exercises").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exercises = (all ?? []) as Exercise[];
  const current = exercises.find((e) => e.id === exerciseId);
  if (!current) return NextResponse.json([]);

  const pool = isHome ? homePool(exercises, phase) : gymPool(exercises, phase);

  // Same movement pattern, excluding the exercise already being done.
  const alternatives = pool
    .filter((e) => e.category === current.category && e.id !== current.id)
    // Cable first when otherwise equivalent, then easier variants before harder ones
    // so the list reads as a regression path when something hurts.
    .sort((a, b) => {
      const cable = Number(b.equipment.includes("cable")) - Number(a.equipment.includes("cable"));
      if (cable !== 0) return cable;
      return a.phase_unlock - b.phase_unlock || a.name.localeCompare(b.name);
    });

  return NextResponse.json(alternatives);
}
