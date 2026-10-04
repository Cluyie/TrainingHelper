"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Minus, Plus, Check, ExternalLink, ChevronDown, ChevronUp, Sun, Repeat, X } from "lucide-react";
import type { PlannedWorkout, PlannedExercise, WorkoutSet, WorkoutSession, ProgressionSuggestion, Exercise } from "@/types";
import { getProgressionSuggestion } from "@/lib/progression";
import { todayISO } from "@/lib/nutrition-client";
import { deloadSets, deloadWeight } from "@/lib/deload";
import { isLoaded } from "@/lib/training-load";
import { multiDayExercises, restLabel, restSeconds as restSecondsFor, targetRir, PROGRAM } from "@/lib/program-generator";

// Exercises that sit on more than one day with different rep ranges: their history
// is read per weekday so Friday isn't judged against Monday's weight.
const MULTI_DAY = multiDayExercises();

// RIR is stored in the existing workout_sets.rpe column as RPE = 10 − RIR, so older
// RPE entries and new RIR entries stay on one scale.
const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

const CATEGORY_COLOR: Record<string, string> = {
  power: "#ef4444",
  hinge: "#f59e0b", squat: "#8b5cf6", push: "#3b82f6",
  pull: "#10b981", carry: "#f97316", core: "#ec4899", shoulder_health: "#06b6d4",
  calf: "#84cc16",
};

