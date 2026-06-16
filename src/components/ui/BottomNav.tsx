"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Dumbbell, PersonStanding, Wind, BarChart2, Utensils } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Home" },
  { href: "/strength", icon: Dumbbell, label: "Strength" },
  { href: "/running", icon: Wind, label: "Running" },
  { href: "/stretching", icon: PersonStanding, label: "Stretch" },
  { href: "/nutrition", icon: Utensils, label: "Food" },
  { href: "/analytics", icon: BarChart2, label: "Progress" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t z-50"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 flex-1 py-1 transition-opacity"
              style={{ opacity: active ? 1 : 0.45 }}
            >
              <Icon
                size={22}
                style={{ color: active ? "var(--accent)" : "var(--foreground)" }}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span
                className="text-[10px] font-medium"
                style={{ color: active ? "var(--accent)" : "var(--foreground)" }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
