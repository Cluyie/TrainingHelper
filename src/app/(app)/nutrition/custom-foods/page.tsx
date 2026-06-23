"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Pencil, Trash2, Tag } from "lucide-react";
import type { CustomFood } from "@/types";

export default function CustomFoodsPage() {
  const router = useRouter();
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/nutrition/custom-foods")
      .then((r) => r.json())
      .then((d) => setFoods(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function del(id: string) {
    if (!confirm("Delete this food? Already-logged meals are kept.")) return;
    await fetch(`/api/nutrition/custom-foods/${id}`, { method: "DELETE" });
    setFoods((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/nutrition")} className="p-1"
          style={{ color: "var(--muted)" }} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Tag size={20} style={{ color: "var(--accent)" }} /> My Foods
        </h1>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Add products that aren’t in the food databases — like a protein powder — straight from their
        nutrition label. They’ll show up in “Add food”.
      </p>

      <button onClick={() => router.push("/nutrition/custom-foods/new")}
        className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        style={{ background: "var(--accent)", color: "#06281f" }}>
        <Plus size={18} /> New food
      </button>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        </div>
      ) : foods.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
          No custom foods yet. Create one, then log it from “Add food”.
        </p>
      ) : (
        <div className="space-y-2">
          {foods.map((f) => {
            const kcal100 = f.per100g?.calories;
            const prot100 = f.per100g?.protein_g;
            return (
              <div key={f.id} className="flex items-center rounded-xl overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="flex-1 px-4 py-3 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {f.brand ? `${f.brand} · ` : ""}
                    {kcal100 != null ? `${Math.round(kcal100)} kcal` : "—"}
                    {prot100 != null && ` · ${Math.round(prot100)} g protein`}
                    {" /100g"}
                  </p>
                </div>
                <button onClick={() => router.push(`/nutrition/custom-foods/${f.id}`)}
                  className="px-3 self-stretch flex items-center border-l"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }} aria-label="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => del(f.id)}
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
