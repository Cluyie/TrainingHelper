"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle2, Play, Pause, ExternalLink } from "lucide-react";
import type { StretchingRoutine, StretchingRoutineExercise } from "@/types";

const CATEGORY_COLOR: Record<string, string> = {
  hip: "#8b5cf6",
  hamstrings: "#8b5cf6",
  hip_flexors: "#8b5cf6",
  thoracic: "#3b82f6",
  chest_shoulders: "#3b82f6",
  neck: "#3b82f6",
  full_body: "#10b981",
  spine: "#f59e0b",
  yin: "#ec4899",
  mobility: "#06b6d4",
};

function youtubeSearch(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + " yoga stretch how to")}`;
}

function totalSessionSeconds(exercises: StretchingRoutineExercise[]) {
  return exercises.reduce((sum, re) => sum + (re.stretching_exercise?.duration_sec ?? 0), 0);
}

function StretchingSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const routineId = searchParams.get("routine_id");

  const [routine, setRoutine] = useState<StretchingRoutine | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  // Counts down 3-2-1 between poses when auto-advancing
  const [transitionCount, setTransitionCount] = useState<number | null>(null);

  useEffect(() => {
    if (!routineId) return;
    fetch("/api/stretching?routines=1")
      .then((r) => r.json())
      .then((data: StretchingRoutine[]) => {
        const r = data.find((x) => x.id === routineId);
        setRoutine(r ?? null);
        const exercises = r?.stretching_routine_exercises ?? [];
        if (exercises[0]?.stretching_exercise) {
          setTimeLeft(exercises[0].stretching_exercise.duration_sec);
        }
        setLoading(false);
      });
  }, [routineId]);

  // Countdown timer
  useEffect(() => {
    if (!isRunning || timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [isRunning, timeLeft]);

  // When timer reaches 0, start transition
  useEffect(() => {
    if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      const exercises = routine?.stretching_routine_exercises ?? [];
      if (currentIdx < exercises.length - 1) {
        // Auto-advance after 3 seconds
        setTransitionCount(3);
      } else {
        // Last pose done — finish session
        completeSession();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isRunning]);

  // Transition countdown
  useEffect(() => {
    if (transitionCount === null) return;
    if (transitionCount <= 0) {
      setTransitionCount(null);
      advancePose(1);
      return;
    }
    const t = setTimeout(() => setTransitionCount((n) => (n ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [transitionCount]);

  const exercises = routine?.stretching_routine_exercises ?? [];
  const currentRE: StretchingRoutineExercise | undefined = exercises[currentIdx];
  const currentEx = currentRE?.stretching_exercise;

  function advancePose(delta: number) {
    const next = currentIdx + delta;
    if (next < 0 || next >= exercises.length) return;
    const nextEx = exercises[next]?.stretching_exercise;
    setCurrentIdx(next);
    setTimeLeft(nextEx?.duration_sec ?? 60);
    setIsRunning(false);
    setTransitionCount(null);
  }

  function goNext() {
    if (currentIdx < exercises.length - 1) advancePose(1);
    else completeSession();
  }
  function goPrev() { advancePose(-1); }

  async function completeSession() {
    if (sessionId) {
      await fetch("/api/stretching", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, completed: true }),
      });
    }
    setDone(true);
    setTimeout(() => router.push("/stretching"), 2500);
  }

  if (loading) return <Loader />;

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 h-[calc(100vh-80px)] px-6 text-center">
        <CheckCircle2 size={64} style={{ color: "#a78bfa" }} />
        <div className="space-y-2">
          <p className="font-bold text-2xl">Session Complete</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Great work on your flexibility and mobility.
          </p>
        </div>
      </div>
    );
  }

  if (!currentEx || !routine) return null;

  const pct = currentEx.duration_sec > 0 ? (timeLeft / currentEx.duration_sec) * 100 : 0;
  const totalSec = totalSessionSeconds(exercises);
  const completedSec = exercises
    .slice(0, currentIdx)
    .reduce((sum, re) => sum + (re.stretching_exercise?.duration_sec ?? 0), 0);
  const sessionPct = totalSec > 0 ? (completedSec / totalSec) * 100 : 0;
  const color = CATEGORY_COLOR[currentEx.category] ?? "#8b5cf6";
  const minutesLeft = Math.ceil((totalSec - completedSec) / 60);

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ color: "var(--muted)" }}>
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <p className="font-bold text-sm">{routine.name}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {currentIdx + 1} of {exercises.length} · ~{minutesLeft} min left
          </p>
        </div>
        <div className="w-10" />
      </div>

      {/* Session progress bar */}
      <div className="mx-4 mb-2 h-1 rounded-full shrink-0" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${sessionPct}%`, background: color }} />
      </div>

      {/* Pose dots */}
      <div className="flex gap-1 px-4 mb-4 shrink-0 overflow-hidden">
        {exercises.map((_, i) => (
          <button key={i} onClick={() => advancePose(i - currentIdx)}
            className="h-1.5 rounded-full transition-all flex-1"
            style={{
              background: i < currentIdx ? color : i === currentIdx ? "var(--foreground)" : "var(--border)",
            }} />
        ))}
      </div>

      {/* Transition overlay */}
      {transitionCount !== null && (
        <div className="mx-4 mb-3 px-4 py-3 rounded-2xl text-center shrink-0"
          style={{ background: "var(--surface)", border: `1px solid ${color}` }}>
          <p className="text-sm font-semibold" style={{ color }}>
            Next: {exercises[currentIdx + 1]?.stretching_exercise?.name}
          </p>
          <p className="text-3xl font-bold mt-1">{transitionCount}</p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Visual area */}
        {currentEx.animation_url ? (
          <div className="relative w-full rounded-2xl overflow-hidden"
            style={{ background: "var(--surface)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentEx.animation_url}
              alt={currentEx.name}
              className="w-full object-contain"
              style={{ maxHeight: 220 }}
            />
            <a
              href={youtubeSearch(currentEx.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "#dc262699", color: "#fff", backdropFilter: "blur(4px)" }}
            >
              <ExternalLink size={11} />
              YouTube
            </a>
          </div>
        ) : (
          <div className="w-full rounded-2xl flex flex-col items-center justify-center gap-3 py-8"
            style={{ background: "var(--surface)", minHeight: 170 }}>
            <div className="text-6xl">🧘</div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full capitalize"
              style={{ background: `${color}22`, color }}>
              {currentEx.category.replace("_", " ")}
            </span>
            <a
              href={youtubeSearch(currentEx.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all"
              style={{ background: "#dc2626", color: "#fff" }}
            >
              <ExternalLink size={12} />
              Watch on YouTube
            </a>
          </div>
        )}

        {/* Exercise info */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold">{currentEx.name}</h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {currentEx.description}
          </p>
        </div>

        {/* Timer card */}
        <div className="rounded-2xl p-5 flex flex-col items-center gap-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>

          {/* Circular timer */}
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="44" fill="none"
                stroke={color} strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 44}`}
                strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
                strokeLinecap="round"
                style={{ transition: isRunning ? "stroke-dashoffset 1s linear" : "none" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold leading-none">
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
              <span className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                of {Math.floor(currentEx.duration_sec / 60)}:{String(currentEx.duration_sec % 60).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="flex gap-3 w-full">
            <button
              onClick={() => { setTimeLeft(currentEx.duration_sec); setIsRunning(false); setTransitionCount(null); }}
              className="w-12 h-12 rounded-xl text-xs font-semibold flex items-center justify-center"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              ↺
            </button>
            <button
              onClick={() => { setIsRunning((r) => !r); setTransitionCount(null); }}
              className="flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{ background: color + "33", color }}
            >
              {isRunning ? <><Pause size={16} /> Pause</> : <><Play size={16} /> {timeLeft < currentEx.duration_sec ? "Resume" : "Start"}</>}
            </button>
          </div>

          <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
            {isRunning ? "Breathe deeply and hold the stretch…" : "Press Start when you're in position"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-4 pb-4 pt-2 shrink-0 flex gap-3">
        <button onClick={goPrev} disabled={currentIdx === 0}
          className="w-12 h-12 rounded-xl flex items-center justify-center disabled:opacity-30"
          style={{ background: "var(--surface-2)" }}>
          <ChevronLeft size={20} />
        </button>
        <button onClick={goNext}
          className="flex-1 h-12 rounded-xl font-bold text-sm active:scale-95 transition-all"
          style={{
            background: currentIdx === exercises.length - 1 ? color : "var(--surface-2)",
            color: currentIdx === exercises.length - 1 ? "#fff" : "var(--foreground)",
          }}>
          {currentIdx === exercises.length - 1 ? "Complete Session ✓" : "Next Pose →"}
        </button>
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

export default function StretchingSessionPage() {
  return (
    <Suspense fallback={<Loader />}>
      <StretchingSessionInner />
    </Suspense>
  );
}
