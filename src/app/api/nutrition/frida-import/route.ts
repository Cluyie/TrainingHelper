import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeRefined } from "@/lib/usda";
import { NUTRIENTS, type NutrientSnapshot } from "@/lib/nutrients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_FILE = join("FridaData", "FCDB_6.1_Dataset.xlsx");

// Frida ParameterID → our registry key. Units already match the registry
// (mg / µg / g / kcal). EPA + DHA are summed and converted g→mg below.
const PARAM_TO_KEY: Record<string, string> = {
  "356": "calories",
  "218": "protein_g",
  "141": "fat_g",
  "168": "fiber_g",
  "184": "magnesium_mg",
  "165": "potassium_mg",
  "108": "calcium_mg",
  "201": "sodium_mg",
  "162": "iron_mg",
  "274": "zinc_mg",
  "230": "selenium_ug",
  "163": "iodine_ug",
  "126": "vitamin_d_ug",
  "47": "vitamin_c_mg",
  "38": "vitamin_b12_ug",
  "143": "folate_ug",
  "40": "vitamin_b6_mg",
  "164": "vitamin_k1_ug",
  "441": "vitamin_k2_ug",
};
const PARAM_CARBS = "170"; // Carbohydrate by difference (total) — for derived carbs
const PARAM_SUGARS = "245"; // Sum sugars — for the refined-carb heuristic
const PARAM_EPA = "87"; // C20:5,n-3 (g/100g)
const PARAM_DHA = "99"; // C22:6,n-3 (g/100g)

// --- minimal OOXML helpers (validated against FCDB_6.1) ---

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    let s = "";
    while ((t = tRe.exec(m[1]))) s += t[1];
    out.push(decodeXml(s));
  }
  return out;
}

/** Iterate sheet rows, yielding { rowNum, cells: { colLetter: stringValue } }. */
function* iterRows(xml: string, strings: string[]): Generator<{ rowNum: number; cells: Record<string, string> }> {
  const rowRe = /<row[^>]*?(?:\sr="(\d+)")?[^>]*>([\s\S]*?)<\/row>/g;
  const cRe =
    /<c r="([A-Z]+)\d+"(?:[^>]*?\st="([^"]+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>/g;
  let r: RegExpExecArray | null;
  let fallback = 0;
  while ((r = rowRe.exec(xml))) {
    fallback++;
    const rowNum = r[1] ? parseInt(r[1]) : fallback;
    const cells: Record<string, string> = {};
    let c: RegExpExecArray | null;
    cRe.lastIndex = 0;
    while ((c = cRe.exec(r[2]))) {
      const col = c[1];
      const type = c[2];
      const v = c[3];
      const inline = c[4];
      let val: string | null = null;
      if (inline != null) val = decodeXml(inline);
      else if (v != null) val = type === "s" ? strings[parseInt(v)] ?? "" : v;
      if (val != null) cells[col] = val;
    }
    yield { rowNum, cells };
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("x-seed-secret") !== process.env.AUTH_PIN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const file = body.path || DEFAULT_FILE;

  let buf: Buffer;
  try {
    buf = readFileSync(join(process.cwd(), file));
  } catch {
    return NextResponse.json(
      { error: `Could not read ${file}. Place the Frida .xlsx there (default: ${DEFAULT_FILE}).` },
      { status: 400 }
    );
  }

  // Decompress only the two entries we need.
  const wanted = new Set(["xl/sharedStrings.xml", "xl/worksheets/sheet2.xml"]);
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => wanted.has(f.name) });
  if (!files["xl/worksheets/sheet2.xml"]) {
    return NextResponse.json({ error: "Data_Table sheet (sheet2) not found in workbook" }, { status: 400 });
  }

  const strings = files["xl/sharedStrings.xml"] ? parseSharedStrings(strFromU8(files["xl/sharedStrings.xml"])) : [];
  const sheetXml = strFromU8(files["xl/worksheets/sheet2.xml"]);

  // Pass 1: row 4 maps each column letter → Frida ParameterID.
  // Pass over rows once: row 4 = ids, rows >= 5 = foods.
  const colToParam: Record<string, string> = {};
  const validKeys = new Set(NUTRIENTS.map((n) => n.key));
  const rows: { id: string; name: string; name_da: string; per100g: NutrientSnapshot }[] = [];

  for (const { rowNum, cells } of iterRows(sheetXml, strings)) {
    if (rowNum === 4) {
      for (const [col, val] of Object.entries(cells)) {
        if (col === "A" || col === "B" || col === "C") continue;
        if (/^\d+$/.test(val)) colToParam[col] = val;
      }
      continue;
    }
    if (rowNum < 5) continue;
    if (Object.keys(colToParam).length === 0) continue; // header not seen yet

    const id = cells["C"];
    const name = cells["B"];
    if (!id || !name) continue;

    // Gather raw param values for this food.
    const raw: Record<string, number> = {};
    for (const [col, pid] of Object.entries(colToParam)) {
      const cell = cells[col];
      if (cell == null || cell === "") continue;
      const num = parseFloat(cell);
      if (!Number.isNaN(num)) raw[pid] = num;
    }

    const per100g: NutrientSnapshot = {};
    // direct nutrients
    for (const [pid, key] of Object.entries(PARAM_TO_KEY)) {
      if (!validKeys.has(key)) continue;
      per100g[key] = pid in raw ? round(raw[pid]) : null;
    }

    // omega-3 (EPA + DHA), g → mg
    const epa = raw[PARAM_EPA];
    const dha = raw[PARAM_DHA];
    per100g["omega3_epadha_mg"] =
      epa == null && dha == null ? null : round(((epa ?? 0) + (dha ?? 0)) * 1000);

    // derived carbs
    const carbs = raw[PARAM_CARBS];
    const fiber = raw["168"]; // dietary fibre
    const sugars = raw[PARAM_SUGARS];
    if (carbs == null) {
      per100g["net_carbs_g"] = null;
      per100g["refined_carbs_g"] = null;
    } else {
      const fib = fiber ?? 0;
      per100g["net_carbs_g"] = round(Math.max(0, carbs - fib));
      per100g["refined_carbs_g"] = round(computeRefined(carbs, sugars ?? 0, fib, "Frida"));
    }

    const name_da = cells["A"] ?? "";
    rows.push({ id, name, name_da, per100g });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No food rows parsed — check the file/sheet layout" }, { status: 400 });
  }

  // Upsert in chunks.
  const supabase = getSupabaseAdmin();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      id: r.id,
      name: r.name,
      name_da: r.name_da || null,
      per100g: r.per100g,
      search_text: `${r.name} ${r.name_da}`.toLowerCase(),
    }));
    const { error } = await supabase.from("frida_foods").upsert(chunk, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    inserted += chunk.length;
  }

  return NextResponse.json({ success: true, imported: inserted });
}
