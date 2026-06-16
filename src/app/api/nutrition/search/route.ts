import { NextRequest, NextResponse } from "next/server";
import { searchFoods } from "@/lib/usda";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q || q.trim().length < 2) return NextResponse.json([]);

  try {
    const results = await searchFoods(q.trim());
    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 400 }
    );
  }
}
