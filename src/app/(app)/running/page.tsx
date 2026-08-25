"use client";

import { useEffect, useState } from "react";
import { Wind, CheckCircle2, Clock, CalendarDays } from "lucide-react";
import type { RunningSession, DayOfWeek } from "@/types";
import Link from "next/link";

const TYPE_COLORS: Record<string, string> = {
  easy: "#60a5fa",
  interval: "var(--accent)",
  long: "#f59e0b",
  unstructured: "#a3a3a3",
};

const TYPE_LABELS: Record<string, string> = {
  easy: "Easy Zone 2",
  interval: "VO₂ Intervals",
  long: "Long Zone 2",
  unstructured: "Easy / Unstructured",
};

const DAY_ORDER: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const DAY_LABEL: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

const PHASE_BLURB: Record<number, string> = {
  1: "Base — building the aerobic engine. No intervals yet; that's deliberate.",
  2: "Development — VO₂ work introduced gradually alongside the Zone 2 base.",
  3: "Full — the complete stimulus, rotating between three interval blocks.",
};

interface BlockState {
  weekInBlock: number;
  blockIndex: number;
  blockWeeks: number;
  isDeload: boolean;
  runningPhase: number;
  blockVariant: string | null;
}

export default function RunningPage() {
  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [block, setBlock] = useState<BlockState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/running").then((r) => r.json()),
      fetch("/api/running/week").then((r) => r.json()).catch(() => null),
    ])
      .then(([runData, blockState]: [RunningSession[], BlockState | null]) => {
        // /api/running answers with { error } on a failed rebuild, not an array.
        setSessions(Array.isArray(runData) ? runData : []);
        setBlock(blockState);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  const weekInBlock = block?.weekInBlock ?? 1;
  const blockIndex = block?.blockIndex ?? 0;
  const phase = block?.runningPhase ?? 1;

  // This block-week's runs. block_index is what keeps the six week numbers from
  // colliding across blocks — without it, last block's completed week 1 was still
  // showing as "this week" six weeks later.
  //
  // The day_of_week check separates live sessions from history: completed rows left
  // over from the retired 16-week program share these week numbers and default to
  // block 0. Those legacy rows were never placed by the planner, so they have no
  // weekday — and they stay out of the schedule while remaining available to analytics.
  const thisWeek = sessions.filter(
    (s) => s.block_index === blockIndex && s.program_week === weekInBlock && s.day_of_week
  );
  const required = thisWeek.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.completed).length;

  const byDay = DAY_ORDER.map((day) => ({
    day,
    runs: thisWeek.filter((s) => s.day_of_week === day),
  })).filter((d) => d.runs.length > 0);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <Wind size={22} style={{ color: "#60a5fa" }} />
        <h1 className="text-xl font-bold">Running</h1>
      </div>

      {/* Phase + block position. Running shares the 6-week block clock with strength,
          so week 6 deloads both at once rather than the two drifting apart. */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold">Running Phase {phase}</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Week {weekInBlock} of {block?.blockWeeks ?? 6}
          </span>
        </div>

        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${(weekInBlock / (block?.blockWeeks ?? 6)) * 100}%`, background: "#60a5fa" }} />
        </div>

        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {PHASE_BLURB[phase]}
        </p>

        {block?.blockVariant && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Interval block <span className="font-semibold">{block.blockVariant}</span> — the three blocks
            rotate, so this is variety rather than an ever-increasing load.
          </p>
        )}

        {block?.isDeload && (
          <div className="rounded-xl p-3"
            style={{ background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.30)" }}>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              <span className="font-semibold" style={{ color: "#60a5fa" }}>Deload week.</span>{" "}
              No intervals, shorter runs. Strength deloads this week too — this is where the
              adaptation actually lands.
            </p>
          </div>
        )}

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {doneCount} / {required.length} sessions done this week
        </p>
      </div>

      {/* This week, laid out by day. */}
      <div className="space-y-3">
        {byDay.map(({ day, runs }) => (
          <div key={day}>
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <CalendarDays size={12} style={{ color: "var(--muted)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                {DAY_LABEL[day]}
              </span>
            </div>
            <div className="space-y-2">
              {runs.map((s) => <RunCard key={s.id} session={s} />)}
            </div>
          </div>
        ))}

        {thisWeek.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            No runs scheduled yet. Save your settings to generate the week.
          </p>
        )}
      </div>
    </div>
  );
}

function RunCard({ session: s }: { session: RunningSession }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[s.type] }} />
          <span className="text-xs font-semibold" style={{ color: TYPE_COLORS[s.type] }}>
            {TYPE_LABELS[s.type]}
          </span>
          {s.optional && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              OPTIONAL
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Clock size={11} style={{ color: "var(--muted)" }} />
          <span className="text-xs" style={{ color: "var(--muted)" }}>{s.target_duration_min} min</span>
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
        <Link href={`/running/log?session_id=${s.id}`}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
          style={{ background: "#1d4ed8", color: "#93c5fd" }}>
          Log this run
        </Link>
      )}
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
