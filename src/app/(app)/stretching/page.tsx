"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PersonStanding, ChevronRight, Clock } from "lucide-react";
import type { StretchingRoutine, UserSettings } from "@/types";

// Rotation: week number → routine indices (0-based) to use
function getRoutinesForWeek(weekNum: number, routines: StretchingRoutine[]): StretchingRoutine[] {
  const total = routines.length; // should be 6
  if (total === 0) return [];
  const startIdx = (weekNum - 1) % total;
  return [
    routines[startIdx % total],
    routines[(startIdx + 1) % total],
    routines[(startIdx + 2) % total],
  ];
}

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

export default function StretchingPage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<StretchingRoutine[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/stretching?routines=1").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([r, s]) => {
      setRoutines(r ?? []);
      setSettings(s);
      setLoading(false);
    });
  }, []);

  async function startSession(routineId: string) {
    const res = await fetch("/api/stretching", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routine_id: routineId }),
    });
    const session = await res.json();
    router.push(`/stretching/session?session_id=${session.id}&routine_id=${routineId}`);
  }

  if (loading) return <Loader />;

  const weekNum = getWeekNumber();
  const weekRoutines = getRoutinesForWeek(weekNum, routines);
  const duration = settings?.stretching_duration_min ?? 25;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <PersonStanding size={22} style={{ color: "#a78bfa" }} />
        <h1 className="text-xl font-bold">Stretching & Yoga</h1>
      </div>

      <div className="rounded-2xl p-3 flex items-center justify-between"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <span className="text-sm" style={{ color: "var(--muted)" }}>This week's routines</span>
        <span className="text-xs px-2 py-1 rounded-lg"
          style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
          Week {weekNum}
        </span>
      </div>

      {/* This week's 3 routines */}
      <div className="space-y-3">
        {weekRoutines.map((routine, i) => {
          const exercises = routine.stretching_routine_exercises ?? [];
          return (
            <div key={routine.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{routine.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{routine.focus}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock size={12} style={{ color: "var(--muted)" }} />
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{duration} min</span>
                  </div>
                </div>

                {/* Exercise list preview */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {exercises.map((re) => (
                    <span key={re.id}
                      className="text-[10px] px-2 py-0.5 rounded-md"
                      style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                      {re.stretching_exercise?.name ?? ""}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => startSession(routine.id)}
                  className="mt-4 w-full h-11 rounded-xl font-semibold text-sm transition-all active:scale-95"
                  style={{ background: "#4c1d95", color: "#c4b5fd" }}
                >
                  Start Session
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* All routines (collapsed) */}
      <div>
        <p className="text-xs font-semibold mb-3" style={{ color: "var(--muted)" }}>ALL ROUTINES</p>
        <div className="space-y-2">
          {routines.map((routine) => (
            <button
              key={routine.id}
              onClick={() => startSession(routine.id)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all active:scale-98"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="text-left">
                <p className="text-sm font-medium">{routine.name}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{routine.focus}</p>
              </div>
              <ChevronRight size={16} style={{ color: "var(--muted)" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "#a78bfa", borderTopColor: "transparent" }} />
    </div>
  );
}
