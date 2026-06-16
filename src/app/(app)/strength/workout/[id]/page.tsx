"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Minus, Plus, Check, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import type { PlannedWorkout, PlannedExercise, WorkoutSet, ProgressionSuggestion } from "@/types";
import { getProgressionSuggestion } from "@/lib/progression";

const CATEGORY_COLOR: Record<string, string> = {
  hinge: "#f59e0b", squat: "#8b5cf6", push: "#3b82f6",
  pull: "#10b981", carry: "#f97316", core: "#ec4899", shoulder_health: "#06b6d4",
};

function youtubeSearch(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + " exercise proper form")}`;
}

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [workout, setWorkout] = useState<PlannedWorkout | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [sets, setSets] = useState<Record<string, WorkoutSet[]>>({});
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion>>({});
  const [restSeconds, setRestSeconds] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [repsInput, setRepsInput] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch("/api/workouts")
      .then((r) => r.json())
      .then((ws: PlannedWorkout[]) => {
        const w = ws.find((x) => x.id === id);
        setWorkout(w ?? null);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!workout?.planned_exercises) return;
    const load = async () => {
      const result: Record<string, ProgressionSuggestion> = {};
      for (const pe of workout.planned_exercises!) {
        const res = await fetch(`/api/sets?exercise_id=${pe.exercise_id}&recent_sessions=3`);
        const recent: WorkoutSet[] = await res.json();
        result[pe.exercise_id] = getProgressionSuggestion(pe, recent);
      }
      setSuggestions(result);
    };
    load();
  }, [workout]);

  useEffect(() => {
    if (!workout?.planned_exercises) return;
    const pe = workout.planned_exercises[currentExIdx];
    if (!pe) return;
    const s = suggestions[pe.exercise_id];
    setWeightInput(s?.suggested_weight_kg ? String(s.suggested_weight_kg) : "");
    setRepsInput(String(pe.target_reps_min));
    setShowDescription(false);
  }, [currentExIdx, suggestions, workout]);

  useEffect(() => {
    if (!restActive) return;
    const t = setInterval(() => setRestSeconds((s) => {
      if (s <= 1) { setRestActive(false); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [restActive]);

  async function ensureSession(): Promise<string> {
    if (sessionIdRef.current) return sessionIdRef.current;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planned_workout_id: id }),
    });
    const session = await res.json();
    sessionIdRef.current = session.id;
    setSessionId(session.id);
    return session.id;
  }

  async function logSet() {
    const weight = isBodyweight ? 0 : parseFloat(weightInput);
    const reps = parseInt(repsInput);
    if ((!isBodyweight && isNaN(weight)) || isNaN(reps) || !workout?.planned_exercises || logging) return;
    setLogging(true);
    const sid = await ensureSession();
    const pe = workout.planned_exercises[currentExIdx];
    const existingSets = sets[pe.exercise_id] ?? [];
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sid,
        exercise_id: pe.exercise_id,
        set_number: existingSets.length + 1,
        weight_kg: weight,
        reps,
      }),
    });
    const newSet: WorkoutSet = await res.json();
    setSets((prev) => ({ ...prev, [pe.exercise_id]: [...(prev[pe.exercise_id] ?? []), newSet] }));
    setRestSeconds(90);
    setRestActive(true);
    setRepsInput(String(pe.target_reps_min));
    setLogging(false);
  }

  async function completeWorkout() {
    const sid = sessionIdRef.current || sessionId;
    setCompleting(true);
    if (sid) {
      await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sid, complete: true }),
      });
    }
    router.push("/strength");
  }

  if (loading || !workout) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const exercises = workout.planned_exercises ?? [];
  const currentPE = exercises[currentExIdx];
  const currentEx = currentPE?.exercise;
  const currentSets = sets[currentPE?.exercise_id ?? ""] ?? [];
  const suggestion = suggestions[currentPE?.exercise_id ?? ""];
  const setsLeft = (currentPE?.target_sets ?? 0) - currentSets.length;
  const allDone = exercises.every((pe) => (sets[pe.exercise_id]?.length ?? 0) >= pe.target_sets);
  const color = CATEGORY_COLOR[currentEx?.category ?? ""] ?? "var(--accent)";
  const isBodyweight = workout.is_home_workout || (currentPE?.progression_increment_kg === 0 && !suggestion?.last_weight_kg);

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: "calc(100vh - 80px)" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-2)" }}>
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{workout.label}</p>
        </div>
        <div className="text-xs font-medium px-2 py-1 rounded-lg"
          style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
          {currentExIdx + 1}/{exercises.length}
        </div>
      </div>

      {/* ── Exercise progress dots ── */}
      <div className="flex gap-1 px-4 mb-3 shrink-0">
        {exercises.map((pe, i) => {
          const done = (sets[pe.exercise_id]?.length ?? 0) >= pe.target_sets;
          return (
            <button key={pe.id} onClick={() => setCurrentExIdx(i)}
              className="h-1 rounded-full transition-all flex-1"
              style={{ background: done ? color : i === currentExIdx ? "var(--foreground)" : "var(--border)" }} />
          );
        })}
      </div>

      {/* ── Rest timer (replaces content when active) ── */}
      {restActive && (
        <div className="mx-4 mb-3 rounded-2xl px-5 py-4 flex items-center justify-between shrink-0"
          style={{ background: color + "18", border: `1px solid ${color}55` }}>
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color }}>Rest</p>
            <p className="text-3xl font-bold tracking-tight" style={{ color }}>
              {Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, "0")}
            </p>
          </div>
          <button onClick={() => setRestActive(false)}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
            Skip
          </button>
        </div>
      )}

      {/* ── Main content ── */}
      {currentEx && currentPE && (
        <div className="flex-1 flex flex-col px-4 pb-2 gap-3 overflow-hidden">

          {/* Exercise name + info */}
          <div className="shrink-0">
            <div className="flex items-start gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: color }} />
              <div className="flex-1">
                <h2 className="text-xl font-bold leading-tight">{currentEx.name}</h2>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold"
                    style={{ background: color + "22", color }}>
                    {currentEx.category.replace("_", " ")}
                  </span>
                  {(currentEx.muscle_groups ?? []).slice(0, 3).map((m) => (
                    <span key={m} className="text-[10px] px-2 py-0.5 rounded-full capitalize"
                      style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                      {m.replace("_", " ")}
                    </span>
                  ))}
                  <a href={youtubeSearch(currentEx.name)} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ background: "#dc262622", color: "#f87171" }}>
                    <ExternalLink size={9} />tutorial
                  </a>
                </div>
              </div>
            </div>

            {/* Collapsible description */}
            <button onClick={() => setShowDescription((v) => !v)}
              className="flex items-center gap-1 text-xs mt-1"
              style={{ color: "var(--muted)" }}>
              {showDescription ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              How to do it
            </button>
            {showDescription && (
              <p className="text-xs mt-2 leading-relaxed px-1" style={{ color: "var(--muted)" }}>
                {currentEx.description}
              </p>
            )}
          </div>

          {/* Last session + target */}
          <div className="shrink-0 flex items-center gap-2">
            {suggestion?.last_weight_kg != null ? (
              <div className="flex-1 px-3 py-2 rounded-xl"
                style={{ background: "var(--surface-2)" }}>
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--muted)" }}>LAST SESSION</p>
                <p className="text-sm font-bold">{suggestion.last_weight_kg}kg × {suggestion.last_reps} reps</p>
              </div>
            ) : (
              <div className="flex-1 px-3 py-2 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>First time — start light</p>
              </div>
            )}
            <div className="px-3 py-2 rounded-xl text-center" style={{ background: color + "18" }}>
              <p className="text-[10px] font-semibold mb-0.5" style={{ color }}>TARGET</p>
              <p className="text-sm font-bold" style={{ color }}>
                {currentPE.target_sets}×{currentPE.target_reps_min}–{currentPE.target_reps_max}
              </p>
            </div>
          </div>

          {/* Progression message */}
          {suggestion?.is_increase && (
            <div className="shrink-0 px-3 py-2 rounded-xl flex items-center gap-2"
              style={{ background: color + "18", border: `1px solid ${color}44` }}>
              <span className="text-base">🎉</span>
              <p className="text-xs font-semibold" style={{ color }}>{suggestion.message}</p>
            </div>
          )}

          {/* Completed sets */}
          {currentSets.length > 0 && (
            <div className="shrink-0 flex gap-2">
              {currentSets.map((s, i) => (
                <div key={s.id} className="flex-1 py-2 rounded-xl text-center"
                  style={{ background: color + "18", border: `1px solid ${color}44` }}>
                  <p className="text-[10px] font-semibold" style={{ color: "var(--muted)" }}>Set {i + 1}</p>
                  <p className="text-sm font-bold mt-0.5">{s.weight_kg}kg</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{s.reps} reps</p>
                </div>
              ))}
              {setsLeft > 0 && Array.from({ length: Math.min(setsLeft, 3) }).map((_, i) => (
                <div key={`empty-${i}`} className="flex-1 py-2 rounded-xl text-center"
                  style={{ background: "var(--surface-2)", border: "1px dashed var(--border)" }}>
                  <p className="text-[10px]" style={{ color: "var(--border)" }}>—</p>
                </div>
              ))}
            </div>
          )}

          {/* LOG SET — the main action */}
          {setsLeft > 0 ? (
            <div className="flex-1 flex flex-col justify-end gap-3">
              <p className="text-xs font-bold text-center tracking-widest" style={{ color: "var(--muted)" }}>
                SET {currentSets.length + 1} OF {currentPE.target_sets}
              </p>

              <div className={isBodyweight ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
                {!isBodyweight && (
                  <BigStepper
                    label="Weight (kg)"
                    value={weightInput}
                    onChange={setWeightInput}
                    step={currentPE.progression_increment_kg || 2.5}
                    color={color}
                  />
                )}
                <BigStepper
                  label={currentPE.target_reps_min >= 20 && currentPE.progression_increment_kg === 0 ? "Seconds" : "Reps"}
                  value={repsInput}
                  onChange={setRepsInput}
                  step={1}
                  color={color}
                />
              </div>

              <button
                onClick={logSet}
                disabled={((!isBodyweight && !weightInput) || !repsInput) || logging}
                className="w-full rounded-2xl font-bold text-base transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: color, color: "#fff", height: 60 }}
              >
                <Check size={20} strokeWidth={3} />
                {logging ? "Saving…" : `Log Set ${currentSets.length + 1}`}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-end">
              <div className="w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2"
                style={{ background: color + "18", border: `1px solid ${color}55`, height: 60, color }}>
                <Check size={20} strokeWidth={3} />
                All {currentPE.target_sets} sets done
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom navigation ── */}
      <div className="px-4 pt-2 pb-3 shrink-0 flex gap-2">
        <button onClick={() => setCurrentExIdx((i) => Math.max(0, i - 1))}
          disabled={currentExIdx === 0}
          className="w-12 h-12 rounded-xl flex items-center justify-center disabled:opacity-25"
          style={{ background: "var(--surface-2)" }}>
          <ChevronLeft size={20} />
        </button>

        {currentExIdx < exercises.length - 1 ? (
          <button onClick={() => setCurrentExIdx((i) => i + 1)}
            className="flex-1 h-12 rounded-xl font-semibold text-sm active:scale-95 flex items-center justify-center gap-1"
            style={{ background: "var(--surface-2)" }}>
            Next <ChevronRight size={16} />
          </button>
        ) : allDone ? (
          <button onClick={completeWorkout} disabled={completing}
            className="flex-1 h-12 rounded-xl font-bold text-sm active:scale-95"
            style={{ background: "var(--accent)", color: "#fff" }}>
            {completing ? "Saving…" : "Finish Workout 🎉"}
          </button>
        ) : (
          <button onClick={completeWorkout} disabled={completing}
            className="flex-1 h-12 rounded-xl text-sm active:scale-95"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
            End Early
          </button>
        )}

        <button onClick={() => setCurrentExIdx((i) => Math.min(exercises.length - 1, i + 1))}
          disabled={currentExIdx === exercises.length - 1}
          className="w-12 h-12 rounded-xl flex items-center justify-center disabled:opacity-25"
          style={{ background: "var(--surface-2)" }}>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

function BigStepper({ label, value, onChange, step, color }: {
  label: string; value: string; onChange: (v: string) => void; step: number; color: string;
}) {
  function adjust(delta: number) {
    const cur = parseFloat(value || "0");
    const next = Math.max(0, cur + delta * step);
    onChange(String(parseFloat(next.toFixed(2))));
  }

  return (
    <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: "var(--surface)" }}>
      <p className="text-[10px] font-bold tracking-wider text-center" style={{ color: "var(--muted)" }}>
        {label.toUpperCase()}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => adjust(-1)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
          style={{ background: "var(--surface-2)" }}>
          <Minus size={18} />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-center font-bold text-2xl outline-none bg-transparent"
          style={{ color: "var(--foreground)", minWidth: 0 }}
          inputMode="decimal"
        />
        <button onClick={() => adjust(1)}
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: color + "33", color }}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
