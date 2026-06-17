import { NextRequest, NextResponse } from "next/server";
import { getFoodDetail } from "@/lib/usda";
import { getFridaDetail } from "@/lib/frida";
export const dynamic = "force-dynamic";

// GET ?fdcId=            → USDA food detail
// GET ?source=frida&id=  → Frida food detail
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source");
  const fdcId = params.get("fdcId");
  const id = params.get("id");

  try {
    if (source === "frida") {
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await getFridaDetail(id));
    }
    const target = fdcId ?? id;
    if (!target) return NextResponse.json({ error: "fdcId required" }, { status: 400 });
    return NextResponse.json(await getFoodDetail(target));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 400 }
    );
  }
}
