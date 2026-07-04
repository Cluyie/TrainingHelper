"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wind, CheckCircle2 } from "lucide-react";
import { todayISO } from "@/lib/nutrition-client";
import type { RunningSession } from "@/types";

function LogRunForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [session, setSession] = useState<RunningSession | null>(null);
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    fetch("/api/running")
      .then((r) => r.json())
      .then((data: RunningSession[]) => {
        const s = data.find((x) => x.id === sessionId);
        setSession(s ?? null);
      });
  }, [sessionId]);

  async function handleSave() {
    if (!sessionId || !duration) return;
    setSaving(true);
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
            Week {session.program_week} Target
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

        <Field label="Notes — optional">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it feel? Pace, conditions, etc."
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
