"use client";

import { cn } from "@/lib/utils";
import { LABELS } from "@/lib/headquarters/view-model.mjs";

export type Tone = "cyan" | "emerald" | "amber" | "rose" | "slate" | "violet";

const TONE_CLASSES: Record<Tone, string> = {
  cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
  emerald: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  amber: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  rose: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  slate: "border-white/10 bg-white/[0.04] text-slate-300",
  violet: "border-violet-400/25 bg-violet-400/10 text-violet-200",
};

export const EVIDENCE_TONE: Record<string, Tone> = {
  provider_read_verified: "emerald",
  page_responds: "cyan",
  source_inspected: "violet",
  project_exists: "slate",
  user_reported: "amber",
  unverified: "slate",
};

export const RECOMMENDATION_TONE: Record<string, Tone> = {
  keep: "emerald",
  integrate: "cyan",
  reference: "violet",
  consolidate_candidate: "amber",
  park: "slate",
  unreviewed: "slate",
};

export const SEVERITY_TONE: Record<string, Tone> = { critical: "rose", high: "amber", medium: "cyan", info: "slate" };

export const READINESS_TONE: Record<string, Tone> = {
  unavailable: "slate",
  not_integrated: "slate",
  pending_decision: "amber",
  unknown: "slate",
  open: "rose",
};

export function label(group: string, value: string | null | undefined) {
  if (!value) return "—";
  return (LABELS as Record<string, Record<string, string>>)[group]?.[value] ?? value;
}

export function Pill({ tone = "slate", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-white/[0.07] bg-slate-900/40 p-4 sm:p-5", className)}>
      {(title || eyebrow || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/60">{eyebrow}</p>}
            {title && <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function BulletList({ title, items, empty = "None recorded in this snapshot." }: { title: string; items: string[]; empty?: string }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-6 text-slate-300">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cyan-400/60" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

export function TextButton({ onClick, children, className }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
        className
      )}
    >
      {children}
    </button>
  );
}
