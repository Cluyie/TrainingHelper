"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, Dumbbell, Home, Info } from "lucide-react";
import type { UserSettings, DayOfWeek } from "@/types";

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

  function toggleNoGym(day: DayOfWeek) {
    setSettings((s) => {
      const current = s.no_gym_days ?? [];
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day];
      return { ...s, no_gym_days: next };
    });
  }

  const profileComplete =
    !!settings.sex && !!settings.birth_year && !!settings.height_cm &&
    !!settings.activity_level && !!settings.goal;

  // Three gym sessions need three reachable weekdays. Below that the planner drops to
  // two rather than stacking them — worth warning about, but not worth blocking on.
  const gymDaysFeasible = 7 - (settings.no_gym_days ?? []).length >= 3;

  async function handleSave() {
    if (!profileComplete) return;

    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      router.push("/");
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

      {/* Gym availability — the ONLY placement input left. The planner owns every
          other scheduling decision, because strength and running share one recovery
          budget and can only be balanced when one thing places them both. */}
      <Section title="Gym Availability">
        <div className="flex items-start gap-2 mb-4">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: "var(--muted)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            Tap any day you <span className="font-semibold">can&apos;t get to the gym</span>.
            Home sessions and runs can still be scheduled on those days — only the three
            gym days are kept away.
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {DAYS.map(({ key, short }) => {
            const blocked = (settings.no_gym_days ?? []).includes(key);
            return (
              <button key={key} onClick={() => toggleNoGym(key)}
                className="h-14 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
                style={{
                  background: blocked ? "var(--surface-2)" : "var(--accent)",
                  color: blocked ? "var(--muted)" : "#fff",
                  border: `1px solid ${blocked ? "var(--border)" : "var(--accent)"}`,
                }}
              >
                {blocked ? <Home size={12} /> : <Dumbbell size={12} />}
                {short}
              </button>
            );
          })}
        </div>

        {!gymDaysFeasible && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: "#f59e0b1a", color: "#b45309" }}>
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Fewer than three days left for the gym. The planner will drop to two gym
              sessions rather than cram them together.
            </span>
          </div>
        )}

        <div className="mt-3 px-3 py-2 rounded-xl text-xs" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
          <span className="font-semibold">Your week: </span>
          three gym days (Hinge/Pull · Squat/Push · Glute/Pull/Carry), two home days
          (bodyweight, table and ab wheel), the week&apos;s runs, and one full rest day.
          Hard running is kept clear of heavy legs automatically.
        </div>
      </Section>

      {/* Training Phase */}
      <Section title="Training Phase">
        <div className="flex gap-2 mb-2">
          {[1, 2, 3].map((phase) => {
            const active = settings.current_phase === phase;
            return (
              <button key={phase} onClick={() => setSettings((p) => ({ ...p, current_phase: phase as 1 | 2 | 3 }))}
                className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all"
                style={{ background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#fff" : "var(--muted)" }}>
                Phase {phase}
              </button>
            );
          })}
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {[
            "Conservative — shoulder and back safe. Perfect for returning athletes.",
            "Moderate loading — more variety, some overhead work unlocked.",
            "Full compound work — barbell training, heavier loading.",
          ][(settings.current_phase ?? 1) - 1]}
        </p>
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
