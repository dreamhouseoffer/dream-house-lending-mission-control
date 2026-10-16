"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, Layers, PlugZap, ShieldAlert, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_FILTERS, PLATFORMS, FAMILIES } from "@/lib/headquarters/model.mjs";
import { HQ_TABS, formatObservedDate, parseTabHash } from "@/lib/headquarters/view-model.mjs";
import type { HqFilters, HqSnapshot } from "@/lib/headquarters/types";
import { EmptyState, Panel, Pill, SEVERITY_TONE, TextButton, label } from "./primitives";
import { SystemsMap } from "./systems-map";
import { Inventory } from "./inventory";
import { Readiness, Roadmap } from "./plan-views";

type TabId = "overview" | "map" | "inventory" | "roadmap" | "readiness";

export function HeadquartersView({ snapshot }: { snapshot: HqSnapshot }) {
  const [tab, setTabState] = useState<TabId>("overview");
  const [filters, setFilters] = useState<HqFilters>({ ...DEFAULT_FILTERS });
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [mapSelection, setMapSelection] = useState<string | null>(null);
  const [phaseId, setPhaseId] = useState<string | null>(snapshot.roadmap[0]?.id ?? null);

  useEffect(() => {
    const sync = () => setTabState(parseTabHash(window.location.hash) as TabId);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Focus is a one-shot request; drop it when leaving inventory so a remount never reopens stale details.
  useEffect(() => {
    if (tab !== "inventory") setFocus(null);
  }, [tab]);

  const clearFocus = useCallback(() => setFocus(null), []);

  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    window.history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openInventory = useCallback(
    (patch: Partial<HqFilters> = {}, assetId?: string) => {
      setFilters({ ...DEFAULT_FILTERS, ...patch });
      setFocus(assetId ? { id: assetId, nonce: Date.now() } : null);
      setTab("inventory");
    },
    [setTab]
  );

  const openMap = useCallback(
    (id: string | null) => {
      setMapSelection(id);
      setTab("map");
    },
    [setTab]
  );

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.07),transparent_55%),linear-gradient(180deg,#0b1220_0%,#070b14_100%)]">
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        <Header snapshot={snapshot} />

        <nav
          role="tablist"
          aria-label="Headquarters views"
          className="sticky top-0 z-20 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-white/[0.06] bg-[#0a101c]/90 px-4 py-2 backdrop-blur [scrollbar-width:none] sm:mx-0 sm:rounded-2xl sm:border sm:px-1.5 [&::-webkit-scrollbar]:hidden"
        >
          {HQ_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id as TabId)}
              className={cn(
                "shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                tab === t.id ? "bg-cyan-400/15 text-cyan-100 shadow-inner shadow-cyan-400/10" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-5" role="tabpanel" aria-label={HQ_TABS.find((t) => t.id === tab)?.label}>
          {tab === "overview" && <Overview snapshot={snapshot} setTab={setTab} openInventory={openInventory} openMap={openMap} />}
          {tab === "map" && (
            <SystemsMap snapshot={snapshot} selectedId={mapSelection} onSelect={setMapSelection} openInventory={openInventory} />
          )}
          {tab === "inventory" && (
            <Inventory snapshot={snapshot} filters={filters} setFilters={setFilters} focus={focus} onFocusConsumed={clearFocus} openMap={openMap} />
          )}
          {tab === "roadmap" && <Roadmap snapshot={snapshot} phaseId={phaseId} setPhaseId={setPhaseId} />}
          {tab === "readiness" && <Readiness snapshot={snapshot} openInventory={openInventory} />}
        </div>
      </div>
    </div>
  );
}

function Header({ snapshot }: { snapshot: HqSnapshot }) {
  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300/70">
            <Building2 size={13} /> Mission Control
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Headquarters</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">
            Systems map, inventory, and roadmap from a dated audit. Read-only: nothing on this page runs, approves, or deploys work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone="cyan">
            <Layers size={12} /> {snapshot.modeLabel}
          </Pill>
          <Pill tone="violet">
            <CalendarClock size={12} /> {snapshot.snapshotLabel} · {formatObservedDate(snapshot.observedAt, snapshot.timezone)}
          </Pill>
          <Pill tone="amber">
            <Unplug size={12} /> {snapshot.liveExecutionBridgeLabel}
          </Pill>
        </div>
      </div>

      {!snapshot.available && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <p className="font-semibold">Snapshot unavailable</p>
            <p className="mt-1 leading-6 text-amber-100/80">{snapshot.message}</p>
            <p className="mt-1 text-amber-100/60">No counts or inventory are shown until a snapshot loads. Nothing is substituted.</p>
          </div>
        </div>
      )}
    </header>
  );
}

const PRIORITIES: { title: string; body: string; tab: TabId }[] = [
  { title: "Contain data exposure", body: "Resolve security findings before adding new capability.", tab: "readiness" },
  { title: "Establish one task authority", body: "A single durable task record shared by every interface.", tab: "roadmap" },
  { title: "Prove one approved draft workflow", body: "Research → draft → verify → approve → private staging receipt.", tab: "roadmap" },
];

