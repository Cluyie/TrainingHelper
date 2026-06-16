import { NextRequest, NextResponse } from "next/server";
import { getFoodDetail } from "@/lib/usda";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const fdcId = new URL(request.url).searchParams.get("fdcId");
  if (!fdcId) return NextResponse.json({ error: "fdcId required" }, { status: 400 });

  try {
    const detail = await getFoodDetail(fdcId);
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 400 }
    );
  }
}
