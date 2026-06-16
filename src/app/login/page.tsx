"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!locked) return;
    const interval = setInterval(() => {
      setLockRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setLocked(false);
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [locked]);

  const submit = useCallback(async (pinValue: string) => {
    if (pinValue.length !== 4 || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = await res.json();

      if (data.success) {
        router.push("/");
        return;
      }

      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);

      if (data.error === "locked") {
        setLocked(true);
        setLockRemaining(data.remainingMin * 60);
        setError(`Too many attempts. Locked for ${data.remainingMin} min.`);
      } else if (data.locked) {
        setLocked(true);
        setLockRemaining(10 * 60);
        setError("Too many attempts. Locked for 10 min.");
      } else {
        const left = data.attemptsLeft;
        setError(left === 0 ? "Locked out." : `Wrong PIN. ${left} attempt${left === 1 ? "" : "s"} left.`);
      }
    } catch {
      setError("Something went wrong.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [loading, router]);

  const handleKey = useCallback((key: string) => {
    if (locked || loading) return;
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      setError(null);
      return;
    }
    if (key === "") return;
    setPin((p) => {
      const next = p.length < 4 ? p + key : p;
      if (next.length === 4) {
        setTimeout(() => submit(next), 80);
      }
      return next;
    });
  }, [locked, loading, submit]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 px-6"
      style={{ background: "var(--background)" }}>

      {/* Logo / Title */}
      <div className="text-center">
        <div className="text-5xl mb-3">🏋️</div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Training Helper</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Enter your PIN to continue</p>
      </div>

      {/* PIN dots */}
      <div className={`flex gap-4 transition-transform ${shake ? "animate-shake" : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full border-2 transition-all duration-150"
            style={{
              background: i < pin.length ? "var(--accent)" : "transparent",
              borderColor: i < pin.length ? "var(--accent)" : "var(--border)",
            }}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-center" style={{ color: "var(--danger)" }}>
          {error}
          {locked && lockRemaining > 0 && ` (${formatTime(lockRemaining)})`}
        </p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {KEYS.map((key, i) => (
          <button
            key={i}
            onClick={() => handleKey(key)}
            disabled={key === "" || locked || loading}
            className="h-16 rounded-2xl text-xl font-semibold transition-all duration-100 active:scale-95 disabled:opacity-0"
            style={{
              background: key === "" ? "transparent" : "var(--surface-2)",
              color: "var(--foreground)",
            }}
            onMouseDown={(e) => e.currentTarget.style.background = key !== "" ? "var(--accent-dim)" : "transparent"}
            onMouseUp={(e) => e.currentTarget.style.background = key !== "" ? "var(--surface-2)" : "transparent"}
            onMouseLeave={(e) => e.currentTarget.style.background = key !== "" ? "var(--surface-2)" : "transparent"}
          >
            {key}
          </button>
        ))}
      </div>

      {loading && (
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      )}

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
