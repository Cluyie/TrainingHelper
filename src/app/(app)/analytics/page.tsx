"use client";

import { useEffect, useState } from "react";
import { BarChart2, TrendingUp, Wind, Calendar } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";
import type { Exercise, WorkoutSet, RunningSession } from "@/types";

interface SetWithDate extends WorkoutSet {
  session: { date: string };
}

interface WeeklyData {
  week: string;
  sessions: number;
}

export default function AnalyticsPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  const [exerciseSets, setExerciseSets] = useState<SetWithDate[]>([]);
  const [runningSessions, setRunningSessions] = useState<RunningSession[]>([]);
  const [consistency, setConsistency] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"strength" | "running" | "consistency">("strength");

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics?type=exercises_list").then((r) => r.json()),
      fetch("/api/analytics?type=running").then((r) => r.json()),
      fetch("/api/analytics?type=consistency").then((r) => r.json()),
    ]).then(([exList, runs, cons]) => {
      setExercises(exList ?? []);
      setRunningSessions(runs ?? []);

      // Build weekly consistency data
      const weekMap = new Map<string, number>();
      for (const s of (cons ?? [])) {
        const d = new Date(s.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
      }
      setConsistency(Array.from(weekMap.entries()).map(([week, sessions]) => ({ week, sessions })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedExId) return;
    fetch(`/api/analytics?type=exercise&exercise_id=${selectedExId}`)
      .then((r) => r.json())
      .then(setExerciseSets);
  }, [selectedExId]);

  // Build chart data for selected exercise (max weight per session)
  const strengthChartData = (() => {
    const byDate = new Map<string, number>();
    for (const s of exerciseSets) {
      const date = s.session?.date ?? "";
      if (!date) continue;
      const current = byDate.get(date) ?? 0;
      if (s.weight_kg > current) byDate.set(date, s.weight_kg);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, weight]) => ({
        date: new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        weight,
      }));
  })();

  // Running chart data
  const runningChartData = runningSessions
    .filter((s) => s.actual_duration_min != null && s.date)
    .map((s) => ({
      date: new Date(s.date!).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      duration: s.actual_duration_min,
      distance: s.actual_distance_km ?? null,
    }));

  if (loading) return <Loader />;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <BarChart2 size={22} style={{ color: "var(--warning)" }} />
        <h1 className="text-xl font-bold">Progress</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--surface)" }}>
        {(["strength", "running", "consistency"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize"
            style={{
              background: tab === t ? "var(--surface-2)" : "transparent",
              color: tab === t ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Strength Tab */}
      {tab === "strength" && (
        <div className="space-y-4">
          {exercises.length === 0 ? (
            <EmptyState icon={<TrendingUp size={32} style={{ color: "var(--muted)" }} />}
              message="Log some workouts to see strength progress here." />
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--muted)" }}>SELECT EXERCISE</p>
                <div className="flex flex-col gap-1.5">
                  {exercises.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setSelectedExId(ex.id)}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
                      style={{
                        background: selectedExId === ex.id ? "var(--accent-dim)" : "var(--surface)",
                        border: `1px solid ${selectedExId === ex.id ? "var(--accent)" : "var(--border)"}`,
                        color: selectedExId === ex.id ? "var(--accent)" : "var(--foreground)",
                        fontWeight: selectedExId === ex.id ? 600 : 400,
                      }}
                    >
                      {ex.name}
                    </button>
                  ))}
                </div>
              </div>

              {selectedExId && (
                <div className="rounded-2xl p-4"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold mb-4" style={{ color: "var(--muted)" }}>
                    WEIGHT OVER TIME (kg)
                  </p>
                  {strengthChartData.length < 2 ? (
                    <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
                      Need at least 2 sessions to show a trend.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={strengthChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                        <Tooltip
                          contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}
                          labelStyle={{ color: "var(--muted)", fontSize: 11 }}
                          itemStyle={{ color: "var(--accent)" }}
                        />
                        <Line
                          type="monotone" dataKey="weight"
                          stroke="var(--accent)" strokeWidth={2.5}
                          dot={{ fill: "var(--accent)", r: 4 }}
                          activeDot={{ r: 6 }}
                          name="Weight (kg)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Running Tab */}
      {tab === "running" && (
        <div className="space-y-4">
          {runningChartData.length === 0 ? (
            <EmptyState icon={<Wind size={32} style={{ color: "var(--muted)" }} />}
              message="Log some runs to see your progress here." />
          ) : (
            <div className="rounded-2xl p-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold mb-4" style={{ color: "var(--muted)" }}>
                RUN DURATION (minutes)
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={runningChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}
                    labelStyle={{ color: "var(--muted)", fontSize: 11 }}
                    itemStyle={{ color: "#60a5fa" }}
                  />
                  <Bar dataKey="duration" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Duration (min)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Running stats */}
          {runningSessions.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Runs completed"
                value={String(runningSessions.filter((s) => s.completed).length)}
              />
              <StatCard
                label="Total km run"
                value={`${runningSessions
                  .filter((s) => s.actual_distance_km)
                  .reduce((sum, s) => sum + (s.actual_distance_km ?? 0), 0)
                  .toFixed(1)}km`}
              />
            </div>
          )}
        </div>
      )}

      {/* Consistency Tab */}
      {tab === "consistency" && (
        <div className="space-y-4">
          {consistency.length === 0 ? (
            <EmptyState icon={<Calendar size={32} style={{ color: "var(--muted)" }} />}
              message="Complete some workouts to see your weekly consistency." />
          ) : (
            <div className="rounded-2xl p-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold mb-4" style={{ color: "var(--muted)" }}>
                SESSIONS PER WEEK
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={consistency}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}
                    itemStyle={{ color: "var(--warning)" }}
                  />
                  <Bar dataKey="sessions" fill="var(--warning)" radius={[4, 4, 0, 0]} name="Sessions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-4 text-center"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {icon}
      <p className="text-sm" style={{ color: "var(--muted)" }}>{message}</p>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--warning)", borderTopColor: "transparent" }} />
    </div>
  );
}
