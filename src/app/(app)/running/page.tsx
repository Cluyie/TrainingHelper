"use client";

import { useEffect, useState } from "react";
import { Wind, CheckCircle2, Circle, ChevronRight, Clock, AlertTriangle } from "lucide-react";
import type { RunningSession, PlannedWorkout } from "@/types";
import { getRunSchedulingHint } from "@/lib/run-schedule";
import Link from "next/link";

const TYPE_COLORS: Record<string, string> = {
  easy: "#60a5fa",
  interval: "var(--accent)",
  long: "#f59e0b",
  unstructured: "#a3a3a3",
};

const TYPE_LABELS: Record<string, string> = {
  easy: "Easy Run",
  interval: "Intervals",
  long: "Long Run",
  unstructured: "Easy / Unstructured",
};

export default function RunningPage() {
  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/running").then((r) => r.json()),
      // Strength schedule — used to advise where to slot the VO2 run each interval week.
      fetch("/api/workouts").then((r) => r.json()).catch(() => []),
    ])
      .then(([runData, workoutData]: [RunningSession[], PlannedWorkout[]]) => {
        setSessions(runData ?? []);
        setWorkouts(workoutData ?? []);
        // Auto-expand the current week (first incomplete week)
        const firstIncomplete = runData?.find((s) => !s.completed);
        if (firstIncomplete) setExpandedWeek(firstIncomplete.program_week);
      })
      .finally(() => setLoading(false));
  }, []);

  // Scheduling guidance for hard intervals, derived from the strength week.
  const { haveSchedule, restShort, avoidShort } = getRunSchedulingHint(workouts);

  // Group by week
  const weeks = sessions.reduce<Record<number, RunningSession[]>>((acc, s) => {
    if (!acc[s.program_week]) acc[s.program_week] = [];
    acc[s.program_week].push(s);
    return acc;
  }, {});

  // Optional (unstructured) sessions never block week completion — they carry no
  // progression pressure and can be skipped freely.
  const weekDone = (ss: RunningSession[]) => ss.filter((s) => !s.optional).every((s) => s.completed);

  const weekNumbers = Object.keys(weeks).map(Number).sort((a, b) => a - b);
  const completedWeeks = weekNumbers.filter((w) => weekDone(weeks[w]));
  const currentWeek = weekNumbers.find((w) => !weekDone(weeks[w])) ?? weekNumbers[weekNumbers.length - 1];

  if (loading) return <Loader />;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <Wind size={22} style={{ color: "#60a5fa" }} />
        <h1 className="text-xl font-bold">Running</h1>
      </div>

      {/* Progress bar */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold">16-Week Programme</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Week {currentWeek} of 16
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(completedWeeks.length / 16) * 100}%`, background: "#60a5fa" }}
          />
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Zone 2 focus — stay at a conversational pace. Build the aerobic engine.
        </p>
      </div>

      {/* Weeks */}
      <div className="space-y-2">
        {weekNumbers.map((week) => {
          const wSessions = weeks[week];
          const allDone = weekDone(wSessions);
          const requiredCount = wSessions.filter((s) => !s.optional).length;
          const isCurrent = week === currentWeek;
          const isOpen = expandedWeek === week;

          return (
            <div key={week}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "var(--surface)",
                border: `1px solid ${isCurrent ? "#60a5fa" : "var(--border)"}`,
              }}>
              <button
                onClick={() => setExpandedWeek(isOpen ? null : week)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  {allDone
                    ? <CheckCircle2 size={18} style={{ color: "var(--accent)" }} />
                    : <Circle size={18} style={{ color: isCurrent ? "#60a5fa" : "var(--border)" }} />
                  }
                  <div className="text-left">
                    <p className="font-semibold text-sm">
                      Week {week}
                      {isCurrent && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: "#1d4ed8", color: "#93c5fd" }}>CURRENT</span>}
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {wSessions.filter((s) => !s.optional && s.completed).length} / {requiredCount} sessions
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} style={{
                  color: "var(--muted)",
                  transform: isOpen ? "rotate(90deg)" : "none",
                  transition: "transform 0.2s",
                }} />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-2">
                  {wSessions.some((s) => s.type === "interval") && (
                    <div className="rounded-xl p-3 flex gap-2"
                      style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)" }}>
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#f59e0b" }} />
                      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                        <span className="font-semibold" style={{ color: "#f59e0b" }}>VO₂ max week.</span>{" "}
                        {haveSchedule ? (
                          <>
                            Best done on a rest day
                            {restShort && <> (<span className="font-semibold">{restShort}</span>)</>}.
                            {avoidShort && (
                              <> Keep it off <span className="font-semibold">{avoidShort}</span> — that&apos;s around your
                                heavy squat day. Leave ~48h between heavy squats and hard running.</>
                            )}
                          </>
                        ) : (
                          <>Do it on a rest day, and keep it off your heavy squat day and the day before — leave ~48h
                            between heavy squats and hard running.</>
                        )}
                      </p>
                    </div>
                  )}
                  {wSessions.map((s) => (
                    <div key={s.id}
                      className="rounded-xl p-3"
                      style={{ background: "var(--surface-2)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full"
                            style={{ background: TYPE_COLORS[s.type] }} />
                          <span className="text-xs font-semibold"
                            style={{ color: TYPE_COLORS[s.type] }}>
                            {TYPE_LABELS[s.type]}
                          </span>
                          {s.optional && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                              style={{ background: "var(--surface)", color: "var(--muted)" }}>
                              OPTIONAL
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={11} style={{ color: "var(--muted)" }} />
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            {s.target_duration_min} min
                          </span>
                        </div>
                      </div>
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
                        {s.target_description}
                      </p>
                      {s.completed ? (
                        <div className="mt-2 flex items-center gap-1">
                          <CheckCircle2 size={12} style={{ color: "var(--accent)" }} />
                          <span className="text-xs" style={{ color: "var(--accent)" }}>
                            Completed
                            {s.actual_duration_min && ` · ${s.actual_duration_min} min`}
                            {s.actual_distance_km && ` · ${s.actual_distance_km}km`}
                          </span>
                        </div>
                      ) : (
                        <Link
                          href={`/running/log?session_id=${s.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
                          style={{ background: "#1d4ed8", color: "#93c5fd" }}
                        >
                          Log this run
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "#60a5fa", borderTopColor: "transparent" }} />
    </div>
  );
}
