"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, ChevronLeft, CheckCircle2, Clock, Pencil, Check } from "lucide-react";
import { TIER1 } from "@/lib/nutrients";
import { fmt } from "@/lib/nutrition-client";
import type { FoodSearchResult, FoodDetail, RecentFood } from "@/types";

function AddFoodForm() {
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get("date") || new Date().toISOString().split("T")[0];

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recent, setRecent] = useState<RecentFood[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [relogging, setRelogging] = useState<string | null>(null);

  const [detail, setDetail] = useState<FoodDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [grams, setGrams] = useState("100");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/nutrition/recent")
      .then((r) => r.json())
      .then((d) => setRecent(Array.isArray(d) ? d : []))
      .catch(() => setRecent([]));
  }, []);

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
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // One-tap re-log of a recent food at its last quantity.
  async function relog(item: RecentFood) {
    const id = item.fdc_id ?? item.food_name;
    setRelogging(id);
    const body = item.fdc_id
      ? { fdcId: item.fdc_id, grams: item.quantity_g, date }
      : {
          food_name: item.food_name,
          brand: item.brand,
          nutrients: item.nutrients,
          grams: item.quantity_g,
          date,
        };
    const res = await fetch("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setRelogging(null);
    if (res.ok) {
      setFlash(`Logged ${item.food_name} (${Math.round(item.quantity_g)}g)`);
      setTimeout(() => setFlash(null), 1800);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to log");
    }
  }

  // Open the quantity screen for a recent USDA food (to adjust the amount).
  async function adjustRecent(item: RecentFood) {
    if (!item.fdc_id) return;
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/nutrition/food?fdcId=${item.fdc_id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setDetail(data);
      setGrams(String(Math.round(item.quantity_g)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function selectFood(r: FoodSearchResult) {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/nutrition/food?fdcId=${r.fdcId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setDetail(data);
      setGrams(data.servingSize ? String(Math.round(data.servingSize)) : "100");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function save() {
    if (!detail || !grams || Number(grams) <= 0) return;
    setSaving(true);
    const res = await fetch("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fdcId: detail.fdcId, grams: Number(grams), date }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to log");
      setSaving(false);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/nutrition"), 1000);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64">
        <CheckCircle2 size={48} style={{ color: "var(--accent)" }} />
        <p className="font-bold text-lg">Food logged!</p>
      </div>
    );
  }

  const factor = (Number(grams) || 0) / 100;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => (detail ? setDetail(null) : router.push("/nutrition"))}
          className="p-1" style={{ color: "var(--muted)" }} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold">{detail ? "Quantity" : "Add Food"}</h1>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--warning)", color: "var(--warning)" }}>
          {error}
        </div>
      )}

      {flash && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
          <Check size={16} /> {flash}
        </div>
      )}

      {!detail ? (
        <>
          <form onSubmit={runSearch} className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 rounded-xl h-12"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <Search size={18} style={{ color: "var(--muted)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search foods (e.g. chicken breast)"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "var(--foreground)" }}
                autoFocus
              />
            </div>
            <button type="submit" disabled={searching || query.trim().length < 2}
              className="px-4 rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#06281f" }}>
              {searching ? "…" : "Go"}
            </button>
          </form>

          <div className="space-y-2">
            {results.map((r) => (
              <button key={r.fdcId} onClick={() => selectFood(r)}
                className="w-full text-left rounded-xl px-4 py-3"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-sm font-medium">{r.description}</p>
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {r.brandOwner ? `${r.brandOwner} · ` : ""}{r.dataType}
                  {r.servingSize ? ` · serving ${Math.round(r.servingSize)}g` : ""}
                </p>
              </button>
            ))}
            {loadingDetail && (
              <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>Loading…</p>
            )}
          </div>

          {searched && results.length === 0 && !searching && (
            <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>
              No matches. Try a simpler term.
            </p>
          )}

          {/* Recent / frequent foods — one-tap re-log */}
          {results.length === 0 && recent.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"
                style={{ color: "var(--muted)" }}>
                <Clock size={13} /> RECENT
              </p>
              <div className="space-y-2">
                {recent.map((item) => {
                  const id = item.fdc_id ?? item.food_name;
                  const cals = item.nutrients?.calories;
                  return (
                    <div key={id}
                      className="flex items-stretch rounded-xl overflow-hidden"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <button onClick={() => relog(item)} disabled={relogging === id}
                        className="flex-1 text-left px-4 py-3 active:opacity-70 disabled:opacity-50">
                        <p className="text-sm font-medium truncate">{item.food_name}</p>
                        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                          {Math.round(item.quantity_g)} g
                          {cals != null && ` · ${Math.round(cals)} kcal`}
                          {item.count > 1 && ` · logged ${item.count}×`}
                        </p>
                      </button>
                      {item.fdc_id ? (
                        <button onClick={() => adjustRecent(item)}
                          className="px-3 flex items-center justify-center border-l"
                          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                          aria-label="Adjust quantity">
                          <Pencil size={15} />
                        </button>
                      ) : null}
                      <button onClick={() => relog(item)} disabled={relogging === id}
                        className="px-4 flex items-center justify-center border-l disabled:opacity-50"
                        style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                        aria-label="Re-log">
                        {relogging === id ? "…" : <Plus size={18} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-2xl px-4 py-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold">{detail.description}</p>
            {detail.brand && (
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>{detail.brand}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: "var(--muted)" }}>
              Quantity (grams)
            </label>
            <input
              type="number" value={grams} inputMode="decimal"
              onChange={(e) => setGrams(e.target.value)}
              className="w-full h-12 px-4 rounded-xl outline-none text-sm"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {detail.servingSize && (
                <Chip label={`Serving ${Math.round(detail.servingSize)}g`}
                  onClick={() => setGrams(String(Math.round(detail.servingSize!)))} />
              )}
              {[50, 100, 150, 200].map((g) => (
                <Chip key={g} label={`${g}g`} onClick={() => setGrams(String(g))} />
              ))}
            </div>
          </div>

          {/* Live preview (Tier 1) */}
          <div className="rounded-2xl px-4 py-3 space-y-1.5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--muted)" }}>
              THIS PORTION
            </p>
            {TIER1.map((n) => {
              const per100 = detail.per100g[n.key];
              return (
                <div key={n.key} className="flex justify-between text-sm">
                  <span style={{ color: "var(--muted)" }}>{n.label}</span>
                  <span className="tabular-nums">
                    {per100 == null ? "—" : `${fmt(per100 * factor, n.unit)} ${n.unit}`}
                  </span>
                </div>
              );
            })}
          </div>

          <button onClick={save} disabled={saving || !grams || Number(grams) <= 0}
            className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#06281f" }}>
            <Plus size={18} /> {saving ? "Logging…" : "Log Food"}
          </button>
        </>
      )}
    </div>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
      {label}
    </button>
  );
}

export default function AddFoodPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
    </div>}>
      <AddFoodForm />
    </Suspense>
  );
}
