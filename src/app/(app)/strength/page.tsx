"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, ChevronRight, Play, Trophy, Check, Wind } from "lucide-react";
import type { PlannedWorkout, WorkoutSession } from "@/types";
import { todayISO } from "@/lib/nutrition-client";
import { PROGRAM, targetRir } from "@/lib/program-generator";

const DAY_NAMES: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};
const TODAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const BLOCK_WEEKS = 6;

export default function StrengthPage() {
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<{ weekInBlock: number; isDeload: boolean } | null>(null);
  const [deloading, setDeloading] = useState(false);

  useEffect(() => {
    fetch("/api/workouts")
      .then((r) => r.json())
      .then((data) => setWorkouts(data ?? []))
      .finally(() => setLoading(false));
    fetch("/api/strength/cycle")
      .then((r) => r.json())
      .then((s) => setCycle(s && typeof s.weekInBlock === "number" ? s : null))
      .catch(() => setCycle(null));
    fetch("/api/sessions?limit=20")
      .then((r) => r.json())
      .then((d) => setSessions(Array.isArray(d) ? d : []))
      .catch(() => setSessions([]));
  }, []);

  async function takeDeload() {
    if (!window.confirm("Start a deload week now? Working sets roughly halve, loads drop ~12.5%, everything stays at 4+ RIR, and a fresh 6-week block begins afterwards.")) return;
    setDeloading(true);
    try {
      const res = await fetch("/api/strength/cycle", { method: "POST" });
      const s = await res.json();
      if (s && typeof s.weekInBlock === "number") setCycle(s);
    } finally {
      setDeloading(false);
    }
  }

  const todayKey = TODAY_KEYS[new Date().getDay()];
  const today = todayISO();

  // A workout is "done today" when a completed session from today links to it.
  // Fallback: a session with a null plan link (the program was regenerated after
  // logging — the FK is set null) still marks today's card as done.
  const completedToday = sessions.filter((s) => s.date === today && s.completed_at);
  const doneToday = (w: PlannedWorkout) =>
    completedToday.some(
      (s) => s.planned_workout_id === w.id ||
        (s.planned_workout_id == null && w.day_of_week === todayKey)
    );

  if (loading) return <Loader />;

  if (workouts.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
        <Dumbbell size={40} className="mx-auto" style={{ color: "var(--muted)" }} />
        <p style={{ color: "var(--muted)" }}>No program yet. Go to Settings to generate your program.</p>
        <Link href="/settings"
          className="inline-block px-6 py-3 rounded-xl font-semibold text-sm"
          style={{ background: "var(--accent)", color: "#fff" }}>
          Go to Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <Dumbbell size={22} style={{ color: "var(--accent)" }} />
        <h1 className="text-xl font-bold">Strength Training</h1>
      </div>

      {/* Where you are — always visible: block week and the week's effort target. */}
      {cycle && (
        <div className="rounded-2xl p-4 flex items-center justify-between"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <span className="text-sm font-semibold">Week {cycle.weekInBlock} of {BLOCK_WEEKS}</span>
          <span className="text-xs font-semibold px-2 py-1 rounded-lg"
            style={cycle.isDeload
              ? { background: "#f59e0b22", color: "#b45309" }
              : { background: "var(--surface-2)", color: "var(--muted)" }}>
            {cycle.isDeload ? "DELOAD" : targetRir("compound", cycle.weekInBlock)?.label}
          </span>
        </div>
      )}

      {/* The stored program doesn't match the current week (older program, or the days
          have moved) — it needs regenerating. */}
      {workouts.length > 0 &&
        !workouts.every((w) => PROGRAM.some((d) => d.day === w.day_of_week && d.label === w.label)) && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: "#f59e0b1a", color: "#b45309" }}>
          Your stored program is out of date. Open Settings and tap “Save &amp; Generate Program” to switch to the current week.
        </p>
      )}

      <div className="space-y-3">
        {workouts.map((w) => {
          const isToday = w.day_of_week === todayKey;
          const done = doneToday(w);
          const exCount = w.planned_exercises?.length ?? 0;
          const zone2 = PROGRAM.find((d) => d.day === w.day_of_week && d.label === w.label)?.zone2After;
          return (
            <Link
              key={w.id}
              href={`/strength/workout/${w.id}`}
              className="flex items-center justify-between p-4 rounded-2xl transition-all active:scale-98"
              style={{
                background: done ? "#10b9811a" : isToday ? "var(--accent-dim)" : "var(--surface)",
                border: `1px solid ${done ? "#10b98155" : isToday ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: done ? "#10b98122" : "var(--surface-2)" }}>
                  {done
                    ? <Check size={18} strokeWidth={3} style={{ color: "#10b981" }} />
                    : isToday
                      ? <Play size={18} style={{ color: "var(--accent)" }} />
                      : <Dumbbell size={16} style={{ color: "var(--muted)" }} />
                  }
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{w.label}</p>
                    {done ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: "#10b981", color: "#fff" }}>DONE ✓</span>
                    ) : isToday && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: "var(--accent)", color: "#fff" }}>TODAY</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--muted)" }}>
                    {DAY_NAMES[w.day_of_week]} · {exCount} exercises
                    {zone2 && <><span>·</span><Wind size={11} style={{ color: "#60a5fa" }} /> then Zone 2</>}
                  </p>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--muted)" }} />
            </Link>
          );
        })}
      </div>

      {/* Training block / deload control */}
      {cycle && (
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Training block</span>
            <span className="text-xs px-2 py-1 rounded-lg"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              Week {cycle.weekInBlock} of {BLOCK_WEEKS}
            </span>
          </div>
          {cycle.isDeload ? (
            <p className="text-xs flex items-center gap-2" style={{ color: "#b45309" }}>
              🔄 Deload week — about half the working sets, ~12.5% lighter, 4+ RIR. Power keeps
              its movements at lower volume. Not a test week — a fresh block starts next week.
            </p>
          ) : (
            <>
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                Weeks 1–5 progress (RIR ~3 → 1–2), week 6 is an automatic deload. Feeling beat up?
                Take one early — a fresh block starts afterwards.
              </p>
              <button onClick={takeDeload} disabled={deloading}
                className="w-full h-11 rounded-xl font-semibold text-sm active:scale-95 disabled:opacity-50"
                style={{ background: "#f59e0b22", color: "#b45309" }}>
                {deloading ? "…" : "Take a deload now"}
              </button>
            </>
          )}
        </div>
      )}

      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <Trophy size={18} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Double progression: when every set reaches the top of the rep range at the planned
          RIR with clean form, the load goes up next time. Top of the range at a lower RIR
          than planned, or with form/speed flagged, repeats the load instead. Power work
          never progresses by load — only by height, distance and speed.
        </p>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
    </div>
  );
}
