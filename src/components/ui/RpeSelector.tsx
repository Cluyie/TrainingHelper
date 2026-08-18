"use client";

import { useState } from "react";
import { Info } from "lucide-react";

// Rate of Perceived Exertion, 1-10, rated just after finishing.
//
// The scale is worthless without the descriptions — a bare 1-10 row means
// everyone invents their own anchors and the numbers drift over months, which is
// exactly what ruins them for later analysis. So the meaning of the selected
// value is always on screen, and the full scale is one tap away.
//
// The wording is effort-based rather than pace-based on purpose: "could speak a
// few words" travels across running, carrying and squatting, where "hard" alone
// doesn't.
export const RPE_SCALE: Record<number, { label: string; detail: string }> = {
  1: { label: "Very easy", detail: "Barely working. Could keep going all day." },
  2: { label: "Easy", detail: "Light effort, breathing normal." },
  3: { label: "Easy", detail: "Comfortable. Full conversation — where Zone 2 belongs." },
  4: { label: "Steady", detail: "Working, but still talking in sentences." },
  5: { label: "Moderate", detail: "Noticeably working. Sentences getting shorter." },
  6: { label: "Somewhat hard", detail: "Breathing deep. Short sentences only." },
  7: { label: "Hard", detail: "Uncomfortable. A few words at a time." },
  8: { label: "Very hard", detail: "Tough to sustain. Single words. VO₂ intervals sit here." },
  9: { label: "Extremely hard", detail: "Nearly everything you have. Can't talk." },
  10: { label: "Maximal", detail: "Could not have done one more rep or one more minute." },
};

// Green through amber to red. Colour is a secondary cue only — the number and the
// wording carry the meaning, so this stays readable without relying on it.
function colourFor(v: number): string {
  if (v <= 3) return "#10b981";
  if (v <= 5) return "#84cc16";
  if (v <= 7) return "#f59e0b";
  return "#ef4444";
}

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  label?: string;
  hint?: string;
}

export default function RpeSelector({ value, onChange, label = "How hard did that feel?", hint }: Props) {
  const [showScale, setShowScale] = useState(false);

  return (
    <div className="rounded-2xl p-3 space-y-2.5" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-wider" style={{ color: "var(--muted)" }}>
          {label.toUpperCase()}
        </p>
        <button
          type="button"
          onClick={() => setShowScale((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: "var(--muted)" }}
        >
          <Info size={11} />
          {showScale ? "Hide scale" : "What do these mean?"}
        </button>
      </div>

      {hint && !showScale && (
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>{hint}</p>
      )}

      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              // Tapping the selected value clears it — RPE is optional, and there
              // must be a way back to "not recorded" rather than a wrong guess.
              onClick={() => onChange(active ? null : n)}
              className="h-9 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={{
                background: active ? colourFor(n) : "var(--surface-2)",
                color: active ? "#fff" : "var(--muted)",
                border: `1px solid ${active ? colourFor(n) : "transparent"}`,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* The selected value always explains itself. */}
      {value != null && !showScale && (
        <p className="text-xs leading-relaxed">
          <span className="font-bold" style={{ color: colourFor(value) }}>
            {value} · {RPE_SCALE[value].label}
          </span>
          <span style={{ color: "var(--muted)" }}> — {RPE_SCALE[value].detail}</span>
        </p>
      )}

      {showScale && (
        <div className="space-y-1 pt-0.5">
          {Object.entries(RPE_SCALE).map(([n, { label: l, detail }]) => (
            <div key={n} className="flex gap-2 text-[11px] leading-relaxed">
              <span
                className="w-5 shrink-0 text-center font-bold rounded"
                style={{ color: colourFor(Number(n)) }}
              >
                {n}
              </span>
              <span>
                <span className="font-semibold">{l}</span>
                <span style={{ color: "var(--muted)" }}> — {detail}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
