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
import type { ActivityAdjustment } from "@/lib/activity";
import type { FoodLogEntry, Supplement, NutrientTarget } from "@/types";

export default function NutritionPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState<"day" | "week">("day");

  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<FoodLogEntry[]>([]);
  const [supps, setSupps] = useState<Supplement[]>([]);
  const [targets, setTargets] = useState<NutrientTarget[]>([]);
  const [activity, setActivity] = useState<ActivityAdjustment | null>(null);
  const [loading, setLoading] = useState(true);
  const [tier2Open, setTier2Open] = useState(false);

  // static data (supplements)
  useEffect(() => {
    fetch("/api/nutrition/supplements")
      .then((r) => r.json())
      .then((s) => setSupps(Array.isArray(s) ? s : []));
  }, []);

  // targets are per-day: the calorie target shifts with that day's activity
  // (runs, strength, steps — steps are entered on the home dashboard).
  useEffect(() => {
    Promise.all([
      fetch(`/api/nutrition/targets?date=${date}`).then((r) => r.json()),
      fetch(`/api/nutrition/targets?meta=1&date=${date}`).then((r) => r.json()),
    ]).then(([t, m]) => {
      setTargets(Array.isArray(t) ? t : []);
      setActivity(m?.activity ?? null);
    });
  }, [date]);

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
          activity={activity}
          tier2Open={tier2Open}
          setTier2Open={setTier2Open}
          onAdd={() => router.push(`/nutrition/add?date=${date}`)}
          onDelete={async (id) => {
            await fetch(`/api/nutrition/log?id=${id}`, { method: "DELETE" });
            setEntries((prev) => prev.filter((e) => e.id !== id));
          }}
        />
      ) : (
        // Flat targets are fine here: the activity adjustment is zero-mean over
        // its window, so weekly averages/daysBelow stats stay unbiased.
        <WeekView stats={weeklyStats(weekEntries, supps, targets)} />
      )}
    </div>
  );
}

// ---------------- Day view ----------------

function DayView({
  loading, entries, food, suppMap, tMap, activity, tier2Open, setTier2Open,
  onAdd, onDelete,
}: {
  loading: boolean;
  entries: FoodLogEntry[];
  food: Record<string, number | null>;
  suppMap: Record<string, number>;
  tMap: Record<string, NutrientTarget>;
  activity: ActivityAdjustment | null;
  tier2Open: boolean;
  setTier2Open: (v: boolean) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

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
          const open = openKey === n.key;
          return (
            <div key={n.key} className="rounded-2xl px-4 py-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <button onClick={() => setOpenKey(open ? null : n.key)} className="w-full text-left">
                <NutrientBar
                  label={n.key === "net_carbs_g" && !enforce ? `${n.label} (no limit)` : n.label}
                  unit={n.unit}
                  food={food[n.key] ?? null}
                  supplement={suppMap[n.key] ?? 0}
                  target={t?.target_amount ?? n.defaultTarget}
                  direction={t?.direction ?? n.direction}
                  enforce={enforce}
                />
              </button>
              {n.key === "calories" && activity != null && activity.adjustment !== 0 && (
                <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                  {activity.adjustment > 0 ? `+${activity.adjustment}` : activity.adjustment} kcal for activity
                  {activity.runMinToday > 0 && ` · run ${activity.runMinToday} min`}
                  {activity.today.strength > 0 && " · strength"}
                  {activity.stepsToday != null && ` · ${activity.stepsToday.toLocaleString("en-GB")} steps`}
                </p>
              )}
              {open && (
                <NutrientBreakdown
                  entries={entries}
                  nutrientKey={n.key}
                  unit={n.unit}
                  supplement={suppMap[n.key] ?? 0}
                />
              )}
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
                  const open = openKey === n.key;
                  return (
                    <div key={n.key}>
                      <button onClick={() => setOpenKey(open ? null : n.key)} className="w-full text-left">
                        <NutrientBar
                          label={n.label}
                          unit={n.unit}
                          food={food[n.key] ?? null}
                          supplement={suppMap[n.key] ?? 0}
                          target={t?.target_amount ?? n.defaultTarget}
                          direction={t?.direction ?? n.direction}
                          compact
                        />
                      </button>
                      {open && (
                        <div className="mb-3">
                          <NutrientBreakdown
                            entries={entries}
                            nutrientKey={n.key}
                            unit={n.unit}
                            supplement={suppMap[n.key] ?? 0}
                          />
                        </div>
                      )}
                    </div>
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

// ---------------- Nutrient breakdown (tap any bar) ----------------

// Which logged foods (and supplements) contribute to a nutrient today —
// the audit trail for "why is this number so high?".
function NutrientBreakdown({ entries, nutrientKey, unit, supplement }: {
  entries: FoodLogEntry[];
  nutrientKey: string;
  unit: string;
  supplement: number;
}) {
  const rows = entries
    .map((e) => ({
      id: e.id,
      name: e.food_name,
      grams: e.quantity_g,
      amount: e.nutrients?.[nutrientKey] ?? null,
    }))
    .filter((r): r is typeof r & { amount: number } => r.amount != null && r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const noData = entries.filter((e) => e.nutrients?.[nutrientKey] == null).length;
  const total = rows.reduce((s, r) => s + r.amount, 0) + supplement;
  const max = Math.max(rows[0]?.amount ?? 0, supplement);

  if (rows.length === 0 && supplement <= 0) {
    return (
      <p className="text-xs mt-2 pt-2" style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
        No logged food contributes to this today.
      </p>
    );
  }

  return (
    <div className="mt-2 pt-2.5 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
      {rows.map((r) => (
        <BreakdownRow key={r.id} name={r.name} detail={`${Math.round(r.grams)} g`}
          amount={r.amount} unit={unit} total={total} max={max} />
      ))}
      {supplement > 0 && (
        <BreakdownRow name="Supplements" amount={supplement} unit={unit} total={total} max={max} />
      )}
      {noData > 0 && (
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          {noData} logged {noData === 1 ? "item has" : "items have"} no data for this nutrient.
        </p>
      )}
    </div>
  );
}

function BreakdownRow({ name, detail, amount, unit, total, max }: {
  name: string; detail?: string; amount: number; unit: string; total: number; max: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs truncate min-w-0">
          {name}
          {detail && <span style={{ color: "var(--muted)" }}> · {detail}</span>}
        </p>
        <p className="text-xs tabular-nums shrink-0">
          <span className="font-semibold">{fmt(amount, unit)} {unit}</span>
          <span className="ml-1.5" style={{ color: "var(--muted)" }}>
            {total > 0 ? Math.round((amount / total) * 100) : 0}%
          </span>
        </p>
      </div>
      <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full"
          style={{ width: `${max > 0 ? (amount / max) * 100 : 0}%`, background: "var(--accent)", opacity: 0.7 }} />
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
