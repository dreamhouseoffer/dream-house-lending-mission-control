"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EDGE_STYLES, buildFamilyGroups, connectionsFor, entityById, layoutControlPlane } from "@/lib/headquarters/view-model.mjs";
import type { HqAsset, HqFilters, HqNode, HqSnapshot } from "@/lib/headquarters/types";
import { EVIDENCE_TONE, EmptyState, Panel, Pill, RECOMMENDATION_TONE, TextButton, label } from "./primitives";

type EdgeStyle = { color: string; dash: string | null; width: number };
const edgeStyle = (verification: string): EdgeStyle => (EDGE_STYLES as Record<string, EdgeStyle>)[verification] ?? EDGE_STYLES.unverified;

const KIND_FILL: Record<string, string> = { person: "#34d399", orchestrator: "#22d3ee", system: "#a78bfa", service: "#94a3b8" };
const PLATFORM_SHORT: Record<string, string> = { github: "GH", vercel: "VC", replit: "RP", local: "LC" };

export function EdgeSwatch({ verification }: { verification: string }) {
  const s = edgeStyle(verification);
  return (
    <svg width="28" height="8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2="27" y2="4" stroke={s.color} strokeWidth={s.width + 0.5} strokeDasharray={s.dash ?? undefined} strokeLinecap="round" />
    </svg>
  );
}

export function EdgeLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-400">
      {Object.keys(EDGE_STYLES).map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5">
          <EdgeSwatch verification={v} /> {label("verification", v)}
        </span>
      ))}
    </div>
  );
}

