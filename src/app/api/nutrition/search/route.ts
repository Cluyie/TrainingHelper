import { NextRequest, NextResponse } from "next/server";
import { searchFoods as searchUsda } from "@/lib/usda";
import { searchFrida } from "@/lib/frida";
import type { FoodSearchResult } from "@/types";
export const dynamic = "force-dynamic";

// Merge Frida (preferred, Danish whole foods) ahead of USDA results.
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q || q.trim().length < 2) return NextResponse.json([]);
  const query = q.trim();

  try {
    const [frida, usda] = await Promise.all([
      searchFrida(query).catch(() => [] as FoodSearchResult[]),
      searchUsda(query).catch((e) => {
        // If Frida returned nothing and USDA failed, surface the error.
        throw e;
      }),
    ]);
    return NextResponse.json([...frida, ...usda]);
  } catch (e) {
    // USDA failed — still return any Frida matches we have.
    const frida = await searchFrida(query).catch(() => [] as FoodSearchResult[]);
    if (frida.length) return NextResponse.json(frida);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 400 }
    );
  }
}
