"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, Dumbbell, Info } from "lucide-react";
import type { UserSettings, DayOfWeek } from "@/types";
import { PROGRAM, WEEK_FRAME } from "@/lib/program-generator";

const DAYS: { key: DayOfWeek; short: string }[] = [
  { key: "monday", short: "Mon" },
  { key: "tuesday", short: "Tue" },
  { key: "wednesday", short: "Wed" },
  { key: "thursday", short: "Thu" },
  { key: "friday", short: "Fri" },
  { key: "saturday", short: "Sat" },
  { key: "sunday", short: "Sun" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Partial<UserSettings>>({
    equipment: ["gym"],
    current_phase: 1,
    no_gym_days: ["saturday", "sunday"],
    stretching_days_per_week: 3,
    goal: "maintain",
  });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data) setSettings(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const profileComplete =
    !!settings.sex && !!settings.birth_year && !!settings.height_cm &&
    !!settings.activity_level && !!settings.goal;

  async function handleSave() {
    if (!profileComplete) return;

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      // Program generation can fail (e.g. the catalogue is missing an exercise). Say so
      // instead of navigating away as if it worked.
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setSaveError(body?.error ?? "Saving failed — your program was not regenerated.");
        return;
      }
      router.push("/");
    } catch {
      setSaveError("Saving failed — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const canSave = profileComplete;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <Settings size={22} style={{ color: "var(--accent)" }} />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* The week is fixed by the program — nothing to place, so this only shows it. */}
      <Section title="Your Week">
        <div className="space-y-1.5">
          {DAYS.map(({ key, short }) => {
            const session = PROGRAM.find((d) => d.day === key);
            return (
              <div key={key} className="flex items-start gap-3 px-3 py-2 rounded-xl text-xs"
                style={{ background: "var(--surface-2)" }}>
                <span className="w-8 shrink-0 font-bold">{short}</span>
                <span className="flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                  {session && <Dumbbell size={12} className="shrink-0" style={{ color: "var(--accent)" }} />}
                  {session ? `${session.label}${session.zone2After ? " · then Zone 2" : ""}` : WEEK_FRAME[key]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 mt-3">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: "var(--muted)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            6-week blocks: weeks 1–5 progress, week 6 is a deload. Saturday is the lowest-fatigue
            day, ahead of Sunday&apos;s rest and Monday&apos;s hard run. Runs are logged, not planned.
          </p>
        </div>
      </Section>

      {/* Stretching */}
      <Section title="Stretching / Yoga">
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Sessions per week</p>
        <div className="flex gap-2">
          {[2, 3, 4, 5].map((n) => {
            const active = settings.stretching_days_per_week === n;
            return (
              <button key={n} onClick={() => setSettings((p) => ({ ...p, stretching_days_per_week: n }))}
                className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all"
                style={{ background: active ? "#a78bfa" : "var(--surface-2)", color: active ? "#fff" : "var(--muted)" }}>
                {n}×
              </button>
            );
          })}
        </div>
      </Section>

      {/* About you — feeds adaptive nutrition targets (optional) */}
      <Section title="About you">
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          Used to estimate your calorie & protein targets. Optional — the nutrition
          tracker falls back to defaults until these and a weigh-in exist.
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Sex</p>
            <div className="flex gap-2">
              {(["male", "female"] as const).map((s) => {
                const active = settings.sex === s;
                return (
                  <button key={s} onClick={() => setSettings((p) => ({ ...p, sex: s }))}
                    className="flex-1 h-11 rounded-xl text-sm font-semibold capitalize transition-all"
                    style={{ background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#fff" : "var(--muted)" }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Birth year</p>
              <input type="number" inputMode="numeric" placeholder="1992"
                value={settings.birth_year ?? ""}
                onChange={(e) => setSettings((p) => ({ ...p, birth_year: e.target.value ? Number(e.target.value) : null }))}
                className="w-full h-11 px-3 rounded-xl text-sm outline-none"
                style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
            </div>
            <div className="flex-1">
              <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Height (cm)</p>
              <input type="number" inputMode="decimal" placeholder="182"
                value={settings.height_cm ?? ""}
                onChange={(e) => setSettings((p) => ({ ...p, height_cm: e.target.value ? Number(e.target.value) : null }))}
                className="w-full h-11 px-3 rounded-xl text-sm outline-none"
                style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
            </div>
          </div>

          <div>
            <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Activity level</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["sedentary", "Sedentary"], ["light", "Light"],
                ["moderate", "Moderate"], ["very", "Very active"],
              ] as const).map(([key, label]) => {
                const active = settings.activity_level === key;
                return (
                  <button key={key} onClick={() => setSettings((p) => ({ ...p, activity_level: key }))}
                    className="h-11 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#fff" : "var(--muted)" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
              Include your training — pick how active you are overall. With several workouts + runs a
              week that&apos;s usually &ldquo;Very active&rdquo;. This is only a starting estimate; the app learns
              your real burn from your weight trend over ~2 weeks.
            </p>
          </div>

          <div>
            <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Goal</p>
            <div className="flex gap-2">
              {([
                ["cut", "Cut"], ["maintain", "Maintain"], ["lean_gain", "Lean gain"],
              ] as const).map(([key, label]) => {
                const active = (settings.goal ?? "maintain") === key;
                return (
                  <button key={key} onClick={() => setSettings((p) => ({ ...p, goal: key }))}
                    className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#fff" : "var(--muted)" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
              You can switch this anytime in Nutrition settings.
            </p>
          </div>
        </div>
      </Section>

      {saveError && (
        <p className="text-sm rounded-xl px-3 py-2" style={{ background: "#ef44441a", color: "#ef4444" }}>
          {saveError}
        </p>
      )}

      <button onClick={handleSave} disabled={saving || !canSave}
        className="w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-95 disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#fff" }}>
        {saving
          ? "Generating program…"
          : !profileComplete
          ? "Complete your profile above to continue"
          : "Save & Generate Program"}
      </button>

      <button onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm transition-all"
        style={{ color: "var(--muted)" }}>
        <LogOut size={16} />
        Sign out
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}
