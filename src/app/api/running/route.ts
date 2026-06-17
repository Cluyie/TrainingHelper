import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { seedRunningForUser } from "@/lib/seed-running";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");

  // Lazy-seed this user's 16-week program on first visit.
  const { count } = await getSupabaseAdmin()
    .from("running_sessions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.userId);
  if (!count || count === 0) {
    await seedRunningForUser(auth.userId);
  }

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

