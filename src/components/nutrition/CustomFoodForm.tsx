"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, Save } from "lucide-react";
import { TIER2 } from "@/lib/nutrients";
import type { CustomFood } from "@/types";

/** Macro fields, in label order. `key` maps to a nutrient registry key.
 * Danish/EU labels: "Carbs" already excludes fiber → maps to net_carbs_g.
 * "of which sugars" is the refined-carb component → refined_carbs_g. */
const MACRO_FIELDS: { key: string; label: string; unit: string; hint?: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "net_carbs_g", label: "Carbs", unit: "g", hint: "net — excl. fiber (as on EU labels)" },
  { key: "fiber_g", label: "Fiber", unit: "g" },
  { key: "refined_carbs_g", label: "of which sugars", unit: "g", hint: "counted as refined carbs" },
];

export default function CustomFoodForm({ foodId }: { foodId: string }) {
  const router = useRouter();
  const isEdit = foodId !== "new";

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [serving, setServing] = useState("");
  const [notes, setNotes] = useState("");
  // Per-100g values keyed by nutrient registry key, kept as raw strings.
  const [values, setValues] = useState<Record<string, string>>({});
  const [showMicros, setShowMicros] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    fetch(`/api/nutrition/custom-foods/${foodId}`)
      .then((r) => r.json())
      .then((d: CustomFood) => {
        if (!d || (d as unknown as { error?: string }).error) throw new Error("Not found");
        setName(d.name ?? "");
        setBrand(d.brand ?? "");
        setServing(d.serving_size_g != null ? String(d.serving_size_g) : "");
        setNotes(d.notes ?? "");
        const v: Record<string, string> = {};
        for (const [k, val] of Object.entries(d.per100g ?? {})) {
          if (val != null) v[k] = String(val);
        }
        setValues(v);
        // Expand micros if any were filled in.
        if (TIER2.some((n) => v[n.key] != null && v[n.key] !== "")) setShowMicros(true);
      })
      .catch(() => setError("Could not load this food."))
      .finally(() => setLoading(false));
  }, [foodId, isEdit]);

  function setVal(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function save() {
    if (!name.trim()) {
      setError("Give the food a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      brand: brand.trim() || null,
      serving_size_g: serving.trim() || null,
      notes: notes.trim() || null,
      per100g: values, // server sanitizes (known keys only, blank → null)
    };
    const res = await fetch(isEdit ? `/api/nutrition/custom-foods/${foodId}` : "/api/nutrition/custom-foods", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save.");
      return;
    }
    router.push("/nutrition/custom-foods");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/nutrition/custom-foods")} className="p-1"
          style={{ color: "var(--muted)" }} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold">{isEdit ? "Edit food" : "New food"}</h1>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--warning)", color: "var(--warning)" }}>
          {error}
        </div>
      )}

      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Whey Isolate)"
          className="w-full h-12 px-4 rounded-xl outline-none text-sm font-medium"
          style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand (optional)"
          className="w-full h-12 px-4 rounded-xl outline-none text-sm"
          style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
      </div>

      {/* Per-100g nutrition label */}
      <div className="rounded-2xl px-4 py-4 space-y-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-[11px] font-semibold" style={{ color: "var(--muted)" }}>
          NUTRITION PER 100 g
        </p>
        {MACRO_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} unit={f.unit} hint={f.hint}
            value={values[f.key] ?? ""} onChange={(v) => setVal(f.key, v)} />
        ))}
      </div>

      {/* Optional micronutrients */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <button onClick={() => setShowMicros((s) => !s)}
          className="w-full flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">More nutrients (optional)</span>
          <ChevronDown size={18} style={{ color: "var(--muted)", transform: showMicros ? "rotate(180deg)" : "none" }} />
        </button>
        {showMicros && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              Fill in only what the label lists. Blanks stay “no data” and don’t affect totals.
            </p>
            {TIER2.map((n) => (
              <Field key={n.key} label={n.label} unit={n.unit}
                value={values[n.key] ?? ""} onChange={(v) => setVal(n.key, v)} />
            ))}
          </div>
        )}
      </div>

      {/* Optional default serving */}
      <div className="rounded-2xl px-4 py-4 space-y-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <Field label="Default serving" unit="g" hint="optional — pre-fills the amount when logging"
          value={serving} onChange={setServing} />
      </div>

      <button onClick={save} disabled={saving}
        className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#06281f" }}>
        <Save size={18} /> {saving ? "Saving…" : isEdit ? "Save changes" : "Save food"}
      </button>
    </div>
  );
}

function Field({
  label, unit, hint, value, onChange,
}: {
  label: string;
  unit: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px]" style={{ color: "var(--muted)" }}>{hint}</p>}
      </div>
      <input type="number" inputMode="decimal" value={value} placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className="w-24 h-10 px-3 rounded-lg outline-none text-sm text-right tabular-nums"
        style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
      <span className="text-[11px] w-8" style={{ color: "var(--muted)" }}>{unit}</span>
    </div>
  );
}
