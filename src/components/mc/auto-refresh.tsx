"use client";
// Re-reads the server-rendered page (authoritative bridge reads) while a task is not yet terminal. Never infers
// progress locally; it only asks the server to read again, and stops once the task reaches a terminal state.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ active, intervalMs = 5000, label }: { active: boolean; intervalMs?: number; label?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  useEffect(() => {
    if (!active || !on) return;
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, on, intervalMs, router]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>{active ? (on ? label ?? `Re-reading the Hermes board every ${intervalMs / 1000}s until this task finishes.` : "Automatic re-reading paused.") : "Task is in a terminal state; not re-reading automatically."}</span>
      {active && (
        <button type="button" onClick={() => setOn((v) => !v)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-slate-500">
          {on ? "Pause" : "Resume"}
        </button>
      )}
      <button type="button" onClick={() => router.refresh()} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-slate-500">
        Refresh now
      </button>
    </div>
  );
}
