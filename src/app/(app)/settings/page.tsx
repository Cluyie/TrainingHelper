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

type DayState = "rest" | "gym" | "home";

function buildDayMap(gymDays: DayOfWeek[], homeDays: DayOfWeek[]): Record<DayOfWeek, DayState> {
  const map = {} as Record<DayOfWeek, DayState>;
  for (const d of DAYS) map[d.key] = "rest";
  for (const d of gymDays) map[d] = "gym";
  for (const d of homeDays) map[d] = "home";
  return map;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Partial<UserSettings>>({
    training_days: ["monday", "wednesday", "friday"],
    home_days: ["tuesday", "thursday"],
    session_duration_min: 60,
    equipment: ["gym"],
    current_phase: 1,
    stretching_days_per_week: 3,
    stretching_duration_min: 25,
  });

  const [dayMap, setDayMap] = useState<Record<DayOfWeek, DayState>>(() =>
    buildDayMap(
      ["monday", "wednesday", "friday"],
      ["tuesday", "thursday"]
    )
  );

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setSettings(data);
          setDayMap(buildDayMap(data.training_days ?? [], data.home_days ?? []));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function cycleDay(day: DayOfWeek) {
    setDayMap((prev) => {
      const current = prev[day];
      const gymDays = Object.entries(prev).filter(([, v]) => v === "gym").length;
      const homeDays = Object.entries(prev).filter(([, v]) => v === "home").length;
      const totalActive = gymDays + homeDays;

      let next: DayState;
      if (current === "rest") {
        // Can add if under 5 total
        if (totalActive >= 5) return prev;
        next = "gym";
      } else if (current === "gym") {
        next = "home";
      } else {
        next = "rest";
      }

      return { ...prev, [day]: next };
    });
  }

  // Sync dayMap → settings
  useEffect(() => {
    const gymDays = DAYS.filter((d) => dayMap[d.key] === "gym").map((d) => d.key);
    const homeDays = DAYS.filter((d) => dayMap[d.key] === "home").map((d) => d.key);
    setSettings((s) => ({ ...s, training_days: gymDays, home_days: homeDays }));
  }, [dayMap]);

  async function handleSave() {
    const gymDays = settings.training_days ?? [];
    const homeDays = settings.home_days ?? [];
    if (gymDays.length + homeDays.length !== 5) return;
    if (gymDays.length === 0) return;

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

  const gymDays = Object.values(dayMap).filter((v) => v === "gym").length;
  const homeDays = Object.values(dayMap).filter((v) => v === "home").length;
  const totalActive = gymDays + homeDays;
  const canSave = totalActive === 5 && gymDays >= 1;

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

      {/* Training days */}
      <Section title="Training Schedule">
        <div className="flex items-start gap-2 mb-4">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: "var(--muted)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            Tap to cycle each day: <span className="font-semibold">Rest → Gym → Home → Rest</span>.
            Pick exactly 5 training days total. Gym needs weights; home is bodyweight only.
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {DAYS.map(({ key, short }) => {
            const state = dayMap[key];
            const isGym = state === "gym";
            const isHome = state === "home";
            return (
              <button key={key} onClick={() => cycleDay(key)}
                className="h-14 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
                style={{
                  background: isGym ? "var(--accent)" : isHome ? "#10b981" : "var(--surface-2)",
                  color: isGym || isHome ? "#fff" : "var(--muted)",
                  border: `1px solid ${isGym ? "var(--accent)" : isHome ? "#10b981" : "var(--border)"}`,
                }}
              >
                {isGym ? <Dumbbell size={12} /> : isHome ? <Home size={12} /> : null}
                {short}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "var(--accent)" }} />
            <span style={{ color: "var(--muted)" }}>{gymDays} gym</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "#10b981" }} />
            <span style={{ color: "var(--muted)" }}>{homeDays} home</span>
          </div>
          <span className="ml-auto font-semibold" style={{ color: totalActive === 5 ? "var(--accent)" : "var(--muted)" }}>
            {totalActive}/5 days
          </span>
        </div>

        {totalActive === 5 && (
          <div className="mt-3 px-3 py-2 rounded-xl text-xs" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
            <span className="font-semibold">Program: </span>
            Gym days rotate A → B → C (Hinge/Pull · Squat/Push · Hip/Carry).
            Home days rotate A → B (Core/Push · Lower/Core).
          </div>
        )}
      </Section>

      {/* Session Duration */}
      <Section title="Session Duration">
        <div className="flex gap-2">
          {[45, 60, 75, 90].map((min) => {
            const active = settings.session_duration_min === min;
            return (
              <button key={min} onClick={() => setSettings((p) => ({ ...p, session_duration_min: min }))}
                className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all"
                style={{ background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#fff" : "var(--muted)" }}>
                {min}m
              </button>
            );
          })}
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
        <div className="space-y-4">
          <div>
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
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Duration per session</p>
            <div className="flex gap-2">
              {[20, 25, 30, 40].map((min) => {
                const active = settings.stretching_duration_min === min;
                return (
                  <button key={min} onClick={() => setSettings((p) => ({ ...p, stretching_duration_min: min }))}
                    className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: active ? "#a78bfa" : "var(--surface-2)", color: active ? "#fff" : "var(--muted)" }}>
                    {min}m
                  </button>
                );
              })}
            </div>
          </div>
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
        </div>
      </Section>

      <button onClick={handleSave} disabled={saving || !canSave}
        className="w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-95 disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#fff" }}>
        {saving ? "Generating program…" : canSave ? "Save & Generate Program" : `Select exactly 5 days (${totalActive}/5)`}
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
