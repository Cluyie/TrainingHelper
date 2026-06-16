import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getFoodDetail, scaleNutrients } from "@/lib/usda";
export const dynamic = "force-dynamic";

// GET ?date=YYYY-MM-DD  → entries for one day
// GET ?start=&end=      → entries across a range (weekly view), ascending by date
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  let query = getSupabaseAdmin()
    .from("food_log_entries")
    .select("*")
    .order("created_at", { ascending: true });

  if (date) {
    query = query.eq("date", date);
  } else if (start && end) {
    query = query.gte("date", start).lte("date", end);
  } else {
    return NextResponse.json([]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST { fdcId, grams, date? }                  → log a USDA food (server computes snapshot)
// POST { food_name, grams, nutrients, date? }   → log a manual entry
export async function POST(request: NextRequest) {
  const body = await request.json();
  const grams = Number(body.grams);
  if (!grams || grams <= 0) {
    return NextResponse.json({ error: "grams must be a positive number" }, { status: 400 });
  }
  const date = body.date || new Date().toISOString().split("T")[0];

  let row: Record<string, unknown>;

  if (body.fdcId) {
    let detail;
    try {
      detail = await getFoodDetail(body.fdcId);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Food lookup failed" },
        { status: 400 }
      );
    }
    row = {
      date,
      fdc_id: String(body.fdcId),
      food_name: detail.description,
      brand: detail.brand,
      quantity_g: grams,
      nutrients: scaleNutrients(detail.per100g, grams),
      data_type: detail.dataType,
    };
  } else if (body.food_name && body.nutrients) {
    row = {
      date,
      fdc_id: null,
      food_name: body.food_name,
      brand: body.brand ?? null,
      quantity_g: grams,
      nutrients: body.nutrients,
      data_type: "Manual",
    };
  } else {
    return NextResponse.json(
      { error: "Provide either fdcId or food_name + nutrients" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("food_log_entries")
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await getSupabaseAdmin().from("food_log_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
