import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { swapPool } from "@/lib/program-generator";
import type { Exercise } from "@/types";
export const dynamic = "force-dynamic";

// Swap candidates for an exercise mid-workout — for when a shoulder is complaining
// today, or to move up/down the pull-up ladder.
//
// Candidates are limited to the kit that actually exists (Smith, cable, barbell, trap
// bar, bench, pull-up station, plates, medicine ball) — never dumbbells, kettlebells or
// machines — and to the same movement category.
export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const exerciseId = searchParams.get("exercise_id");

  if (!exerciseId) {
    return NextResponse.json({ error: "exercise_id is required" }, { status: 400 });
  }

  const { data: all, error } = await getSupabaseAdmin().from("exercises").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exercises = (all ?? []) as Exercise[];
  const current = exercises.find((e) => e.id === exerciseId);
  if (!current) return NextResponse.json([]);

  // Same movement pattern, excluding the exercise already being done.
  const alternatives = swapPool(exercises)
    .filter((e) => e.category === current.category && e.id !== current.id)
    // Cable first when otherwise equivalent, then alphabetical — a stable order.
    .sort((a, b) => {
      const cable = Number(b.equipment.includes("cable")) - Number(a.equipment.includes("cable"));
      if (cable !== 0) return cable;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json(alternatives);
}
