"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, Pill, Target } from "lucide-react";
import { NUTRIENTS, NUTRIENT_MAP, TIER1, byGroup, GROUP_ORDER, GROUP_LABELS } from "@/lib/nutrients";
import type { ActivityAdjustment } from "@/lib/activity";
import type { NutrientTarget, Supplement, Goal } from "@/types";

interface TargetsMeta {
  date: string;
  goal: Goal;
  hasWeight: boolean;
  hasProfile: boolean;
  maintenance: number | null;
  source: "adaptive" | "formula" | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  adjustedCalories: number | null;
  adjustedFat: number | null;
  activity: ActivityAdjustment | null;
  caloriesOverridden: boolean;
  proteinOverridden: boolean;
  fatOverridden: boolean;
}

const GOAL_LABELS: Record<Goal, string> = { cut: "Cut", maintain: "Maintain", lean_gain: "Lean gain" };

export default function NutritionSettingsPage() {
  const router = useRouter();
  const [targets, setTargets] = useState<NutrientTarget[]>([]);
  const [supps, setSupps] = useState<Supplement[]>([]);
  const [meta, setMeta] = useState<TargetsMeta | null>(null);
  const [loading, setLoading] = useState(true);

  // add-supplement form
  const [suppKey, setSuppKey] = useState(NUTRIENTS[6]?.key ?? "magnesium_mg");
  const [suppName, setSuppName] = useState("");
  const [suppDose, setSuppDose] = useState("");

  function loadMeta() {
    return fetch("/api/nutrition/targets?meta=1")
      .then((r) => r.json())
      .then((m) => setMeta(m && typeof m === "object" ? m : null))
      .catch(() => setMeta(null));
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/nutrition/targets").then((r) => r.json()),
      fetch("/api/nutrition/supplements").then((r) => r.json()),
      loadMeta(),
    ]).then(([t, s]) => {
      setTargets(Array.isArray(t) ? t : []);
      setSupps(Array.isArray(s) ? s : []);
      setLoading(false);
    });
  }, []);

  const tMap = Object.fromEntries(targets.map((t) => [t.nutrient_key, t]));

  async function patchTarget(key: string, patch: Partial<NutrientTarget>) {
    const current = tMap[key];
    const body = {
      nutrient_key: key,
      target_amount: patch.target_amount ?? current?.target_amount ?? NUTRIENT_MAP[key].defaultTarget,
      direction: patch.direction ?? current?.direction ?? NUTRIENT_MAP[key].direction,
      enabled: patch.enabled ?? current?.enabled ?? true,
    };
    setTargets((prev) => {
      const others = prev.filter((t) => t.nutrient_key !== key);
      return [...others, body];
    });
    await fetch("/api/nutrition/targets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function addSupplement() {
    const dose = Number(suppDose);
    if (!suppKey || !dose || dose <= 0) return;
    const res = await fetch("/api/nutrition/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nutrient_key: suppKey, name: suppName || null, dose_amount: dose }),
    });
    if (res.ok) {
      const created = await res.json();
      setSupps((prev) => [...prev, created]);
      setSuppName("");
      setSuppDose("");
    }
  }

  async function deleteSupplement(id: string) {
    await fetch(`/api/nutrition/supplements?id=${id}`, { method: "DELETE" });
    setSupps((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const netCarb = tMap["net_carbs_g"];

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/nutrition")} className="p-1"
          style={{ color: "var(--muted)" }} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold">Nutrition Settings</h1>
      </div>

      {/* Goal → adaptive calorie & protein targets. Set in /settings, shown here read-only. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Target size={16} style={{ color: "var(--accent)" }} /> Goal
        </h2>
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <p className="text-sm font-semibold">{GOAL_LABELS[meta?.goal ?? "maintain"]}</p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>Drives your calorie & protein targets</p>
          </div>
          <button onClick={() => router.push("/settings")}
            className="text-xs font-semibold underline" style={{ color: "var(--accent)" }}>
            Change in Settings
          </button>
        </div>

        <div className="rounded-2xl px-4 py-3 text-xs leading-relaxed"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
          {meta?.hasProfile && meta.maintenance != null ? (
            <>
              <p>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                  Maintenance ≈ {meta.maintenance} kcal
                </span>{" "}
                {meta.source === "adaptive"
                  ? "— learned from your last 2 weeks of weight + food."
                  : "— formula estimate; sharpens as you log weight + food for ~2 weeks."}
              </p>
              <p className="mt-1">
                Targets: <span className="font-semibold" style={{ color: "var(--accent)" }}>{meta.calories} kcal</span>
                {" · "}<span className="font-semibold" style={{ color: "var(--accent)" }}>{meta.protein_g} g protein</span>
                {meta.fat_g != null && <>{" · "}<span className="font-semibold" style={{ color: "var(--accent)" }}>{meta.fat_g} g fat</span></>}.
                Fat balances whatever calories protein + carbs leave; calories adjust to your weight trend automatically.
              </p>
              {meta.activity != null && (
                <p className="mt-1">
                  Daily calories also shift with your logged activity — training and step-heavy
                  days get more, rest days less (today:{" "}
                  <span className="font-semibold" style={{ color: "var(--accent)" }}>
                    {meta.activity.adjustment >= 0 ? "+" : ""}{meta.activity.adjustment} kcal
                  </span>
                  ) — while the weekly average stays on target.
                </p>
              )}
            </>
          ) : (
            <p>
              Add your sex, birth year, height and activity in{" "}
              <button onClick={() => router.push("/settings")} className="font-semibold underline" style={{ color: "var(--accent)" }}>
                Settings
              </button>{" "}
              and log a weight to get adaptive calorie & protein targets. Until then, the defaults below apply.
            </p>
          )}
        </div>
      </section>

      {/* Net-carb hard limit */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Net carb hard limit</h2>
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <p className="text-sm font-medium">Enforce limit</p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              Warn when net carbs exceed the cap
            </p>
          </div>
          <button
            onClick={() => patchTarget("net_carbs_g", { enabled: !(netCarb?.enabled !== false) })}
            className="w-12 h-7 rounded-full relative transition-colors"
            style={{ background: netCarb?.enabled !== false ? "var(--accent)" : "var(--surface-2)" }}
            aria-label="Toggle net carb limit"
          >
            <span className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all"
              style={{ left: netCarb?.enabled !== false ? "1.5rem" : "0.25rem" }} />
          </button>
        </div>
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-sm font-medium">Limit (g)</p>
          <input
            type="number" inputMode="numeric"
            defaultValue={netCarb?.target_amount ?? 50}
            onBlur={(e) => patchTarget("net_carbs_g", { target_amount: Number(e.target.value) })}
            className="w-20 h-10 px-3 rounded-lg text-sm text-right outline-none"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </div>
      </section>

      {/* Supplements */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Pill size={16} style={{ color: "var(--accent)" }} /> Supplements
        </h2>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Added to daily totals, but always shown separately from food intake.
        </p>

        {supps.map((s) => (
          <div key={s.id} className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div>
              <p className="text-sm font-medium">
                {s.name || NUTRIENT_MAP[s.nutrient_key]?.label || s.nutrient_key}
              </p>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                {NUTRIENT_MAP[s.nutrient_key]?.label} · {s.dose_amount}{" "}
                {NUTRIENT_MAP[s.nutrient_key]?.unit}/day
              </p>
            </div>
            <button onClick={() => deleteSupplement(s.id)} className="p-2"
              style={{ color: "var(--muted)" }} aria-label="Delete supplement">
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {/* Add form */}
        <div className="rounded-2xl px-4 py-3 space-y-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <select value={suppKey} onChange={(e) => setSuppKey(e.target.value)}
            className="w-full h-11 px-3 rounded-lg text-sm outline-none"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
            {NUTRIENTS.map((n) => (
              <option key={n.key} value={n.key}>{n.label} ({n.unit})</option>
            ))}
          </select>
          <input value={suppName} onChange={(e) => setSuppName(e.target.value)}
            placeholder="Label (optional, e.g. Vitamin D3 2000IU)"
            className="w-full h-11 px-3 rounded-lg text-sm outline-none"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
          <div className="flex gap-2">
            <input value={suppDose} onChange={(e) => setSuppDose(e.target.value)}
              type="number" inputMode="decimal"
              placeholder={`Dose in ${NUTRIENT_MAP[suppKey]?.unit ?? ""}`}
              className="flex-1 h-11 px-3 rounded-lg text-sm outline-none"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
            <button onClick={addSupplement} disabled={!suppDose || Number(suppDose) <= 0}
              className="px-4 rounded-lg font-semibold text-sm flex items-center gap-1 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#06281f" }}>
              <Plus size={16} /> Add
            </button>
          </div>
        </div>
      </section>

      {/* Targets */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Daily targets</h2>
        {[
          { label: "Macros", items: TIER1 },
          ...GROUP_ORDER.map((g) => ({ label: GROUP_LABELS[g], items: byGroup(g) })),
        ].map(({ label, items }) => (
          <div key={label}>
            <p className="text-[11px] font-semibold mb-1.5 mt-2" style={{ color: "var(--muted)" }}>
              {label.toUpperCase()}
            </p>
            <div className="space-y-2">
              {items.map((n) => {
                const t = tMap[n.key];
                const auto =
                  !!meta?.hasProfile &&
                  ((n.key === "calories" && !meta.caloriesOverridden) ||
                    (n.key === "protein_g" && !meta.proteinOverridden) ||
                    (n.key === "fat_g" && !meta.fatOverridden));
                return (
                  <div key={n.key} className="rounded-xl px-4 py-2.5 flex items-center justify-between"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div>
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {auto ? "from your goal & weight" : (t?.direction ?? n.direction) === "limit" ? "limit" : "target"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {auto ? (
                        <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums px-3 h-9 rounded-lg"
                          style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                          {t?.target_amount ?? n.defaultTarget}
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                            style={{ background: "var(--accent)", color: "#06281f" }}>AUTO</span>
                        </span>
                      ) : (
                        <input
                          type="number" inputMode="decimal"
                          defaultValue={t?.target_amount ?? n.defaultTarget}
                          onBlur={(e) => patchTarget(n.key, { target_amount: Number(e.target.value) })}
                          className="w-20 h-9 px-3 rounded-lg text-sm text-right outline-none"
                          style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
                      )}
                      <span className="text-xs w-7" style={{ color: "var(--muted)" }}>{n.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
