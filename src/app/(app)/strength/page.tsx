"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, Home, ChevronRight, Play, Trophy } from "lucide-react";
import type { PlannedWorkout } from "@/types";

const DAY_NAMES: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};
const TODAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export default function StrengthPage() {
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workouts")
      .then((r) => r.json())
      .then((data) => setWorkouts(data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const todayKey = TODAY_KEYS[new Date().getDay()];

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

      <div className="space-y-3">
        {workouts.map((w) => {
          const isToday = w.day_of_week === todayKey;
          const exCount = w.planned_exercises?.length ?? 0;
          return (
            <Link
              key={w.id}
              href={`/strength/workout/${w.id}`}
              className="flex items-center justify-between p-4 rounded-2xl transition-all active:scale-98"
              style={{
                background: isToday ? "var(--accent-dim)" : "var(--surface)",
                border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: w.is_home_workout ? "#10b98122" : "var(--surface-2)" }}>
                  {isToday
                    ? <Play size={18} style={{ color: w.is_home_workout ? "#10b981" : "var(--accent)" }} />
                    : w.is_home_workout
                      ? <Home size={16} style={{ color: "#10b981" }} />
                      : <Dumbbell size={16} style={{ color: "var(--muted)" }} />
                  }
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{w.label}</p>
                    {isToday && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: w.is_home_workout ? "#10b981" : "var(--accent)", color: "#fff" }}>TODAY</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {DAY_NAMES[w.day_of_week]} · {exCount} exercises
                  </p>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--muted)" }} />
            </Link>
          );
        })}
      </div>

      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <Trophy size={18} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Hit all reps at the top of the range → weight goes up next session. Every 4th week is a deload — trust the process.
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