function youtubeSearch(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + " exercise proper form")}`;
}

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Swaps are per workout, per day — a substitution made because a machine was busy
  // shouldn't quietly persist into next week's session.
  const swapKey = `workoutSwaps:${id}:${todayISO()}`;

  const [workout, setWorkout] = useState<PlannedWorkout | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const positionedRef = useRef(false);
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
  const [warmupOpen, setWarmupOpen] = useState(true);
  const [warmupTicked, setWarmupTicked] = useState<Set<number>>(new Set());
  const [logging, setLogging] = useState(false);
  const [deload, setDeload] = useState(false);
  const [weekInBlock, setWeekInBlock] = useState(1);
  // Technique (or, for power, speed/height) broke down on this exercise today. Blocks
  // the load increase next time. Keyed by planned_exercise id, like the RPE/RIR.
  const [formFlag, setFormFlag] = useState<Record<string, boolean>>({});
  const [logError, setLogError] = useState<string | null>(null);
  const [keepAwake, setKeepAwake] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  // Session-scoped exercise swaps, keyed by planned_exercise id. Sets already store
  // exercise_id directly, so a swap needs no schema change — and the stored program is
  // left untouched, which is what you want when a machine is simply busy today.
  //
  // Mirrored into localStorage per workout+day: sets are persisted server-side against
  // the SWAPPED exercise, so if a reload lost the swap the page would look for them
  // under the planned exercise and your finished sets would appear undone.
  const [swaps, setSwaps] = useState<Record<string, Exercise>>({});
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapOptions, setSwapOptions] = useState<Exercise[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  // RPE per exercise, not per set — one tap, then every set of that exercise
  // carries it into the existing workout_sets.rpe column. Per-set would be more
  // granular but it's a tap on every single set, which is where logging
  // discipline actually breaks down.
  const [rpeByExercise, setRpeByExercise] = useState<Record<string, number>>({});
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Browser-only state, read after mount. Never during render or in a useState
  // initialiser: the server has no localStorage, so that would hydrate mismatched.
  useEffect(() => {
    setWakeLockSupported("wakeLock" in navigator);
    if (localStorage.getItem("keepScreenAwake") === "1") setKeepAwake(true);

    // Restore today's swaps. Sets are persisted server-side against the SWAPPED
    // exercise, so losing the swap on reload would make finished sets look undone.
    try {
      const raw = localStorage.getItem(swapKey);
      if (raw) setSwaps(JSON.parse(raw));
    } catch {
      /* corrupt or unavailable — start with no swaps */
    }
  }, [swapKey]);

  useEffect(() => {
    if (!keepAwake || !("wakeLock" in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
      } catch {
        /* denied, e.g. battery saver mode */
      }
    };
    acquire();
    // The browser releases the lock when the tab is hidden; re-acquire on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [keepAwake]);

  function toggleKeepAwake() {
    setKeepAwake((v) => {
      localStorage.setItem("keepScreenAwake", v ? "0" : "1");
      return !v;
    });
  }

  useEffect(() => {
    fetch("/api/strength/cycle")
      .then((r) => r.json())
      .then((s) => {
        setDeload(!!s?.isDeload);
        if (typeof s?.weekInBlock === "number") setWeekInBlock(s.weekInBlock);
      })
      .catch(() => {});
  }, []);


  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const ws: PlannedWorkout[] = await fetch("/api/workouts").then((r) => r.json());
      const w = ws.find((x) => x.id === id) ?? null;
      if (cancelled) return;
      setWorkout(w);

      // Resume an in-progress session for this workout if one exists (e.g. the
      // user navigated away mid-session). Sets are already persisted server-side.
      try {
        const sessions: WorkoutSession[] = await fetch(
          `/api/sessions?workout_id=${id}&limit=10`,
        ).then((r) => r.json());
        const today = todayISO();
        const active = Array.isArray(sessions)
          ? sessions.find((s) => !s.completed_at && s.date === today)
          : undefined;
        if (active && !cancelled) {
          sessionIdRef.current = active.id;
          setSessionId(active.id);
          const loggedSets: WorkoutSet[] = await fetch(
            `/api/sets?session_id=${active.id}`,
          ).then((r) => r.json());
          if (cancelled) return;
          const grouped: Record<string, WorkoutSet[]> = {};
          for (const s of loggedSets) (grouped[s.exercise_id] ??= []).push(s);
          setSets(grouped);
        }
      } catch {
        /* fresh session — nothing to restore */
      }
      if (cancelled) return;
      setRestored(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Once a restore has completed, jump to the first exercise that isn't finished
  // so the user lands where they left off (runs once).
  useEffect(() => {
    if (!restored || positionedRef.current || !workout?.planned_exercises) return;
    positionedRef.current = true;
    const exs = workout.planned_exercises;
    const idx = exs.findIndex(
      (pe) => (sets[pe.exercise_id]?.length ?? 0) < (deload ? deloadSets(pe.target_sets) : pe.target_sets),
    );
    setCurrentExIdx(idx === -1 ? exs.length - 1 : idx);
  }, [restored, workout, sets, deload]);

  // Progression history, keyed by the exercise actually being performed. Re-runs when
  // a swap changes that — otherwise a swapped-in lift always claimed "first time",
  // even with months of history behind it.
  useEffect(() => {
    if (!workout?.planned_exercises) return;
    let cancelled = false;

    const load = async () => {
      const pes = workout.planned_exercises!;
      const entries = await Promise.all(
        pes.map(async (pe) => {
          const swapped = swaps[pe.id];
          const exerciseId = swapped?.id ?? pe.exercise_id;
          const name = swapped?.name ?? pe.exercise?.name ?? "";
          const base = `/api/sets?exercise_id=${exerciseId}&recent_sessions=3`;

          // Same lift on several days → judge against this weekday only; fall back to
          // another day's numbers as a reference, never as a progression decision.
          let recent: WorkoutSet[] = [];
          let fromOtherDay = false;
          if (MULTI_DAY.has(name)) {
            recent = await fetch(`${base}&day=${workout.day_of_week}`).then((r) => r.json());
            if (Array.isArray(recent) && recent.length === 0) {
              recent = await fetch(base).then((r) => r.json());
              fromOtherDay = Array.isArray(recent) && recent.length > 0;
            }
          } else {
            recent = await fetch(base).then((r) => r.json());
          }
          if (!Array.isArray(recent)) recent = [];

          const role = pe.slot?.role;
          const suggestion = getProgressionSuggestion(
            // A swapped-in exercise isn't on the ladder, so it has no next rung.
            pe,
            recent,
            swapped ? null : pe.slot?.next_rung ?? null,
            {
              rirMin: role ? targetRir(role, weekInBlock)?.min ?? null : null,
              isPower: role === "power" || (swapped?.category ?? pe.exercise?.category) === "power",
              unit: pe.slot?.unit,
              fromOtherDay,
            }
          );
          return [exerciseId, suggestion] as const;
        })
      );
      if (!cancelled) setSuggestions(Object.fromEntries(entries));
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [workout, swaps, weekInBlock]);

  useEffect(() => {
    if (!workout?.planned_exercises) return;
    const pe = workout.planned_exercises[currentExIdx];
    if (!pe) return;
    // Key off the swapped exercise where there is one, so the prefilled weight follows
    // what you're actually about to lift.
    const s = suggestions[swaps[pe.id]?.id ?? pe.exercise_id];
    const base = s?.suggested_weight_kg ?? 0;
    // Power keeps its implement in the deload — a medicine ball has no 12.5% to lose.
    const w = deload && pe.slot?.role !== "power" ? deloadWeight(base, pe.progression_increment_kg) : base;
    setWeightInput(w ? String(w) : "");
    setRepsInput(String(pe.target_reps_min));
    setShowDescription(false);
  }, [currentExIdx, suggestions, workout, deload, swaps]);

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
      // Send OUR date, not the server's. The server falls back to the UTC date, which
      // is already tomorrow for an evening session in Denmark — that mismatched every
      // client-side check (all of which use local time), so a late workout wouldn't
      // resume if you navigated away, and wouldn't show as done today.
      body: JSON.stringify({ planned_workout_id: id, date: todayISO() }),
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
    // Log against whatever is actually being done — the swap if there is one.
    const exerciseId = swaps[pe.id]?.id ?? pe.exercise_id;
    const existingSets = sets[exerciseId] ?? [];
    setLogError(null);
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sid,
        exercise_id: exerciseId,
        set_number: existingSets.length + 1,
        weight_kg: weight,
        reps,
        // Whatever RIR is currently selected for this exercise (stored as RPE). Null
        // until you pick one — an unrecorded value is honest, a defaulted one is not.
        rpe: rpeByExercise[pe.id] ?? null,
        form_breakdown: formFlag[pe.id] === true,
      }),
    }).catch(() => null);

    // A set that wasn't stored must not look logged — it would silently vanish from
    // progression.
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setLogError(body?.error ?? "That set was not saved — try again.");
      setLogging(false);
      return;
    }
    const newSet: WorkoutSet = await res.json();
    setSets((prev) => ({ ...prev, [exerciseId]: [...(prev[exerciseId] ?? []), newSet] }));
    setRestSeconds(pe.slot ? restSecondsFor(pe.slot.role) : 90);
    setRestActive(true);
    setRepsInput(String(pe.target_reps_min));
    setLogging(false);
  }

  // Apply an RIR or form flag to the sets ALREADY logged for this exercise, so the
  // value that gates next time's progression covers every set — including the first,
  // which is logged before the selector appears.
  async function patchLoggedSets(pe: PlannedExercise, update: { rpe?: number | null; form_breakdown?: boolean }) {
    const exerciseId = swaps[pe.id]?.id ?? pe.exercise_id;
    const ids = (sets[exerciseId] ?? []).map((s) => s.id);
    if (ids.length === 0) return;
    const res = await fetch("/api/sets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...update }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setLogError(body?.error ?? "Could not update the logged sets.");
      return;
    }
    setSets((prev) => ({
      ...prev,
      [exerciseId]: (prev[exerciseId] ?? []).map((s) => ({ ...s, ...update })),
    }));
  }

  function chooseRir(pe: PlannedExercise, rir: number | null) {
    const rpe = rir == null ? null : 10 - rir;
    setRpeByExercise((prev) => {
      const next = { ...prev };
      if (rpe == null) delete next[pe.id];
      else next[pe.id] = rpe;
      return next;
    });
    patchLoggedSets(pe, { rpe });
  }

  function toggleFormFlag(pe: PlannedExercise) {
    const value = !formFlag[pe.id];
    setFormFlag((prev) => ({ ...prev, [pe.id]: value }));
    patchLoggedSets(pe, { form_breakdown: value });
  }

  // Alternatives come from the same pool the generator uses, so a swap can never pull
  // in something the session shouldn't hold — no bodyweight filler at the gym, nothing
  // above your phase.
  async function openSwap() {
    if (!currentPE || !currentEx) return;
    setSwapOpen(true);
    setSwapLoading(true);
    try {
      const res = await fetch(`/api/exercises/alternatives?exercise_id=${currentEx.id}`);
      setSwapOptions(res.ok ? await res.json() : []);
    } catch {
      setSwapOptions([]);
    } finally {
      setSwapLoading(false);
    }
  }

  function persistSwaps(next: Record<string, Exercise>) {
    setSwaps(next);
    try {
      if (Object.keys(next).length === 0) localStorage.removeItem(swapKey);
      else localStorage.setItem(swapKey, JSON.stringify(next));
    } catch {
      /* private mode or quota — the swap still applies for this page view */
    }
  }

  function applySwap(ex: Exercise) {
    if (!currentPE) return;
    persistSwaps({ ...swaps, [currentPE.id]: ex });
    setSwapOpen(false);
  }

  function clearSwap() {
    if (!currentPE) return;
    const next = { ...swaps };
    delete next[currentPE.id];
    persistSwaps(next);
    setSwapOpen(false);
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
  // On a deload week, working sets roughly halve (power included — fewer, fresh reps).
  const effSets = (pe: PlannedExercise) => (deload ? deloadSets(pe.target_sets) : pe.target_sets);
  const currentPE = exercises[currentExIdx];
  // A swap overrides the planned exercise for this session only.
  const currentEx = (currentPE && swaps[currentPE.id]) || currentPE?.exercise;
  // Everything keys off the exercise actually being performed, so a swap mid-session
  // keeps its own set count and progress rather than inheriting the planned one's.
  const effId = (pe: PlannedExercise) => swaps[pe.id]?.id ?? pe.exercise_id;
  const currentSets = sets[currentPE ? effId(currentPE) : ""] ?? [];
  const suggestion = suggestions[currentPE ? effId(currentPE) : ""];
  const setsLeft = (currentPE ? effSets(currentPE) : 0) - currentSets.length;
  const allDone = exercises.every((pe) => (sets[effId(pe)]?.length ?? 0) >= effSets(pe));
  const color = CATEGORY_COLOR[currentEx?.category ?? ""] ?? "var(--accent)";
  // Derived from the exercise's own equipment rather than the day type. The old rule
  // ("is this a home workout?") happened to give the right answer today, but it would
  // hide the weight field the moment a swap brought a loaded exercise into a session —
  // and it wrongly treated any 0-increment gym exercise as bodyweight.
  const isBodyweight = !currentEx || !isLoaded(currentEx.equipment) || workout.is_home_workout;
  const slot = currentPE?.slot ?? null;
  const isPower = slot?.role === "power" || currentEx?.category === "power";
  const rir = slot ? targetRir(slot.role, weekInBlock) : null;
  const programDay = PROGRAM.find((d) => d.day === workout.day_of_week && d.label === workout.label);
  const repsLabel =
    slot?.unit === "meters" ? (slot.per_side ? "Meters / side" : "Meters")
    : slot?.unit === "seconds" ? (slot.per_side ? "Seconds / side" : "Seconds")
    : currentPE && currentPE.target_reps_min >= 20 && currentPE.progression_increment_kg === 0 && !slot ? "Seconds"
    : slot?.per_side ? "Reps / side" : "Reps";
  const selectedRir = currentPE && rpeByExercise[currentPE.id] != null ? 10 - rpeByExercise[currentPE.id] : null;

  return (
    // dvh, not vh: on mobile `vh` measures the large viewport, so this box was already
    // taller than the visible area before anything was added to it.
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: "calc(100dvh - 80px)" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-2)" }}>
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{workout.label}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {wakeLockSupported && (
            <button onClick={toggleKeepAwake} title={keepAwake ? "Screen stays on" : "Keep screen on"}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
              style={keepAwake
                ? { background: "#f59e0b22", color: "#f59e0b" }
                : { background: "var(--surface-2)", color: "var(--muted)" }}>
              <Sun size={16} />
            </button>
          )}
          <div className="text-xs font-medium px-2 py-1 rounded-lg"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
            {currentExIdx + 1}/{exercises.length}
          </div>
        </div>
      </div>

      {/* ── Exercise progress dots ── */}
      <div className="flex gap-1 px-4 mb-3 shrink-0">
        {exercises.map((pe, i) => {
          const done = (sets[effId(pe)]?.length ?? 0) >= effSets(pe);
          return (
            <button key={pe.id} onClick={() => setCurrentExIdx(i)}
              className="h-1 rounded-full transition-all flex-1"
              style={{ background: done ? color : i === currentExIdx ? "var(--foreground)" : "var(--border)" }} />
          );
        })}
      </div>

      {/* ── Deload week banner ── */}
      {deload && (
        <div className="mx-4 mb-3 rounded-xl px-3 py-2 text-xs font-semibold shrink-0 flex items-center gap-2"
          style={{ background: "#f59e0b1a", color: "#b45309" }}>
          🔄 Deload week — about half the sets, ~12.5% lighter, 4+ RIR. Not a test week; no PRs.
        </div>
      )}

      {/* Session order: warm-up → power → heavy → accessory → core/carry → Zone 2.
          The warm-up is a concrete checklist on the first exercise. Ticks are for this
          screen only — nothing is stored. Collapses once everything is ticked. */}
      {currentExIdx === 0 && programDay && (
        <div className="mx-4 mb-3 rounded-xl px-3 py-2 text-xs shrink-0"
          style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
          <button onClick={() => setWarmupOpen((v) => !v)} className="w-full flex items-center justify-between">
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>
              {warmupTicked.size >= programDay.warmup.length
                ? "Warm-up done ✓"
                : `Warm-up · ${warmupTicked.size}/${programDay.warmup.length} · ~8–10 min`}
            </span>
            {warmupOpen && warmupTicked.size < programDay.warmup.length
              ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {warmupOpen && warmupTicked.size < programDay.warmup.length && (
            <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {programDay.warmup.map((step, i) => {
                const ticked = warmupTicked.has(i);
                return (
                  <li key={i}>
                    <button
                      onClick={() => setWarmupTicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })}
                      className="w-full text-left flex items-start gap-2 py-0.5">
                      <span className="w-4 h-4 mt-px rounded border flex items-center justify-center shrink-0"
                        style={{ borderColor: ticked ? "var(--accent)" : "var(--border)", color: "var(--accent)" }}>
                        {ticked && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span style={{ textDecoration: ticked ? "line-through" : "none" }}>{step}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {programDay && currentExIdx === programDay.rampUp.slot && (
        <div className="mx-4 mb-3 rounded-xl px-3 py-2 text-xs shrink-0"
          style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
          {programDay.rampUp.text}
        </div>
      )}
      {programDay?.zone2After && currentExIdx === exercises.length - 1 && (
        <div className="mx-4 mb-3 rounded-xl px-3 py-2 text-xs shrink-0"
          style={{ background: "rgba(96,165,250,0.10)", color: "var(--muted)" }}>
          <span className="font-semibold" style={{ color: "#60a5fa" }}>After this: Zone 2.</span>{" "}
          Log it on the running page when you&apos;re done.
        </div>
      )}

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

      {/* ── Main content ──
          Everything scrolls, including the Log Set button. This region used to be a
          fixed-height box with overflow-hidden and every child shrink-0, so whatever
          didn't fit was simply unreachable.

          Pinning the button below the scroll area fixed reachability but reserved
          fixed height on every screen, which cost more than it bought — steppers plus
          button took roughly a third of a short phone. One scroll region, compact
          controls, only the bottom nav is fixed. */}
      {currentEx && currentPE && (
        <div className="flex-1 flex flex-col px-4 pb-2 gap-3 min-h-0">

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">

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
                  <button onClick={openSwap}
                    className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                    <Repeat size={9} />swap
                  </button>
                  {currentPE && swaps[currentPE.id] && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: "#f59e0b22", color: "#f59e0b" }}>
                      swapped
                    </span>
                  )}
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
            {/* Bodyweight suggestions carry no weight, only reps — they still have a last session. */}
            {suggestion?.last_weight_kg != null || suggestion?.last_reps != null ? (
              <div className="flex-1 px-3 py-2 rounded-xl"
                style={{ background: "var(--surface-2)" }}>
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--muted)" }}>LAST SESSION</p>
                <p className="text-sm font-bold">
                  {suggestion.last_weight_kg != null ? `${suggestion.last_weight_kg}kg × ` : ""}
                  {suggestion.last_reps} {slot?.unit === "meters" ? "m" : slot?.unit === "seconds" ? "s" : "reps"}
                </p>
              </div>
            ) : (
              <div className="flex-1 px-3 py-2 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>First time — start light</p>
              </div>
            )}
            <div className="px-3 py-2 rounded-xl text-center" style={{ background: color + "18" }}>
              <p className="text-[10px] font-semibold mb-0.5" style={{ color }}>TARGET</p>
              <p className="text-sm font-bold" style={{ color }}>
                {effSets(currentPE)}×{currentPE.target_reps_min === currentPE.target_reps_max
                  ? currentPE.target_reps_min
                  : `${currentPE.target_reps_min}–${currentPE.target_reps_max}`}
                {slot?.unit === "meters" ? " m" : slot?.unit === "seconds" ? " s" : ""}{slot?.per_side ? " /side" : ""}
              </p>
            </div>
          </div>

          {/* The prescription in full: effort, rest, and why the exercise is here. */}
          {slot && (
            <div className="shrink-0 px-3 py-2 rounded-xl text-xs space-y-0.5"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              <p>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                  {isPower ? "Power — max speed, stop when it drops" : rir?.label}
                </span>
                {" · "}rest {restLabel(slot.role)}
                {slot.scheduled_override && !swaps[currentPE.id] && " · this week's scheduled variation"}
              </p>
              <p>{slot.purpose}</p>
            </div>
          )}

          {/* Progression message — shown always: a "repeat the load" is as much a
              decision as an increase, and the reason for it matters. */}
          {suggestion && (
            <div className="shrink-0 px-3 py-2 rounded-xl flex items-center gap-2"
              style={suggestion.is_increase
                ? { background: color + "18", border: `1px solid ${color}44` }
                : { background: "var(--surface-2)" }}>
              {suggestion.is_increase && <span className="text-base">🎉</span>}
              <p className="text-xs font-semibold" style={{ color: suggestion.is_increase ? color : "var(--muted)" }}>
                {suggestion.message}
              </p>
            </div>
          )}

          {/* Effort and quality for this exercise. Appear once the first set is logged —
              rating an exercise you haven't started yet is guesswork. Both are written
              to every set of the exercise and gate next time's load increase. */}
          {currentPE && currentSets.length > 0 && (
            <div className="shrink-0 rounded-2xl p-3 space-y-2.5" style={{ background: "var(--surface)" }}>
              {!isPower && (
                <div>
                  <p className="text-[10px] font-bold tracking-wider mb-1.5" style={{ color: "var(--muted)" }}>
                    REPS IN RESERVE ON THE LAST SET{rir ? ` — PLANNED ${rir.label.toUpperCase()}` : ""}
                  </p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {RIR_OPTIONS.map((r) => {
                      const active = selectedRir === r;
                      return (
                        <button key={r}
                          onClick={() => chooseRir(currentPE, active ? null : r)}
                          className="h-9 rounded-lg text-sm font-bold"
                          style={active
                            ? { background: color, color: "#fff" }
                            : { background: "var(--surface-2)", color: "var(--muted)" }}>
                          {r === 5 ? "5+" : r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={() => toggleFormFlag(currentPE)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2"
                style={formFlag[currentPE.id]
                  ? { background: "#ef444422", color: "#ef4444" }
                  : { background: "var(--surface-2)", color: "var(--muted)" }}>
                <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                  style={{ borderColor: formFlag[currentPE.id] ? "#ef4444" : "var(--border)" }}>
                  {formFlag[currentPE.id] && <Check size={11} strokeWidth={3} />}
                </span>
                {isPower ? "Speed or height dropped" : "Form broke down"} — hold the load next time
              </button>
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

          {/* LOG SET — inside the scroll region, not pinned. Pinning it reserved
              fixed height at the bottom of every screen, which cost more room than
              it bought: on a short phone the steppers plus button took a third of
              the view even when you only wanted to read the exercise. */}
          {setsLeft > 0 ? (
            <div className="shrink-0 flex flex-col gap-2 pb-1">
              <p className="text-[10px] font-bold text-center tracking-widest" style={{ color: "var(--muted)" }}>
                SET {currentSets.length + 1} OF {effSets(currentPE)}
              </p>

              <div className={isBodyweight ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
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
                  label={repsLabel}
                  value={repsInput}
                  onChange={setRepsInput}
                  step={1}
                  color={color}
                />
              </div>

              {logError && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ background: "#ef44441a", color: "#ef4444" }}>
                  {logError}
                </p>
              )}

              <button
                onClick={logSet}
                disabled={((!isBodyweight && !weightInput) || !repsInput) || logging}
                className="w-full rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: color, color: "#fff", height: 50 }}
              >
                <Check size={18} strokeWidth={3} />
                {logging ? "Saving…" : `Log Set ${currentSets.length + 1}`}
              </button>
            </div>
          ) : (
            <div className="shrink-0 pb-1">
              <div className="w-full rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: color + "18", border: `1px solid ${color}55`, height: 48, color }}>
                <Check size={18} strokeWidth={3} />
                All {effSets(currentPE)} sets done
              </div>
            </div>
          )}
          </div>{/* end scrollable region */}
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

      {/* ── Swap sheet ── */}
      {swapOpen && (
        // dvh, not vh: on mobile `vh` is the LARGE viewport, so the bottom of the
        // sheet sat behind the browser's URL bar and the last options were unreachable.
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.55)", height: "100dvh" }}
          onClick={() => setSwapOpen(false)}>
          <div className="w-full max-w-lg mx-auto rounded-t-3xl flex flex-col"
            style={{ background: "var(--surface)", maxHeight: "85dvh" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Pinned header — the close button stays reachable however far you scroll. */}
            <div className="flex items-center justify-between p-4 pb-3 shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3 className="text-base font-bold">Swap exercise</h3>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Just for today — your program stays as it is.
                </p>
              </div>
              <button onClick={() => setSwapOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--surface-2)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Only the list scrolls. Bottom padding clears the phone's home indicator. */}
            <div className="overflow-y-auto p-4 pt-3 space-y-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
              {currentPE && swaps[currentPE.id] && (
                <button onClick={clearSwap}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                  ← Back to {currentPE.exercise?.name}
                </button>
              )}

              {swapLoading ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--muted)" }}>Loading…</p>
              ) : swapOptions.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--muted)" }}>
                  No alternatives available for this movement.
                </p>
              ) : (
                swapOptions.map((ex) => (
                  <button key={ex.id} onClick={() => applySwap(ex)}
                    className="w-full text-left px-3 py-3 rounded-xl"
                    style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{ex.name}</span>
                      {ex.equipment.includes("cable") && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
                          style={{ background: "var(--accent)22", color: "var(--accent)" }}>cable</span>
                      )}
                    </div>
                    {/* Not clamped — you're choosing a substitution mid-workout, so the
                        whole cue matters, not the first two lines of it. */}
                    <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--muted)" }}>
                      {ex.description}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
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

  // Kept compact deliberately: this sits in the scroll flow now, and at its old size
  // the steppers plus the log button took roughly a third of a phone screen. The
  // +/- targets stay at 36px, which is still comfortably tappable with sweaty hands.
  return (
    <div className="rounded-xl p-2 flex flex-col gap-1" style={{ background: "var(--surface)" }}>
      <p className="text-[9px] font-bold tracking-wider text-center" style={{ color: "var(--muted)" }}>
        {label.toUpperCase()}
      </p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => adjust(-1)}
          className="w-9 h-9 rounded-lg flex items-center justify-center font-bold shrink-0"
          style={{ background: "var(--surface-2)" }}>
          <Minus size={16} />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-center font-bold text-xl outline-none bg-transparent"
          style={{ color: "var(--foreground)", minWidth: 0 }}
          inputMode="decimal"
        />
        <button onClick={() => adjust(1)}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: color + "33", color }}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
