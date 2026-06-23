"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Utensils, Settings, Plus, ChevronLeft, ChevronRight,
  ChevronDown, Trash2, AlertTriangle, BookOpen, Droplet, Tag,
} from "lucide-react";
import {
  TIER1, byGroup, GROUP_ORDER, GROUP_LABELS, NUTRIENT_MAP,
} from "@/lib/nutrients";
import {
  foodTotals, supplementTotals, targetMap, weeklyStats,
  todayISO, shiftDate, formatDateLabel, fmt, type WeeklyStat,
} from "@/lib/nutrition-client";
import NutrientBar from "@/components/nutrition/NutrientBar";
import TrendIndicator from "@/components/nutrition/TrendIndicator";
import type { FoodLogEntry, Supplement, NutrientTarget } from "@/types";

export default function NutritionPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState<"day" | "week">("day");

  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<FoodLogEntry[]>([]);
  const [supps, setSupps] = useState<Supplement[]>([]);
  const [targets, setTargets] = useState<NutrientTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier2Open, setTier2Open] = useState(false);

  // static data (targets + supplements)
  useEffect(() => {
    Promise.all([
      fetch("/api/nutrition/targets").then((r) => r.json()),
      fetch("/api/nutrition/supplements").then((r) => r.json()),
    ]).then(([t, s]) => {
      setTargets(Array.isArray(t) ? t : []);
      setSupps(Array.isArray(s) ? s : []);
    });
  }, []);

  // day entries
  useEffect(() => {
    setLoading(true);
    fetch(`/api/nutrition/log?date=${date}`)
      .then((r) => r.json())
      .then((d) => setEntries(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [date]);

  // week entries (7-day window ending on `date`)
  useEffect(() => {
    if (view !== "week") return;
    const start = shiftDate(date, -6);
    fetch(`/api/nutrition/log?start=${start}&end=${date}`)
      .then((r) => r.json())
      .then((d) => setWeekEntries(Array.isArray(d) ? d : []));
  }, [view, date]);

  const food = foodTotals(entries);
  const suppMap = supplementTotals(supps);
  const tMap = targetMap(targets);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Utensils size={22} style={{ color: "var(--accent)" }} />
          <h1 className="text-xl font-bold">Nutrition</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push("/nutrition/custom-foods")}
            className="p-2 rounded-lg"
            style={{ color: "var(--muted)" }}
            aria-label="My foods"
          >
            <Tag size={20} />
          </button>
          <button
            onClick={() => router.push("/nutrition/recipes")}
            className="p-2 rounded-lg"
            style={{ color: "var(--muted)" }}
            aria-label="Recipes"
          >
            <BookOpen size={20} />
          </button>
          <button
            onClick={() => router.push("/nutrition/settings")}
            className="p-2 rounded-lg"
            style={{ color: "var(--muted)" }}
            aria-label="Nutrition settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Day / Week toggle */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--surface)" }}>
        {(["day", "week"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize"
            style={{
              background: view === v ? "var(--surface-2)" : "transparent",
              color: view === v ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {v === "day" ? "Day" : "Week"}
          </button>
        ))}
      </div>

      {/* Date stepper */}
      <div className="flex items-center justify-between">
        <button onClick={() => setDate(shiftDate(date, -1))} className="p-2 rounded-lg"
          style={{ color: "var(--muted)" }} aria-label="Previous day">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">
            {view === "week" ? "7 days to " : ""}{formatDateLabel(date)}
          </p>
          {view === "week" && (
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {formatDateLabel(shiftDate(date, -6))} – {formatDateLabel(date)}
            </p>
          )}
        </div>
        <button onClick={() => setDate(shiftDate(date, 1))} className="p-2 rounded-lg"
          style={{ color: "var(--muted)" }} aria-label="Next day"
          disabled={date >= todayISO()}>
          <ChevronRight size={20} style={{ opacity: date >= todayISO() ? 0.3 : 1 }} />
        </button>
      </div>

      {view === "day" ? (
        <DayView
          loading={loading}
          entries={entries}
          food={food}
          suppMap={suppMap}
          tMap={tMap}
          tier2Open={tier2Open}
          setTier2Open={setTier2Open}
          onAdd={() => router.push(`/nutrition/add?date=${date}`)}
          onDelete={async (id) => {
            await fetch(`/api/nutrition/log?id=${id}`, { method: "DELETE" });
            setEntries((prev) => prev.filter((e) => e.id !== id));
          }}
        />
      ) : (
        <WeekView stats={weeklyStats(weekEntries, supps, targets)} />
      )}
    </div>
  );
}

// ---------------- Day view ----------------