export function SystemsMap({
  snapshot,
  selectedId,
  onSelect,
  openInventory,
}: {
  snapshot: HqSnapshot;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  openInventory: (patch?: Partial<HqFilters>, assetId?: string) => void;
}) {
  const layout = useMemo(() => layoutControlPlane(snapshot), [snapshot]);
  const groups = useMemo(() => buildFamilyGroups(snapshot), [snapshot]);
  const connected = useMemo(
    () => new Set(selectedId ? connectionsFor(snapshot, selectedId).map((c: { otherId: string }) => c.otherId) : []),
    [snapshot, selectedId]
  );
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId && window.innerWidth < 1024) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  if (!snapshot.available) {
    return <EmptyState title="Systems map unavailable" body={snapshot.message} />;
  }

  const select = (id: string) => onSelect(selectedId === id ? null : id);
  const dim = (id: string) => Boolean(selectedId) && selectedId !== id && !connected.has(id);

  return (
    <div className="space-y-5">
      <Panel
        eyebrow="Control plane"
        title="Who commands what"
        action={<EdgeLegend />}
      >
        <p className="-mt-2 mb-3 text-xs leading-5 text-slate-500">
          Solid green lines are runtime tested. Solid cyan lines come from platform metadata only (configuration was read, nothing
          was exercised). Short-dashed gray lines are source-wired, dashed amber lines are proposed and not built, and dotted lines are
          unverified claims. Select any node for details.
        </p>

        {/* Desktop: hub-and-ring diagram */}
        <div className="hidden overflow-hidden rounded-xl border border-white/[0.05] bg-[#060a12] lg:block">
          <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-auto w-full" role="group" aria-label="Control plane diagram">
            {layout.edges.map((e: { id: string; from: string; to: string; verification: string; x1: number; y1: number; x2: number; y2: number }) => {
              const s = edgeStyle(e.verification);
              const active = selectedId && (e.from === selectedId || e.to === selectedId);
              return (
                <line
                  key={e.id}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={s.color}
                  strokeWidth={active ? s.width + 1 : s.width}
                  strokeDasharray={s.dash ?? undefined}
                  strokeLinecap="round"
                  opacity={selectedId && !active ? 0.15 : 0.85}
                />
              );
            })}
            {layout.nodes.map((n: HqNode & { x: number; y: number; hub: boolean }) => {
              const selected = selectedId === n.id;
              const r = n.hub ? 30 : 20;
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={n.label}
                  onClick={() => select(n.id)}
                  onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), select(n.id))}
                  className="cursor-pointer focus:outline-none"
                  opacity={dim(n.id) ? 0.3 : 1}
                >
                  <circle cx={n.x} cy={n.y} r={r + 6} fill={KIND_FILL[n.kind]} opacity={selected ? 0.25 : 0.08} />
                  <circle cx={n.x} cy={n.y} r={r} fill="#0b1220" stroke={KIND_FILL[n.kind]} strokeWidth={selected ? 3 : 1.5} />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={n.hub ? 13 : 11} fontWeight={700} fill={KIND_FILL[n.kind]}>
                    {n.label.slice(0, 1).toUpperCase()}
                  </text>
                  <text x={n.x} y={n.y + r + 16} textAnchor="middle" fontSize={11.5} fill={selected ? "#fff" : "#cbd5e1"}>
                    {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Phone/tablet: readable list instead of a shrunken canvas */}
        <div className="grid gap-2 sm:grid-cols-2 lg:hidden">
          {snapshot.nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => select(n.id)}
              aria-pressed={selectedId === n.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                selectedId === n.id ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/[0.06] bg-black/20"
              )}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_FILL[n.kind] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{n.label}</span>
                <span className="block text-[11px] text-slate-500">
                  {label("nodeKind", n.kind)} · {connectionsFor(snapshot, n.id).length} connections
                </span>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div ref={detailRef} className="order-first scroll-mt-20 lg:order-last">
          <div className="lg:sticky lg:top-20">
            <DetailPanel snapshot={snapshot} selectedId={selectedId} onSelect={onSelect} openInventory={openInventory} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g: { family: string; label: string; assets: HqAsset[]; nodes: HqNode[] }) => {
            const expanded = openFamily === g.family;
            const total = g.assets.length + g.nodes.length;
            return (
              <section key={g.family} className="rounded-2xl border border-white/[0.07] bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setOpenFamily(expanded ? null : g.family)} className="flex min-w-0 items-center gap-2 text-left">
                    <ChevronDown size={15} className={cn("shrink-0 text-slate-500 transition-transform md:hidden", expanded && "rotate-180")} />
                    <span>
                      <span className="block text-sm font-semibold text-white">{g.label}</span>
                      <span className="block text-[11px] text-slate-500">{g.assets.length} platform assets{g.nodes.length ? ` · ${g.nodes.length} services` : ""}</span>
                    </span>
                  </button>
                  {g.assets.length > 0 && (
                    <TextButton onClick={() => openInventory({ family: g.family })}>
                      Inventory <ArrowRight size={11} />
                    </TextButton>
                  )}
                </div>
                {total === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">Nothing classified here.</p>
                ) : (
                  <div className={cn("mt-3 flex-wrap gap-1.5", expanded ? "flex" : "hidden md:flex")}>
                    {g.nodes.map((n) => (
                      <Chip key={n.id} active={selectedId === n.id} dim={dim(n.id)} linked={connected.has(n.id)} onClick={() => select(n.id)}>
                        <span className="size-1.5 rounded-full" style={{ background: KIND_FILL.service }} />
                        {n.label}
                      </Chip>
                    ))}
                    {g.assets.map((a) => (
                      <Chip key={a.id} active={selectedId === a.id} dim={dim(a.id)} linked={connected.has(a.id)} onClick={() => select(a.id)}>
                        <span className="font-mono text-[9px] text-slate-500">{PLATFORM_SHORT[a.platform]}</span>
                        {a.label}
                      </Chip>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">
            Family boxes are organizational grouping only, not integration. Chip prefixes: GH GitHub · VC Vercel · RP Replit · LC Local.
          </p>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  dim,
  linked,
  onClick,
  children,
}: {
  active: boolean;
  dim: boolean;
  linked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border px-2 py-1 text-xs transition-all",
        active
          ? "border-cyan-300/60 bg-cyan-400/20 text-white"
          : linked
            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
            : "border-white/[0.07] bg-white/[0.03] text-slate-300 hover:border-white/20",
        dim && "opacity-35"
      )}
    >
      {children}
    </button>
  );
}

type ConnView = { id: string; otherId: string; otherLabel: string; direction: string; verification: string; label: string; note: string };

function DetailPanel({
  snapshot,
  selectedId,
  onSelect,
  openInventory,
}: {
  snapshot: HqSnapshot;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  openInventory: (patch?: Partial<HqFilters>, assetId?: string) => void;
}) {
  const entity = selectedId ? (entityById(snapshot, selectedId) as { type: "asset" | "node"; item: HqAsset | HqNode } | null) : null;
  if (!entity) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-5 text-sm leading-6 text-slate-400">
        Select a node or asset to see what was observed, its connections, and the next move.
      </div>
    );
  }
  const conns = connectionsFor(snapshot, entity.item.id) as ConnView[];
  const asset = entity.type === "asset" ? (entity.item as HqAsset) : null;
  const node = entity.type === "node" ? (entity.item as HqNode) : null;

  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-4 shadow-xl shadow-black/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300/60">
            {asset ? `${label("platform", asset.platform)} asset` : label("nodeKind", node!.kind)}
          </p>
          <h3 className="mt-1 break-words text-base font-semibold text-white">{entity.item.label}</h3>
          {asset && <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{asset.identifier}</p>}
        </div>
        <button type="button" onClick={() => onSelect(null)} aria-label="Close details" className="rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200">
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill tone={EVIDENCE_TONE[entity.item.evidenceLevel]}>{label("evidence", entity.item.evidenceLevel)}</Pill>
        {asset && <Pill tone={RECOMMENDATION_TONE[asset.recommendation]}>{label("recommendation", asset.recommendation)}</Pill>}
        <Pill>{label("family", entity.item.family)}</Pill>
      </div>

      <div className="mt-4 space-y-3 text-sm leading-6">
        {asset?.statusLabel && <p className="font-medium text-slate-200">{asset.statusLabel}</p>}
        {node?.note && <p className="text-slate-300">{node.note}</p>}
        {asset?.observed && <Field name="Observed">{asset.observed}</Field>}
        {asset?.gap && <Field name="Gap">{asset.gap}</Field>}
        {asset?.nextMove && <Field name="Next move">{asset.nextMove}</Field>}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Connections ({conns.length})</p>
        {conns.length ? (
          <ul className="space-y-2">
            {conns.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.otherId)}
                  className="w-full rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-left transition-colors hover:border-cyan-400/30"
                >
                  <span className="flex items-center gap-2">
                    <EdgeSwatch verification={c.verification} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                      {c.direction === "outgoing" ? "→" : "←"} {c.otherLabel}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    {label("verification", c.verification)}
                    {c.label ? ` · ${c.label}` : ""}
                  </span>
                  {c.note && <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{c.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No connections recorded. Absence here is not proof of isolation.</p>
        )}
      </div>

      {asset && (
        <div className="mt-4">
          <TextButton onClick={() => openInventory({}, asset.id)}>
            Open in inventory <ArrowRight size={12} />
          </TextButton>
        </div>
      )}
    </div>
  );
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{name}</p>
      <p className="text-slate-300">{children}</p>
    </div>
  );
}
