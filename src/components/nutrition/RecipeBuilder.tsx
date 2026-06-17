"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, ChevronLeft, Trash2, Check } from "lucide-react";
import { TIER1, NUTRIENTS, sumSnapshots, type NutrientSnapshot } from "@/lib/nutrients";
import { fmt } from "@/lib/nutrition-client";
import type { FoodSearchResult, FoodSource, Recipe } from "@/types";

interface BuilderIngredient {
  key: string; // local row key
  source: FoodSource;
  refId: string | null; // fdc/frida id (null for manual)
  food_name: string;
  brand: string | null;
  grams: number;
  per100g: NutrientSnapshot;
}

/** Scale a per-100g snapshot to grams (client-safe). */
function scale(per100g: NutrientSnapshot, grams: number): NutrientSnapshot {
  const f = grams / 100;
  const out: NutrientSnapshot = {};
  for (const n of NUTRIENTS) {
    const v = per100g[n.key];
    out[n.key] = v == null ? null : Math.round(v * f * 1000) / 1000;
  }
  return out;
}

export default function RecipeBuilder({ recipeId }: { recipeId?: string }) {
  const router = useRouter();
  const isEdit = !!recipeId && recipeId !== "new";

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [ingredients, setIngredients] = useState<BuilderIngredient[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);

  // Load existing recipe for editing.
  useEffect(() => {
    if (!isEdit) return;
    fetch(`/api/nutrition/recipes/${recipeId}`)
      .then((r) => r.json())
      .then((r: Recipe) => {
        setName(r.name);
        setNotes(r.notes ?? "");
        setIngredients(
          (r.recipe_ingredients ?? []).map((ing, i) => {
            const grams = Number(ing.quantity_g) || 0;
            const per100g: NutrientSnapshot = {};
            for (const n of NUTRIENTS) {
              const v = ing.nutrients?.[n.key];
              per100g[n.key] = v == null || grams <= 0 ? (v ?? null) : Math.round((v * 100) / grams * 1000) / 1000;
            }
            const source: FoodSource =
              ing.data_type === "Frida" ? "frida" : ing.data_type === "Manual" ? "manual" : "usda";
            return {
              key: `${i}-${ing.id}`,
              source,
              refId: ing.fdc_id,
              food_name: ing.food_name,
              brand: ing.brand,
              grams,
              per100g,
            };
          })
        );
      })
      .catch(() => setError("Failed to load recipe"))
      .finally(() => setLoading(false));
  }, [isEdit, recipeId]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function addFood(r: FoodSearchResult) {
    setAdding(r.id);
    setError(null);
    try {
      const url =
        r.source === "frida"
          ? `/api/nutrition/food?source=frida&id=${r.id}`
          : `/api/nutrition/food?fdcId=${r.id}`;
      const res = await fetch(url);
      const detail = await res.json();
      if (!res.ok) throw new Error(detail.error || "Lookup failed");
      const grams = detail.servingSize ? Math.round(detail.servingSize) : 100;
      setIngredients((prev) => [
        ...prev,
        {
          key: `${Date.now()}-${r.id}`,
          source: r.source,
          refId: r.id,
          food_name: detail.description,
          brand: detail.brand,
          grams,
          per100g: detail.per100g,
        },
      ]);
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setAdding(null);
    }
  }

  function setGrams(key: string, grams: number) {
    setIngredients((prev) => prev.map((i) => (i.key === key ? { ...i, grams } : i)));
  }
  function remove(key: string) {
    setIngredients((prev) => prev.filter((i) => i.key !== key));
  }

  // Live totals.
  const totalWeight = ingredients.reduce((s, i) => s + (Number(i.grams) || 0), 0);
  const totals = sumSnapshots(ingredients.map((i) => scale(i.per100g, Number(i.grams) || 0)));

  async function save() {
    if (!name.trim() || ingredients.length === 0) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      notes: notes.trim() || null,
      ingredients: ingredients.map((i) => {
        if (i.source === "frida") return { source: "frida", id: i.refId, grams: i.grams };
        if (i.source === "manual" || !i.refId)
          return { food_name: i.food_name, brand: i.brand, grams: i.grams, nutrients: scale(i.per100g, i.grams) };
        return { fdcId: i.refId, grams: i.grams };
      }),
    };
    const res = await fetch(isEdit ? `/api/nutrition/recipes/${recipeId}` : "/api/nutrition/recipes", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save");
      setSaving(false);
      return;
    }
    router.push("/nutrition/recipes");
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
        <button onClick={() => router.push("/nutrition/recipes")} className="p-1"
          style={{ color: "var(--muted)" }} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold">{isEdit ? "Edit recipe" : "New recipe"}</h1>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--warning)", color: "var(--warning)" }}>
          {error}
        </div>
      )}

      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name (e.g. Overnight oats)"
        className="w-full h-12 px-4 rounded-xl outline-none text-sm font-medium"
        style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />

      {/* Ingredient list */}
      <div className="space-y-2">
        <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
          INGREDIENTS ({ingredients.length}) · {Math.round(totalWeight)} g total
        </p>
        {ingredients.map((i) => (
          <div key={i.key} className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{i.food_name}</p>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                {i.source === "frida" ? "Frida" : i.source === "manual" ? "Manual" : "USDA"}
                {i.per100g.calories != null && ` · ${Math.round((i.per100g.calories * i.grams) / 100)} kcal`}
              </p>
            </div>
            <input type="number" inputMode="decimal" value={i.grams}
              onChange={(e) => setGrams(i.key, Number(e.target.value))}
              className="w-16 h-9 px-2 rounded-lg outline-none text-sm text-right tabular-nums"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>g</span>
            <button onClick={() => remove(i.key)} className="p-1.5" style={{ color: "var(--muted)" }} aria-label="Remove">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {ingredients.length === 0 && (
          <p className="text-sm py-3 text-center" style={{ color: "var(--muted)" }}>
            Search below to add ingredients.
          </p>
        )}
      </div>

      {/* Running totals */}
      {ingredients.length > 0 && (
        <div className="rounded-2xl px-4 py-3 space-y-1.5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--muted)" }}>
            WHOLE RECIPE
          </p>
          {TIER1.map((n) => (
            <div key={n.key} className="flex justify-between text-sm">
              <span style={{ color: "var(--muted)" }}>{n.label}</span>
              <span className="tabular-nums">
                {totals[n.key] == null ? "—" : `${fmt(totals[n.key]!, n.unit)} ${n.unit}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Search to add ingredients */}
      <form onSubmit={runSearch} className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 rounded-xl h-12"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <Search size={18} style={{ color: "var(--muted)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add an ingredient"
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: "var(--foreground)" }} />
        </div>
        <button type="submit" disabled={searching || query.trim().length < 2}
          className="px-4 rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#06281f" }}>
          {searching ? "…" : "Go"}
        </button>
      </form>

      <div className="space-y-2">
        {results.map((r) => (
          <button key={`${r.source}-${r.id}`} onClick={() => addFood(r)} disabled={adding === r.id}
            className="w-full text-left rounded-xl px-4 py-3 disabled:opacity-50 flex items-center justify-between gap-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{r.description}</p>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                {r.source === "frida" ? "Frida (DK)" : r.brandOwner ? `${r.brandOwner} · ${r.dataType}` : r.dataType}
              </p>
            </div>
            <Plus size={18} style={{ color: "var(--accent)" }} />
          </button>
        ))}
      </div>

      {/* Notes */}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)"
        rows={2} className="w-full px-4 py-3 rounded-xl outline-none text-sm resize-none"
        style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />

      <button onClick={save} disabled={saving || !name.trim() || ingredients.length === 0}
        className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#06281f" }}>
        <Check size={18} /> {saving ? "Saving…" : isEdit ? "Save changes" : "Create recipe"}
      </button>
    </div>
  );
}
