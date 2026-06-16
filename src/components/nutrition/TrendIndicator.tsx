"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function TrendIndicator({
  trend,
}: {
  trend: "up" | "down" | "stable";
}) {
  if (trend === "up") return <TrendingUp size={15} style={{ color: "var(--accent)" }} />;
  if (trend === "down") return <TrendingDown size={15} style={{ color: "var(--warning)" }} />;
  return <Minus size={15} style={{ color: "var(--muted)" }} />;
}
