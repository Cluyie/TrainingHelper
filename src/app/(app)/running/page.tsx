"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wind, Plus, Clock, Heart } from "lucide-react";
import type { RunningSession } from "@/types";

// Running is a log, not a plan: record what you ran, see it over time. Monday and
// Thursday Zone 2 (after strength) and Saturday's run are the week's frame, but
// nothing here schedules or prescribes them.

const RUN_TYPE_LABELS: Record<string, string> = {
  easy: "Zone 2",
  long: "Long / easy",
  interval: "Intervals / hard",
  unstructured: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  easy: "#60a5fa",
  long: "#f59e0b",
  interval: "var(--accent)",
  unstructured: "#a3a3a3",
};

interface BlockState {
  weekInBlock: number;
  blockWeeks: number;
  isDeload: boolean;
}

function pace(min: number | null, km: number | null): string | null {
  if (!min || !km) return null;
  const secPerKm = Math.round((min * 60) / km);
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, "0")} /km`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function RunningPage() {
  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [block, setBlock] = useState<BlockState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/running").then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch("/api/running/week").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([res, b]) => {
        if (!res.ok || !Array.isArray(res.body)) setError(res.body?.error ?? "Could not load your runs.");
        else setRuns(res.body);
        setBlock(b);
      })
      .catch(() => setError("Could not load your runs."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  // Last 7 days, by local date.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoISO = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, "0")}-${String(weekAgo.getDate()).padStart(2, "0")}`;
  const recent = runs.filter((r) => r.date && r.date >= weekAgoISO);
  const recentMin = recent.reduce((s, r) => s + (r.actual_duration_min ?? 0), 0);
  const recentKm = recent.reduce((s, r) => s + Number(r.actual_distance_km ?? 0), 0);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wind size={22} style={{ color: "#60a5fa" }} />
          <h1 className="text-xl font-bold">Running</h1>
        </div>
        <Link href="/running/log"
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl active:scale-95"
          style={{ background: "#1d4ed8", color: "#dbeafe" }}>
          <Plus size={15} /> Log a run
        </Link>
      </div>

      <div className="rounded-2xl p-4 space-y-2"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-semibold">Last 7 days</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {recent.length} run{recent.length === 1 ? "" : "s"} · {recentMin} min
            {recentKm > 0 && ` · ${recentKm.toFixed(1)} km`}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          The week&apos;s frame: the hard run on Monday, Zone 2 after strength on Thursday and
          Saturday, Sunday fully off. Nothing here is scheduled — log what you actually ran.
        </p>
        {block?.isDeload && (
          <div className="rounded-xl p-3"
            style={{ background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.30)" }}>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              <span className="font-semibold" style={{ color: "#60a5fa" }}>Strength deload week.</span>{" "}
              Keep this week&apos;s runs slow — Monday&apos;s hard run included — and a little shorter,
              so the whole body recovers together.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm rounded-xl px-3 py-2" style={{ background: "#ef44441a", color: "#ef4444" }}>
          {error}
        </p>
      )}

      <div className="space-y-2">
        {runs.map((r) => {
          const p = pace(r.actual_duration_min, r.actual_distance_km ? Number(r.actual_distance_km) : null);
          return (
            <div key={r.id} className="rounded-xl p-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[r.type] ?? "#a3a3a3" }} />
                  <span className="text-sm font-semibold">{formatDate(r.date)}</span>
                  <span className="text-xs" style={{ color: TYPE_COLORS[r.type] ?? "var(--muted)" }}>
                    {RUN_TYPE_LABELS[r.type] ?? r.type}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                  <Clock size={11} /> {r.actual_duration_min ?? "—"} min
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
                {r.actual_distance_km != null && <span>{Number(r.actual_distance_km)} km</span>}
                {p && <span>{p}</span>}
                {r.avg_hr != null && (
                  <span className="inline-flex items-center gap-1"><Heart size={10} /> avg {r.avg_hr}</span>
                )}
                {r.rpe != null && <span>RPE {r.rpe}</span>}
              </div>
              {r.notes && (
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--muted)" }}>{r.notes}</p>
              )}
            </div>
          );
        })}

        {runs.length === 0 && !error && (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            No runs logged yet. Tap “Log a run” after your next one.
          </p>
        )}
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
