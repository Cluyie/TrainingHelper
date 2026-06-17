"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import type { RecipeSummary } from "@/types";

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/nutrition/recipes")
      .then((r) => r.json())
      .then((d) => setRecipes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function del(id: string) {
    if (!confirm("Delete this recipe? Already-logged meals are kept.")) return;
    await fetch(`/api/nutrition/recipes/${id}`, { method: "DELETE" });
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/nutrition")} className="p-1"
          style={{ color: "var(--muted)" }} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BookOpen size={20} style={{ color: "var(--accent)" }} /> Recipes
        </h1>
      </div>

      <button onClick={() => router.push("/nutrition/recipes/new")}
        className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        style={{ background: "var(--accent)", color: "#06281f" }}>
        <Plus size={18} /> New recipe
      </button>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        </div>
      ) : recipes.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
          No recipes yet. Create one, then log it from “Add food”.
        </p>
      ) : (
        <div className="space-y-2">
          {recipes.map((r) => {
            const kcal100 = r.per100g?.calories;
            return (
              <div key={r.id} className="flex items-center rounded-xl overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="flex-1 px-4 py-3 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {r.ingredient_count} ingredient{r.ingredient_count === 1 ? "" : "s"}
                    {kcal100 != null && ` · ${Math.round(kcal100)} kcal/100g`}
                  </p>
                </div>
                <button onClick={() => router.push(`/nutrition/recipes/${r.id}`)}
                  className="px-3 self-stretch flex items-center border-l"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }} aria-label="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => del(r.id)}
                  className="px-3 self-stretch flex items-center border-l"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }} aria-label="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