function Overview({
  snapshot,
  setTab,
  openInventory,
  openMap,
}: {
  snapshot: HqSnapshot;
  setTab: (t: TabId) => void;
  openInventory: (patch?: Partial<HqFilters>, assetId?: string) => void;
  openMap: (id: string | null) => void;
}) {
  const s = snapshot.summary;
  const owner = snapshot.nodes.find((n) => n.kind === "person");
  const orchestrator = snapshot.nodes.find((n) => n.kind === "orchestrator");
  const urgent = snapshot.findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const maxFamily = s ? Math.max(1, ...FAMILIES.map((f: string) => s.byFamily[f] ?? 0)) : 1;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { role: "Owner · approvals", id: owner?.id ?? null, title: owner?.label ?? "Not recorded in snapshot", note: owner?.note ?? "" },
          { role: "Orchestrator", id: orchestrator?.id ?? null, title: orchestrator?.label ?? "Not recorded in snapshot", note: orchestrator?.note ?? "" },
          { role: "Headquarters", id: null, title: "Mission Control", note: "This app: presentation and authenticated requests — not a second worker fleet." },
        ].map(({ role, id, title, note }, i) => (
          <button
            key={role}
            type="button"
            onClick={() => openMap(id)}
            className="group relative rounded-2xl border border-white/[0.07] bg-slate-900/50 p-4 text-left transition-colors hover:border-cyan-400/30"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{role}</p>
            <p className="mt-2 font-semibold text-white">{title}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{note}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300/80 group-hover:text-cyan-200">
              View on systems map <ArrowRight size={12} />
            </span>
            {i < 2 && <span className="absolute -right-2 top-1/2 hidden size-4 -translate-y-1/2 rotate-45 border-r border-t border-white/10 bg-[#0b1220] md:block" />}
          </button>
        ))}
      </div>

      <Panel eyebrow="Live status" title="Execution and approvals">
        <div className="grid gap-3 sm:grid-cols-3">
          {["Work running", "Awaiting approval", "Last heartbeat"].map((name) => (
            <div key={name} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <p className="text-xs text-slate-500">{name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-300">
                <PlugZap size={14} className="text-slate-500" /> Unavailable
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{snapshot.liveExecutionBridgeLabel}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          eyebrow={`${snapshot.snapshotLabel} · ${formatObservedDate(snapshot.observedAt, snapshot.timezone)}`}
          title="Platform assets"
          action={s?.coverageComplete ? <Pill tone="emerald">Matches audit coverage</Pill> : undefined}
        >
          {s ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PLATFORMS.map((p: string) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => openInventory({ platform: p })}
                    className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-left transition-colors hover:border-cyan-400/30"
                  >
                    <p className="text-xs text-slate-500">{label("platform", p)}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{s.byPlatform[p] ?? 0}</p>
                  </button>
                ))}
              </div>
              <p className="mt-3 flex gap-2 text-xs leading-5 text-amber-200/80">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {s.total} platform assets in total. These overlap across platforms — they are not counts of unique products.
              </p>
              <div className="mt-5 space-y-2">
                {FAMILIES.map((f: string) => (
                  <button key={f} type="button" onClick={() => openInventory({ family: f })} className="group flex w-full items-center gap-3 text-left">
                    <span className="w-36 shrink-0 truncate text-xs text-slate-400 group-hover:text-slate-200">{label("family", f)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <span className="block h-full rounded-full bg-gradient-to-r from-cyan-400/70 to-emerald-400/70" style={{ width: `${((s.byFamily[f] ?? 0) / maxFamily) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right text-xs tabular-nums text-slate-300">{s.byFamily[f] ?? 0}</span>
                  </button>
                ))}
                <p className="pt-1 text-[11px] text-slate-500">Family grouping is organizational; it does not imply integration.</p>
              </div>
            </>
          ) : (
            <EmptyState title="No asset counts" body="Counts are computed only from a loaded snapshot." />
          )}
        </Panel>

        <div className="space-y-5">
          <Panel eyebrow="Decision order" title="Priorities">
            <ol className="space-y-2">
              {PRIORITIES.map((p, i) => (
                <li key={p.title}>
                  <button
                    type="button"
                    onClick={() => setTab(p.tab)}
                    className="flex w-full gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-left transition-colors hover:border-cyan-400/30"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-bold text-cyan-200">{i + 1}</span>
                    <span>
                      <span className="block text-sm font-semibold text-white">{p.title}</span>
                      <span className="block text-xs leading-5 text-slate-400">{p.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Panel>

          {snapshot.notices.sensitiveLeadNotice && (
            <div className="flex gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/[0.08] p-4">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-300" />
              <div>
                <p className="text-sm font-semibold text-rose-100">{snapshot.notices.sensitiveLeadNotice}</p>
                <p className="mt-1 text-xs leading-5 text-rose-100/70">Containment is a proposed action requiring approval. Not re-tested from here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Panel eyebrow="Security & risk" title="Top findings" action={<TextButton onClick={() => setTab("readiness")}>All readiness items <ArrowRight size={12} /></TextButton>}>
        {urgent.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {urgent.map((f) => (
              <div key={f.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <Pill tone={SEVERITY_TONE[f.severity]}>{label("severity", f.severity)}</Pill>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-slate-400">{f.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No critical or high findings in this snapshot" body={snapshot.available ? undefined : "Snapshot unavailable."} />
        )}
      </Panel>
    </div>
  );
}
