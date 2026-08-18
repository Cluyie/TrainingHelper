"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wind, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { todayISO } from "@/lib/nutrition-client";
import type { RunningSession } from "@/types";
import RpeSelector from "@/components/ui/RpeSelector";

const CONDITIONS_KEY = "runConditions";

// Sand and treadmill matter most here: both break the usual relationship between
// pace and effort, so without recording them a slow beach run reads as lost fitness.
const SURFACES = [
  { key: "road", label: "Road / pavement" },
  { key: "forest", label: "Forest / trail" },
  { key: "beach", label: "Beach / sand" },
  { key: "grass", label: "Grass / park" },
  { key: "gravel", label: "Gravel" },
  { key: "track", label: "Track" },
  { key: "treadmill", label: "Treadmill" },
];

function LogRunForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [session, setSession] = useState<RunningSession | null>(null);
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [avgHr, setAvgHr] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [hrEnd, setHrEnd] = useState("");
  const [hr60, setHr60] = useState("");
  const [hr120, setHr120] = useState("");
  const [temp, setTemp] = useState("");
  const [surface, setSurface] = useState("");
  const [showHrr, setShowHrr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Heart-rate recovery is only informative after a hard effort, so it opens by
  // default on interval days and stays collapsed otherwise.
  const isHard = session?.type === "interval";

  useEffect(() => {
    if (!sessionId) return;
    fetch("/api/running")
      .then((r) => r.json())
      .then((data: RunningSession[]) => {
        const s = data.find((x) => x.id === sessionId);
        setSession(s ?? null);
        if (s?.type === "interval") setShowHrr(true);
      });
  }, [sessionId]);

  // Surface and temperature barely change between runs, so carry the last ones
  // forward. Fields you have to re-enter every time are the ones that end up
  // half-filled — and patchy data is worse than none, because the gaps aren't random.
  //
  // Reading localStorage after mount (never in a useState initialiser) is required
  // here: the server has no localStorage, so initialising from it would render
  // different HTML on server and client and break hydration. The lint rule below
  // doesn't know about that constraint — see rule 10 in CLAUDE.md.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONDITIONS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved.surface) setSurface(saved.surface);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved.temp) setTemp(saved.temp);
    } catch {
      /* nothing remembered yet */
    }
  }, []);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function handleSave() {
    if (!sessionId || !duration) return;
    setSaving(true);

    try {
      localStorage.setItem(CONDITIONS_KEY, JSON.stringify({ surface, temp }));
    } catch {
      /* not worth failing the save over */
    }

    await fetch("/api/running", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sessionId,
        completed: true,
        date: todayISO(),
        actual_duration_min: parseInt(duration),
        actual_distance_km: distance ? parseFloat(distance) : null,
        notes: notes || null,
        rpe,
        avg_hr: num(avgHr),
        max_hr: num(maxHr),
        // Raw readings only — HRR is computed when analysing, so the definition
        // isn't frozen into the stored rows.
        hr_end: num(hrEnd),
        hr_60s: num(hr60),
        hr_120s: num(hr120),
        temperature_c: num(temp),
        surface: surface || null,
      }),
    });
    setDone(true);
    setTimeout(() => router.push("/running"), 1500);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64">
        <CheckCircle2 size={48} style={{ color: "var(--accent)" }} />
        <p className="font-bold text-lg">Run logged! Great work.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <Wind size={22} style={{ color: "#60a5fa" }} />
        <h1 className="text-xl font-bold">Log Run</h1>
      </div>

      {session && (
        <div className="rounded-2xl p-4"
          style={{ background: "var(--surface)", border: "1px solid #1d4ed8" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "#60a5fa" }}>
            Today&apos;s Target
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {session.target_description}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            {session.target_duration_min} min planned
          </p>
        </div>
      )}

      <div className="space-y-4">
        <Field label="Duration (minutes) *">
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 25"
            inputMode="numeric"
            className="w-full h-12 px-4 rounded-xl outline-none text-sm"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>

        <Field label="Distance (km) — optional">
          <input
            type="number"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="e.g. 3.2"
            inputMode="decimal"
            className="w-full h-12 px-4 rounded-xl outline-none text-sm"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>

        <RpeSelector
          value={rpe}
          onChange={setRpe}
          label="How hard did that feel?"
          hint="Rate the whole session. Zone 2 should land around 3-4; VO₂ intervals around 8."
        />

        {/* Straight off the watch. Average HR is the one that shows whether easy
            days are genuinely easy over the months. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Average HR — optional">
            <NumInput value={avgHr} onChange={setAvgHr} placeholder="e.g. 138" />
          </Field>
          <Field label="Max HR — optional">
            <NumInput value={maxHr} onChange={setMaxHr} placeholder="e.g. 162" />
          </Field>
        </div>

        {/* Heart-rate recovery. Expanded by default after intervals, where it means
            something — after an easy run HR is already low and the drop says little. */}
        <div className="rounded-2xl p-3" style={{ background: "var(--surface)" }}>
          <button
            type="button"
            onClick={() => setShowHrr((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <div className="text-left">
              <p className="text-[10px] font-bold tracking-wider" style={{ color: "var(--muted)" }}>
                HEART RATE RECOVERY
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                {isHard
                  ? "Worth doing today — stand still and read your watch."
                  : "Most useful after hard efforts."}
              </p>
            </div>
            {showHrr ? <ChevronUp size={16} style={{ color: "var(--muted)" }} />
                     : <ChevronDown size={16} style={{ color: "var(--muted)" }} />}
          </button>

          {showHrr && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Field label="On finish"><NumInput value={hrEnd} onChange={setHrEnd} placeholder="170" /></Field>
                <Field label="After 60s"><NumInput value={hr60} onChange={setHr60} placeholder="145" /></Field>
                <Field label="After 120s"><NumInput value={hr120} onChange={setHr120} placeholder="128" /></Field>
              </div>
              {/* Shown live, never stored — the raw numbers are what's saved, so the
                  definition of "recovery" stays changeable later. */}
              {hrEnd && (hr60 || hr120) && (
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  Drop:
                  {hr60 && <> <span className="font-bold" style={{ color: "var(--foreground)" }}>
                    {Number(hrEnd) - Number(hr60)} bpm</span> at 1 min</>}
                  {hr60 && hr120 && " · "}
                  {hr120 && <><span className="font-bold" style={{ color: "var(--foreground)" }}>
                    {Number(hrEnd) - Number(hr120)} bpm</span> at 2 min</>}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Conditions. Without these, a summer run and a winter run at the same HR
            aren't comparable — and that's exactly the comparison you'll want later. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Surface">
            <select
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              className="w-full h-12 px-3 rounded-xl outline-none text-sm"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
            >
              <option value="">Not recorded</option>
              {SURFACES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Temperature (°C)">
            <NumInput value={temp} onChange={setTemp} placeholder="e.g. 14" allowNegative />
          </Field>
        </div>

        <Field label="Notes — optional">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it feel? Legs, breathing, anything unusual."
            rows={3}
            className="w-full px-4 py-3 rounded-xl outline-none text-sm resize-none"
            style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>
      </div>

      <button
        onClick={handleSave}
        disabled={!duration || saving}
        className="w-full h-14 rounded-2xl font-bold text-base transition-all active:scale-95 disabled:opacity-50"
        style={{ background: "#2563eb", color: "#fff" }}
      >
        {saving ? "Saving…" : "Log Run"}
      </button>

      <button
        onClick={() => router.back()}
        className="w-full h-11 rounded-xl text-sm font-medium"
        style={{ color: "var(--muted)" }}
      >
        Cancel
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-2" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function NumInput({
  value, onChange, placeholder, allowNegative,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; allowNegative?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={allowNegative ? "text" : "numeric"}
      className="w-full h-12 px-3 rounded-xl outline-none text-sm"
      style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
    />
  );
}

export default function LogRunPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "#60a5fa", borderTopColor: "transparent" }} />
    </div>}>
      <LogRunForm />
    </Suspense>
  );
}