function DayView({
  loading, entries, food, suppMap, tMap, tier2Open, setTier2Open, onAdd, onDelete,
}: {
  loading: boolean;
  entries: FoodLogEntry[];
  food: Record<string, number | null>;
  suppMap: Record<string, number>;
  tMap: Record<string, NutrientTarget>;
  tier2Open: boolean;
  setTier2Open: (v: boolean) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  if (loading) return <Loader />;

  // Fat budget: with protein + carbs set, fat is the macro that balances calories.
  // Show how much fat is left to reach today's calorie target (9 kcal/g).
  const calTarget = tMap["calories"]?.target_amount ?? NUTRIENT_MAP["calories"].defaultTarget;
  const calLogged = (food["calories"] ?? 0) + (suppMap["calories"] ?? 0);
  const fatLogged = (food["fat_g"] ?? 0) + (suppMap["fat_g"] ?? 0);
  const kcalLeft = calTarget - calLogged;
  const fatLeft = kcalLeft / 9;

  return (
    <div className="space-y-5">
      <button
        onClick={onAdd}
        className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        style={{ background: "var(--accent)", color: "#06281f" }}
      >
        <Plus size={18} /> Add food
      </button>

      {/* Tier 1 — always visible */}
      <div className="space-y-2.5">
        {TIER1.map((n) => {
          const t = tMap[n.key];
          const enforce = n.key === "net_carbs_g" ? t?.enabled !== false : true;
          return (
            <div key={n.key} className="rounded-2xl px-4 py-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <NutrientBar
                label={n.key === "net_carbs_g" && !enforce ? `${n.label} (no limit)` : n.label}
                unit={n.unit}
                food={food[n.key] ?? null}
                supplement={suppMap[n.key] ?? 0}
                target={t?.target_amount ?? n.defaultTarget}
                direction={t?.direction ?? n.direction}
                enforce={enforce}
              />
            </div>
          );
        })}
      </div>

      {/* Fat budget — fat fills whatever calories protein + carbs leave */}
      {entries.length > 0 && (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Droplet size={18} style={{ color: kcalLeft >= 0 ? "var(--accent)" : "var(--warning)" }} />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {kcalLeft >= 0 ? "Fat to hit calories" : "Over calorie target"}
              </p>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                {kcalLeft >= 0
                  ? `${Math.round(kcalLeft)} kcal to go · ${Math.round(fatLogged)} g fat logged`
                  : `${Math.round(-kcalLeft)} kcal over · ${Math.round(fatLogged)} g fat logged`}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold tabular-nums"
              style={{ color: kcalLeft >= 0 ? "var(--accent)" : "var(--warning)" }}>
              {kcalLeft >= 0 ? `${Math.round(fatLeft)} g` : `+${Math.round(-fatLeft)} g`}
            </p>
            <p className="text-[10px]" style={{ color: "var(--muted)" }}>
              {kcalLeft >= 0 ? "fat left" : "over"}
            </p>
          </div>
        </div>
      )}

      {/* Tier 2 — healthspan metrics dropdown */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <button
          onClick={() => setTier2Open(!tier2Open)}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <span className="text-sm font-semibold">Healthspan metrics</span>
          <ChevronDown size={18}
            style={{ color: "var(--muted)", transform: tier2Open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </button>

        {tier2Open && (
          <div className="px-4 pb-4 space-y-4">
            {GROUP_ORDER.map((group) => (
              <div key={group}>
                <p className="text-[11px] font-semibold mb-1 mt-2" style={{ color: "var(--muted)" }}>
                  {GROUP_LABELS[group].toUpperCase()}
                </p>
                {byGroup(group).map((n) => {
                  const t = tMap[n.key];
                  return (
                    <NutrientBar
                      key={n.key}
                      label={n.label}
                      unit={n.unit}
                      food={food[n.key] ?? null}
                      supplement={suppMap[n.key] ?? 0}
                      target={t?.target_amount ?? n.defaultTarget}
                      direction={t?.direction ?? n.direction}
                      compact
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logged foods */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--muted)" }}>
          LOGGED ({entries.length})
        </p>
        {entries.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--muted)" }}>
            Nothing logged yet. Tap “Add food”.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{e.food_name}</p>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {Math.round(e.quantity_g)} g
                    {e.nutrients?.calories != null && ` · ${Math.round(e.nutrients.calories)} kcal`}
                    {e.brand ? ` · ${e.brand}` : ""}
                  </p>
                </div>
                <button onClick={() => onDelete(e.id)} className="p-2 ml-2"
                  style={{ color: "var(--muted)" }} aria-label="Delete entry">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Week view ----------------

function WeekView({ stats }: { stats: WeeklyStat[] }) {
  const statMap = Object.fromEntries(stats.map((s) => [s.key, s]));
  const logged = stats.some((s) => s.hasData);

  if (!logged) {
    return (
      <p className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>
        Log foods across a few days to see weekly trends and deficiencies.
      </p>
    );
  }

  // deficiencies first: nutrients with at least one day below/over target
  const order = [...TIER1, ...GROUP_ORDER.flatMap((g) => byGroup(g))];
  const sorted = order.sort((a, b) => {
    const da = statMap[a.key]?.daysBelow ?? 0;
    const db = statMap[b.key]?.daysBelow ?? 0;
    return db - da;
  });

  return (
    <div className="space-y-2">
      {sorted.map((n) => {
        const s = statMap[n.key];
        if (!s) return null;
        const def = NUTRIENT_MAP[n.key];
        const isLimit = def.direction === "limit";
        const deficient = s.hasData && s.daysBelow > 0;
        return (
          <div key={n.key} className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{
              background: "var(--surface)",
              border: `1px solid ${deficient ? "var(--warning)" : "var(--border)"}`,
            }}>
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                {def.label}
                {deficient && <AlertTriangle size={13} style={{ color: "var(--warning)" }} />}
              </p>
              {s.hasData ? (
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  avg {fmt(s.avg, def.unit)} {def.unit} · {s.daysBelow}/{s.daysLogged} days{" "}
                  {isLimit ? "over" : "below"}
                </p>
              ) : (
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>no data</p>
              )}
            </div>
            {s.hasData && <TrendIndicator trend={s.trend} />}
          </div>
        );
      })}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
    </div>
  );
}
