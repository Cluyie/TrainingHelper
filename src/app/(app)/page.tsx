"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Wind, PersonStanding, ChevronRight, Flame, Calendar, Settings, AlertTriangle, Utensils, Scale, TrendingDown, TrendingUp, Check, Footprints } from "lucide-react";
import type { PlannedWorkout, RunningSession, NutrientTarget, BodyWeight, WorkoutSession } from "@/types";
import { getRunSchedulingHint } from "@/lib/run-schedule";
import { foodTotals, supplementTotals, targetMap, todayISO, toISODate, shiftDate } from "@/lib/nutrition-client";
import { weightTrend } from "@/lib/targets";
import { NUTRIENT_MAP } from "@/lib/nutrients";
import NutrientBar from "@/components/nutrition/NutrientBar";
import type { NutrientSnapshot } from "@/types";

const DAY_NAMES: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

const TODAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export default function Dashboard() {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [nextRun, setNextRun] = useState<RunningSession | null>(null);
  const [vo2ThisWeek, setVo2ThisWeek] = useState(false);
  const [loading, setLoading] = useState(true);

  // Today's nutrition (own effect so a missing FDC_API_KEY never blocks the dashboard)
  const [nutFood, setNutFood] = useState<NutrientSnapshot>({});
  const [nutSupp, setNutSupp] = useState<Record<string, number>>({});
  const [nutTargets, setNutTargets] = useState<NutrientTarget[]>([]);
  const [nutHasEntries, setNutHasEntries] = useState(false);
  const [nutRefresh, setNutRefresh] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/workouts").then((r) => r.json()),
      fetch("/api/running").then((r) => r.json()),
      fetch("/api/sessions?limit=20").then((r) => r.json()).catch(() => []),
    ]).then(([s, w, runs, sess]) => {
      setSessions(Array.isArray(sess) ? sess : []);
      // First-time / incomplete profile → finish onboarding before using the app.
      const profileComplete =
        s && s.sex && s.birth_year && s.height_cm && s.activity_level && s.goal;
      if (!s || !s.onboarding_complete || !profileComplete) {
        router.push("/settings");
        return;
      }
      setWorkouts(w ?? []);
      // Surface the next required run — optional unstructured sessions carry no
      // pressure and shouldn't nag from the dashboard.
      const runArr: RunningSession[] = runs ?? [];
      const incomplete = runArr.filter((r) => !r.completed && !r.optional);
      const next = incomplete[0] ?? null;
      setNextRun(next);
      // Flag if the current running week contains a VO2 (interval) session.
      setVo2ThisWeek(
        next != null && runArr.some((r) => r.program_week === next.program_week && r.type === "interval")
      );
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    const today = todayISO();
    Promise.all([
      fetch(`/api/nutrition/log?date=${today}`).then((r) => r.json()).catch(() => []),
      fetch("/api/nutrition/targets").then((r) => r.json()).catch(() => []),
      fetch("/api/nutrition/supplements").then((r) => r.json()).catch(() => []),
    ]).then(([entries, targets, supps]) => {
      const e = Array.isArray(entries) ? entries : [];
      setNutHasEntries(e.length > 0);
      setNutFood(foodTotals(e));
      setNutTargets(Array.isArray(targets) ? targets : []);
      setNutSupp(supplementTotals(Array.isArray(supps) ? supps : []));
    });
    // nutRefresh: logging steps shifts today's calorie target → re-fetch.
  }, [nutRefresh]);

  const todayKey = TODAY_KEYS[new Date().getDay()];
  const todayWorkout = workouts.find((w) => w.day_of_week === todayKey);
  const weekWorkouts = workouts;
  const runHint = getRunSchedulingHint(workouts);

  // "Done" per workout: a completed session this week (Mon-start) links to it.
  // Null plan links (program regenerated after logging) count for today's card.
  const today = todayISO();
  const monday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toISODate(d);
  })();
  const completedThisWeek = sessions.filter((s) => s.completed_at && s.date >= monday);
  const doneThisWeek = (w: PlannedWorkout) =>
    completedThisWeek.some(
      (s) => s.planned_workout_id === w.id ||
        (s.planned_workout_id == null && s.date === today && w.day_of_week === todayKey)
    );
  const todayWorkoutDone = todayWorkout != null &&
    completedThisWeek.some(
      (s) => s.date === today &&
        (s.planned_workout_id === todayWorkout.id || s.planned_workout_id == null)
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-bold mt-0.5">Good {getGreeting()}, Steffen 👋</h1>
        </div>
        <Link href="/settings" className="w-10 h-10 rounded-xl flex items-center justify-center mt-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Settings size={18} style={{ color: "var(--muted)" }} />
        </Link>
      </div>

      {/* Today's workout */}
      {todayWorkout ? (
        todayWorkoutDone ? (
          <TodayCard
            title={`${todayWorkout.label} — done`}
            subtitle="Completed today. Nice work 💪"
            icon={<Check size={20} strokeWidth={3} style={{ color: "#10b981" }} />}
            href={`/strength/workout/${todayWorkout.id}`}
          />
        ) : (
          <TodayCard
            title={`Today: ${todayWorkout.label}`}
            subtitle={`${todayWorkout.planned_exercises?.length ?? 0} exercises`}
            icon={<Dumbbell size={20} style={{ color: "var(--accent)" }} />}
            href={`/strength/workout/${todayWorkout.id}`}
            accent
          />
        )
      ) : (
        <div
          className="rounded-2xl p-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            Rest day today — recovery is training too.
          </p>
        </div>
      )}

      {/* Next run */}
      {nextRun && (
        <TodayCard
          title={`Next Run: Week ${nextRun.program_week}`}
          subtitle={nextRun.target_description.slice(0, 60) + "…"}
          icon={<Wind size={20} style={{ color: "#60a5fa" }} />}
          href="/running"
        />
      )}

      {/* VO2 max scheduling heads-up for the current running week */}
      {vo2ThisWeek && (
        <div className="rounded-2xl p-3 flex gap-2"
          style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "#f59e0b" }} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            <span className="font-semibold" style={{ color: "#f59e0b" }}>This week has a VO₂ max run.</span>{" "}
            {runHint.haveSchedule ? (
              <>
                Best on a rest day
                {runHint.restShort && <> (<span className="font-semibold">{runHint.restShort}</span>)</>}
                {runHint.avoidShort && <>, and off <span className="font-semibold">{runHint.avoidShort}</span> (around your squat day)</>}.
                Leave ~48h between heavy squats and hard running.
              </>
            ) : (
              <>Do it on a rest day, away from your heavy squat day and the day before.</>
            )}
          </p>
        </div>
      )}

      {/* Today's nutrition */}
      <NutritionCard
        food={nutFood}
        supp={nutSupp}
        targets={nutTargets}
        hasEntries={nutHasEntries}
        trainingDay={!!todayWorkout}
        heavyLegs={todayWorkout?.label?.includes("Squat") ?? false}
      />

      {/* Morning weigh-in + today's steps */}
      <WeightCard onStepsLogged={() => setNutRefresh((k) => k + 1)} />

      {/* Reminder: yesterday's steps were never entered */}
      <StepsBackfillCard onLogged={() => setNutRefresh((k) => k + 1)} />

      {/* This week overview */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} style={{ color: "var(--muted)" }} />
          <span className="text-sm font-semibold">This Week</span>
        </div>
        <div className="space-y-2">
          {weekWorkouts.map((w) => {
            const done = doneThisWeek(w);
            return (
              <Link
                key={w.id}
                href={`/strength/workout/${w.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-xl transition-all active:opacity-70"
                style={{ background: w.day_of_week === todayKey ? "var(--accent-dim)" : "var(--surface-2)" }}
              >
                <div className="flex items-center gap-3">
                  {done
                    ? <Check size={15} strokeWidth={3} style={{ color: "#10b981" }} />
                    : <Dumbbell size={15} style={{ color: w.day_of_week === todayKey ? "var(--accent)" : "var(--muted)" }} />}
                  <div>
                    <p className="text-sm font-medium">{DAY_NAMES[w.day_of_week]}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{w.label}</p>
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: "var(--muted)" }} />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick access modules */}
      <div className="grid grid-cols-3 gap-3">
        <QuickCard href="/stretching" icon={<PersonStanding size={24} style={{ color: "#a78bfa" }} />} label="Stretch" />
        <QuickCard href="/analytics" icon={<Flame size={24} style={{ color: "var(--warning)" }} />} label="Progress" />
        <QuickCard href="/settings" icon={<span className="text-xl">⚙️</span>} label="Settings" />
      </div>
    </div>
  );
}

function NutritionCard({
  food, supp, targets, hasEntries, trainingDay, heavyLegs,
}: {
  food: NutrientSnapshot;
  supp: Record<string, number>;
  targets: NutrientTarget[];
  hasEntries: boolean;
  trainingDay: boolean;
  heavyLegs: boolean;
}) {
  const tMap = targetMap(targets);
  // The three most behavior-relevant Tier 1 metrics for an at-a-glance card.
  const keys = ["calories", "protein_g", "net_carbs_g"];

  const proteinDef = NUTRIENT_MAP["protein_g"];
  const proteinTarget = tMap["protein_g"]?.target_amount ?? proteinDef.defaultTarget;
  const proteinTotal = (food["protein_g"] ?? 0) + (supp["protein_g"] ?? 0);
  const proteinLeft = Math.max(0, Math.round(proteinTarget - proteinTotal));

  return (
    <Link
      href="/nutrition"
      className="block rounded-2xl p-4 transition-all active:scale-98"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Utensils size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold">Today&apos;s Nutrition</span>
        </div>
        <div className="flex items-center gap-2">
          {trainingDay && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
              <Dumbbell size={11} /> Training day
            </span>
          )}
          <ChevronRight size={16} style={{ color: "var(--muted)" }} />
        </div>
      </div>

      {hasEntries ? (
        <div className="space-y-1">
          {keys.map((key) => {
            const def = NUTRIENT_MAP[key];
            const t = tMap[key];
            const enforce = key === "net_carbs_g" ? t?.enabled !== false : true;
            return (
              <NutrientBar
                key={key}
                label={def.label}
                unit={def.unit}
                food={food[key] ?? null}
                supplement={supp[key] ?? 0}
                target={t?.target_amount ?? def.defaultTarget}
                direction={t?.direction ?? def.direction}
                enforce={enforce}
                compact
              />
            );
          })}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No food logged yet today — tap to start tracking.
        </p>
      )}

      {/* Protein-vs-training nudge */}
      {trainingDay && (
        <div className="mt-3 pt-3 flex gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          <Dumbbell size={14} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {heavyLegs ? (
              <><span className="font-semibold" style={{ color: "var(--accent)" }}>Heavy legs today.</span>{" "}
                Protein and enough carbs aid recovery — </>
            ) : (
              <><span className="font-semibold" style={{ color: "var(--accent)" }}>Strength day.</span>{" "}
                Prioritise protein — </>
            )}
            {proteinLeft > 0
              ? <><span className="font-semibold" style={{ color: "var(--foreground)" }}>{proteinLeft} g</span> to your target.</>
              : <>target hit. 💪</>}
          </p>
        </div>
      )}
    </Link>
  );
}

// Daily check-in: weight + steps. Each row is a clear binary — a green ✓ with
// the saved value once today's entry exists, or the input while it doesn't —
// so there's never doubt about whether today is registered.
function WeightCard({ onStepsLogged }: { onStepsLogged: () => void }) {
  const today = todayISO();
  const [weights, setWeights] = useState<BodyWeight[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [stepsInput, setStepsInput] = useState("");
  const [stepsSaved, setStepsSaved] = useState<number | null>(null);
  const [stepsSaving, setStepsSaving] = useState(false);
  const [editingSteps, setEditingSteps] = useState(false);

  useEffect(() => {
    fetch("/api/nutrition/weight")
      .then((r) => r.json())
      .then((d) => setWeights(Array.isArray(d) ? d : []))
      .catch(() => setWeights([]));
    fetch(`/api/nutrition/steps?start=${today}&end=${today}`)
      .then((r) => r.json())
      .then((d) => {
        const entry = Array.isArray(d) ? d[0] : null;
        if (entry) setStepsSaved(entry.steps);
      })
      .catch(() => {});
  }, [today]);

  const trend = weightTrend(weights.map((w) => ({ date: w.date, weight_kg: Number(w.weight_kg) })));
  const todayWeight = weights.find((w) => w.date === today);

  // Accept both "90.5" and "90,5" — Danish keyboards produce a comma.
  const kg = Number(input.replace(",", "."));

  async function log() {
    if (!kg || kg <= 0) return;
    setSaving(true);
    const res = await fetch("/api/nutrition/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weight_kg: kg, date: today }),
    });
    setSaving(false);
    if (res.ok) {
      const saved = await res.json();
      setWeights((prev) => {
        const others = prev.filter((w) => w.date !== saved.date);
        return [...others, saved].sort((a, b) => a.date.localeCompare(b.date));
      });
      setInput("");
      setEditingWeight(false);
    }
  }

  const steps = parseInt(stepsInput, 10);
  const stepsValid = Number.isInteger(steps) && steps >= 0;

  async function logSteps() {
    if (!stepsValid || stepsSaving) return;
    setStepsSaving(true);
    const res = await fetch("/api/nutrition/steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, date: today }),
    });
    setStepsSaving(false);
    if (res.ok) {
      setStepsSaved(steps);
      setEditingSteps(false);
      onStepsLogged();
    }
  }

  const delta = trend.weeklyDelta;
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold">Daily Check-in</span>
        </div>
        {trend.current != null && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">{trend.current.toFixed(1)} kg</span>
            {delta != null && delta !== 0 && (
              <span className="flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--surface-2)",
                  color: delta < 0 ? "var(--accent)" : "var(--warning)",
                }}>
                {delta < 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                {Math.abs(delta).toFixed(1)}/wk
              </span>
            )}
          </div>
        )}
      </div>

      {trend.current == null && (
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          Log your weight to track your trend (7-day average).
        </p>
      )}

      {/* Weight — morning weigh-in */}
      {todayWeight && !editingWeight ? (
        <DoneRow
          label="Weight"
          value={`${Number(todayWeight.weight_kg).toFixed(1)} kg`}
          onEdit={() => {
            setInput(String(todayWeight.weight_kg));
            setEditingWeight(true);
          }}
        />
      ) : (
        <div className="flex gap-2">
          <input
            type="text" inputMode="decimal" value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Today's weight (kg)"
            className="flex-1 h-11 px-3 rounded-xl text-sm outline-none"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
          <button onClick={log} disabled={saving || !kg || kg <= 0}
            className="px-5 rounded-xl font-semibold text-sm disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#06281f" }}>
            {saving ? "…" : "Log"}
          </button>
        </div>
      )}

      {/* Today's steps — feeds the activity-adjusted calorie target */}
      <div className="mt-2">
        {stepsSaved != null && !editingSteps ? (
          <DoneRow
            label="Steps"
            value={stepsSaved.toLocaleString("en-GB")}
            onEdit={() => {
              setStepsInput(String(stepsSaved));
              setEditingSteps(true);
            }}
          />
        ) : (
          <div className="flex gap-2">
            <input
              type="text" inputMode="numeric" value={stepsInput}
              onChange={(e) => setStepsInput(e.target.value.replace(/\D/g, ""))}
              placeholder="Today's steps"
              className="flex-1 h-11 px-3 rounded-xl text-sm outline-none tabular-nums"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
            />
            <button onClick={logSteps}
              disabled={stepsSaving || !stepsValid || steps === stepsSaved}
              className="px-5 rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#06281f" }}>
              {stepsSaving ? "…" : "Log"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Reminder card that only exists while yesterday has no steps entry — a
// missed day is neutral in the calorie redistribution, but a backfilled one
// makes the trailing window (and today's target) more accurate.
function StepsBackfillCard({ onLogged }: { onLogged: () => void }) {
  const yesterday = shiftDate(todayISO(), -1);
  const [missing, setMissing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/nutrition/steps?start=${yesterday}&end=${yesterday}`)
      .then((r) => r.json())
      .then((d) => setMissing(!(Array.isArray(d) && d.length > 0)))
      .catch(() => {});
  }, [yesterday]);

  const steps = parseInt(input, 10);
  const valid = Number.isInteger(steps) && steps >= 0;

  async function log() {
    if (!valid || saving) return;
    setSaving(true);
    const res = await fetch("/api/nutrition/steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, date: yesterday }),
    });
    setSaving(false);
    if (res.ok) {
      setMissing(false);
      onLogged();
    }
  }

  if (!missing) return null;

  const dayLabel = new Date(yesterday + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
  return (
    <div className="rounded-2xl p-4"
      style={{ background: "var(--surface)", border: "1px solid rgba(245,158,11,0.35)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Footprints size={16} style={{ color: "#f59e0b" }} />
        <span className="text-sm font-semibold">Yesterday&apos;s steps missing</span>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        {dayLabel} has no step count yet — check your phone and fill it in.
      </p>
      <div className="flex gap-2">
        <input
          type="text" inputMode="numeric" value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
          placeholder={`Steps for ${dayLabel}`}
          className="flex-1 h-11 px-3 rounded-xl text-sm outline-none tabular-nums"
          style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        />
        <button onClick={log} disabled={saving || !valid}
          className="px-5 rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#06281f" }}>
          {saving ? "…" : "Log"}
        </button>
      </div>
    </div>
  );
}

// A registered-today row: green check + value, with an Edit affordance.
function DoneRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between h-11 px-3 rounded-xl"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2">
        <Check size={15} strokeWidth={3} style={{ color: "#10b981" }} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tabular-nums">{value}</span>
        <button onClick={onEdit} className="text-xs font-semibold px-1 py-2"
          style={{ color: "var(--muted)" }}>
          Edit
        </button>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function TodayCard({ title, subtitle, icon, href, accent }: {
  title: string; subtitle: string; icon: React.ReactNode; href: string; accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-4 rounded-2xl transition-all active:scale-98"
      style={{
        background: accent ? "var(--accent-dim)" : "var(--surface)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-2)" }}>
          {icon}
        </div>
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{subtitle}</p>
        </div>
      </div>
      <ChevronRight size={18} style={{ color: "var(--muted)" }} />
    </Link>
  );
}

function QuickCard({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl transition-all active:scale-95"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {icon}
      <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</span>
    </Link>
  );
}
