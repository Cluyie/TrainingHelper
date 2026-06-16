"use client";

import { AlertTriangle } from "lucide-react";
import { fmt, statusFor, type NutrientStatus } from "@/lib/nutrition-client";
import type { TargetDirection } from "@/types";

interface Props {
  label: string;
  unit: string;
  /** Food-only total. null = USDA had no data for this nutrient. */
  food: number | null;
  /** Daily supplement dose (0 if none). */
  supplement?: number;
  target: number;
  direction: TargetDirection;
  /** Compact = tighter row for Tier 2 lists. */
  compact?: boolean;
  /** When false (e.g. net-carb limit toggled off), never show warning styling. */
  enforce?: boolean;
}

const COLORS: Record<NutrientStatus, string> = {
  ok: "var(--accent)",
  below: "var(--warning)",
  over: "var(--warning)",
  nodata: "var(--muted)",
};

export default function NutrientBar({
  label,
  unit,
  food,
  supplement = 0,
  target,
  direction,
  compact,
  enforce = true,
}: Props) {
  const hasData = food != null || supplement > 0;
  const total = (food ?? 0) + supplement;
  const rawStatus = statusFor(total, hasData, target, direction);
  const status: NutrientStatus = !enforce && hasData ? "ok" : rawStatus;
  const color = COLORS[status];

  // Short word + hover tooltip so the colour/⚠️ explains itself.
  const targetStr = `${fmt(target, unit)} ${unit}`;
  const statusWord = status === "below" ? "low" : status === "over" ? "over" : "";
  const tip =
    status === "below"
      ? `Below your daily target (${targetStr}) — aim for more today`
      : status === "over"
      ? `Over your daily limit (${targetStr})`
      : status === "nodata"
      ? "No data for this nutrient in the food database"
      : direction === "limit"
      ? `Under your daily limit (${targetStr}) — good`
      : `Daily target reached (${targetStr})`;

  const pct = target > 0 ? (total / target) * 100 : 0;
  const foodPct = target > 0 ? Math.min(100, ((food ?? 0) / target) * 100) : 0;
  const suppPct = target > 0 ? Math.min(100 - foodPct, (supplement / target) * 100) : 0;

  return (
    <div className={compact ? "py-1.5" : "py-1"} title={tip}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium flex items-center gap-1.5">
          {label}
          {(status === "below" || status === "over") && (
            <AlertTriangle size={13} style={{ color: "var(--warning)" }} aria-label={tip} />
          )}
        </span>
        {hasData ? (
          <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
            <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
              {fmt(total, unit)}
            </span>{" "}
            / {fmt(target, unit)} {unit}
            <span className="ml-1.5" style={{ color }}>
              {Math.round(pct)}%
            </span>
            {statusWord && (
              <span className="ml-1" style={{ color: "var(--warning)" }}>· {statusWord}</span>
            )}
          </span>
        ) : (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          >
            no data
          </span>
        )}
      </div>

      {/* progress bar: food segment + supplement segment */}
      <div
        className="h-2 rounded-full overflow-hidden flex"
        style={{ background: "var(--surface-2)" }}
      >
        {hasData && (
          <>
            <div style={{ width: `${foodPct}%`, background: color, transition: "width .3s" }} />
            {suppPct > 0 && (
              <div
                style={{
                  width: `${suppPct}%`,
                  background: color,
                  opacity: 0.45,
                  transition: "width .3s",
                }}
              />
            )}
          </>
        )}
      </div>

      {supplement > 0 && hasData && (
        <p className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>
          Food {fmt(food ?? 0, unit)} · Supp {fmt(supplement, unit)} {unit}
        </p>
      )}
    </div>
  );
}
