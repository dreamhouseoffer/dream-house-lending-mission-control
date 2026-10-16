"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, PlugZap, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { READINESS_CATEGORIES } from "@/lib/headquarters/model.mjs";
import { formatObservedDate } from "@/lib/headquarters/view-model.mjs";
import type { HqFilters, HqSnapshot } from "@/lib/headquarters/types";
import { BulletList, EmptyState, Panel, Pill, READINESS_TONE, SEVERITY_TONE, TextButton, label } from "./primitives";

export function Roadmap({
  snapshot,
  phaseId,
  setPhaseId,
}: {
  snapshot: HqSnapshot;
  phaseId: string | null;
  setPhaseId: (id: string) => void;
}) {
  const phases = snapshot.roadmap;
  const selected = phases.find((p) => p.id === phaseId) ?? phases[0];

  if (!phases.length || !selected) {
    return (
      <Panel eyebrow="Roadmap" title="Proposed phases">
        <EmptyState title="No roadmap in this snapshot" body={snapshot.available ? undefined : snapshot.message} />
      </Panel>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
      <Panel eyebrow={`${snapshot.snapshotLabel} · ${formatObservedDate(snapshot.observedAt, snapshot.timezone)}`} title="Proposed phases">
        <ol className="space-y-2">
          {phases.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPhaseId(p.id)}
                aria-pressed={p.id === selected.id}
                className={cn(
                  "flex w-full gap-3 rounded-xl border p-3 text-left transition-colors",
                  p.id === selected.id ? "border-cyan-400/40 bg-cyan-400/[0.08]" : "border-white/[0.06] bg-black/20 hover:border-cyan-400/25"
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-bold text-cyan-200">
                  {p.phase ?? i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{p.title}</span>
                  <span className="block line-clamp-2 text-xs leading-5 text-slate-400">{p.summary}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] text-slate-500">Every phase is planned only. Nothing here has started.</p>
      </Panel>

      <Panel
        eyebrow={`Phase ${selected.phase ?? phases.indexOf(selected) + 1}`}
        title={selected.title}
        action={<Pill tone="amber">Planned · not started</Pill>}
      >
        <p className="text-sm leading-6 text-slate-300">{selected.summary}</p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <BulletList title="Dependencies" items={selected.dependencies} />
          <BulletList title="Acceptance tests" items={selected.acceptanceTests} />
          <BulletList title="Approvals needed" items={selected.approvalsNeeded} />
        </div>
      </Panel>
    </div>
  );
}

export function Readiness({
  snapshot,
  openInventory,
}: {
  snapshot: HqSnapshot;
  openInventory: (patch?: Partial<HqFilters>, assetId?: string) => void;
}) {
  const assetLabel = (id: string) => snapshot.assets.find((a) => a.id === id)?.label ?? null;

  return (
    <div className="space-y-5">
      <Panel eyebrow="Live status" title="Execution bridge">
        <div className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <PlugZap size={18} className="mt-0.5 shrink-0 text-slate-500" />
          <div className="text-sm">
            <p className="font-semibold text-slate-200">{snapshot.liveExecutionBridgeLabel}</p>
            <p className="mt-1 leading-6 text-slate-400">
              Live runs, approvals, and heartbeats are unavailable here. This page reads a dated snapshot ({snapshot.modeLabel}) and does not run anything.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
          <p className="flex gap-2 text-xs leading-5 text-amber-100/80">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            The legacy queue records approvals only; approval does not prove execution.
          </p>
          <Link
            href="/milo-approvals"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/30 hover:text-cyan-100"
          >
            Open legacy queue <ArrowRight size={12} />
          </Link>
        </div>
      </Panel>

      <Panel eyebrow={`${snapshot.snapshotLabel} · ${formatObservedDate(snapshot.observedAt, snapshot.timezone)}`} title="Findings">
        {snapshot.findings.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {snapshot.findings.map((f) => {
              const assets = f.assetIds.filter((id) => assetLabel(id));
              return (
                <div key={f.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex gap-2 text-sm font-semibold text-white">
                      {(f.severity === "critical" || f.severity === "high") && <ShieldAlert size={14} className="mt-0.5 shrink-0 text-rose-300" />}
                      {f.title}
                    </p>
                    <Pill tone={SEVERITY_TONE[f.severity]}>{label("severity", f.severity)}</Pill>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">{f.detail}</p>
                  {assets.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {assets.map((id) => (
                        <TextButton key={id} onClick={() => openInventory({}, id)}>
                          {assetLabel(id)} <ArrowRight size={11} />
                        </TextButton>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No findings in this snapshot" body={snapshot.available ? undefined : snapshot.message} />
        )}
      </Panel>

      <Panel eyebrow="Readiness" title="Gaps, decisions, and limitations">
        {snapshot.readiness.length ? (
          <div className="space-y-5">
            {READINESS_CATEGORIES.map((cat: string) => {
              const items = snapshot.readiness.filter((r) => r.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label("readinessCategory", cat)}</p>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <div key={r.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-white">{r.title}</p>
                          <Pill tone={READINESS_TONE[r.state]}>{label("readinessState", r.state)}</Pill>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{r.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No readiness entries in this snapshot" body={snapshot.available ? undefined : snapshot.message} />
        )}
        {snapshot.limitations.length > 0 && (
          <div className="mt-5">
            <BulletList title="Snapshot limitations" items={snapshot.limitations} />
          </div>
        )}
      </Panel>
    </div>
  );
}
