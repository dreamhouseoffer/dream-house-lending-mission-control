"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Map as MapIcon, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_FILTERS, EVIDENCE_LEVELS, FAMILIES, PLATFORMS, RECOMMENDATIONS, filterAssets, hasActiveFilters } from "@/lib/headquarters/model.mjs";
import { EVIDENCE_HINTS, formatObservedDate } from "@/lib/headquarters/view-model.mjs";
import type { HqAsset, HqFilters, HqLink, HqSnapshot } from "@/lib/headquarters/types";
import { EVIDENCE_TONE, EmptyState, Panel, Pill, RECOMMENDATION_TONE, TextButton, label } from "./primitives";

const SELECTS: { key: keyof HqFilters; group: string; title: string; values: string[] }[] = [
  { key: "family", group: "family", title: "Family", values: FAMILIES },
  { key: "platform", group: "platform", title: "Platform", values: PLATFORMS },
  { key: "evidenceLevel", group: "evidence", title: "Evidence", values: EVIDENCE_LEVELS },
  { key: "recommendation", group: "recommendation", title: "Recommendation", values: RECOMMENDATIONS },
];

function isSafeUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function Inventory({
  snapshot,
  filters,
  setFilters,
  focus,
  onFocusConsumed,
  openMap,
}: {
  snapshot: HqSnapshot;
  filters: HqFilters;
  setFilters: (f: HqFilters) => void;
  focus: { id: string; nonce: number } | null;
  onFocusConsumed: () => void;
  openMap: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(focus?.id ?? null);
  const results: HqAsset[] = useMemo(() => filterAssets(snapshot.assets, filters), [snapshot.assets, filters]);
  const active = hasActiveFilters(filters);

  useEffect(() => {
    if (!focus) return;
    setExpanded(focus.id);
    const el = [`hq-asset-${focus.id}`, `hq-asset-m-${focus.id}`]
      .map((id) => document.getElementById(id))
      .find((node) => node && node.offsetParent !== null);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    onFocusConsumed();
  }, [focus, onFocusConsumed]);

  const update = (patch: Partial<HqFilters>) => setFilters({ ...filters, ...patch });
  const reset = () => setFilters({ ...DEFAULT_FILTERS });
  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <Panel
      eyebrow={`${snapshot.snapshotLabel} · ${formatObservedDate(snapshot.observedAt, snapshot.timezone)}`}
      title="Platform asset inventory"
      action={
        <Pill tone="slate">
          {results.length} of {snapshot.assets.length} shown
        </Pill>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(4,1fr)_auto]">
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search assets</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Search name, status, gap…"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
          />
        </label>
        {SELECTS.map((s) => (
          <label key={s.key} className="block">
            <span className="sr-only">{s.title}</span>
            <select
              value={filters[s.key]}
              onChange={(e) => update({ [s.key]: e.target.value } as Partial<HqFilters>)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/40 focus:outline-none"
            >
              <option value="all">All {s.title.toLowerCase()}</option>
              {s.values.map((v) => (
                <option key={v} value={v}>
                  {label(s.group, v)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <TextButton onClick={reset} className={cn("justify-center", !active && "opacity-50")}>
          <RotateCcw size={12} /> Reset
        </TextButton>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">Assets overlap across platforms; counts are not unique products. Evidence levels describe what the audit observed, not what works.</p>

      <div className="mt-4">
        {!snapshot.available ? (
          <EmptyState title="Inventory unavailable" body={snapshot.message} />
        ) : results.length === 0 ? (
          <EmptyState title="No assets match these filters" action={<TextButton onClick={reset}>Reset filters</TextButton>} />
        ) : (
          <>
            {/* Desktop rows */}
            <div className="hidden overflow-hidden rounded-xl border border-white/[0.06] md:block">
              <div className="grid grid-cols-[2fr_0.8fr_1.1fr_1.2fr_1.1fr_auto] gap-3 border-b border-white/[0.06] bg-black/30 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <span>Asset</span>
                <span>Platform</span>
                <span>Family</span>
                <span>Evidence</span>
                <span>Recommendation</span>
                <span className="sr-only">Details</span>
              </div>
              {results.map((a) => (
                <div key={a.id} id={`hq-asset-${a.id}`} className={cn("border-b border-white/[0.04] last:border-0", expanded === a.id && "bg-cyan-400/[0.03]")}>
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    aria-expanded={expanded === a.id}
                    className="grid w-full grid-cols-[2fr_0.8fr_1.1fr_1.2fr_1.1fr_auto] items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{a.label}</span>
                      <span className="block truncate text-xs text-slate-500">{a.identifier}</span>
                    </span>
                    <span className="text-slate-300">{label("platform", a.platform)}</span>
                    <span className="truncate text-slate-300">{label("family", a.family)}</span>
                    <span>
                      <Pill tone={EVIDENCE_TONE[a.evidenceLevel]}>{label("evidence", a.evidenceLevel)}</Pill>
                    </span>
                    <span>
                      <Pill tone={RECOMMENDATION_TONE[a.recommendation]}>{label("recommendation", a.recommendation)}</Pill>
                    </span>
                    <ChevronDown size={14} className={cn("text-slate-500 transition-transform", expanded === a.id && "rotate-180")} />
                  </button>
                  {expanded === a.id && <AssetDetail asset={a} snapshot={snapshot} openMap={openMap} />}
                </div>
              ))}
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {results.map((a) => (
                <div key={a.id} id={`hq-asset-m-${a.id}`} className="rounded-xl border border-white/[0.06] bg-black/20">
                  <button type="button" onClick={() => toggle(a.id)} aria-expanded={expanded === a.id} className="w-full p-3 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{a.label}</p>
                        <p className="truncate text-xs text-slate-500">
                          {label("platform", a.platform)} · {label("family", a.family)}
                        </p>
                      </div>
                      <ChevronDown size={14} className={cn("mt-1 shrink-0 text-slate-500 transition-transform", expanded === a.id && "rotate-180")} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill tone={EVIDENCE_TONE[a.evidenceLevel]}>{label("evidence", a.evidenceLevel)}</Pill>
                      <Pill tone={RECOMMENDATION_TONE[a.recommendation]}>{label("recommendation", a.recommendation)}</Pill>
                    </div>
                  </button>
                  {expanded === a.id && <AssetDetail asset={a} snapshot={snapshot} openMap={openMap} />}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function AssetDetail({ asset, snapshot, openMap }: { asset: HqAsset; snapshot: HqSnapshot; openMap: (id: string | null) => void }) {
  const f = asset.facts;
  const facts: [string, string][] = (
    [
      ["Status", asset.statusLabel],
      ["Language", f.language],
      ["Framework", f.framework],
      ["Visibility", f.visibility],
      ["Archived", f.archived == null ? null : f.archived ? "Yes" : "No"],
      ["Last pushed", f.lastPushedAt],
      ["Source files", f.sourceTreeFileCount == null ? null : String(f.sourceTreeFileCount)],
      ["HTTP status", f.httpStatus == null ? null : String(f.httpStatus)],
      ["Deployment", f.deploymentState],
      ["Page title", f.pageTitle],
      ["Stack", f.stack.length ? f.stack.join(", ") : null],
      ["Git remote", f.hasGitRemote == null ? null : f.hasGitRemote ? "Yes" : "No"],
      ["Uncommitted changes", f.hasUncommittedChanges == null ? null : f.hasUncommittedChanges ? "Yes" : "No"],
    ] as [string, string | null][]
  ).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const links = asset.links.filter((l: HqLink) => isSafeUrl(l.url));
  const related = asset.relatedAssetIds
    .map((id) => snapshot.assets.find((a) => a.id === id))
    .filter((a): a is HqAsset => Boolean(a));

  return (
    <div className="space-y-4 border-t border-white/[0.05] px-3 pb-4 pt-3 text-sm">
      <p className="text-xs leading-5 text-slate-400">
        <span className="font-semibold text-slate-300">{label("evidence", asset.evidenceLevel)}:</span>{" "}
        {(EVIDENCE_HINTS as Record<string, string>)[asset.evidenceLevel]}
        {asset.secondaryEvidence.length > 0 && <> Also: {asset.secondaryEvidence.map((e) => label("evidence", e)).join(", ")}.</>}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Observed", asset.observed],
          ["Gap", asset.gap],
          ["Next move (proposed)", asset.nextMove],
        ].map(([title, body]) => (
          <div key={title}>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
            <p className="mt-1 leading-6 text-slate-300">{body || "Not recorded in this snapshot."}</p>
          </div>
        ))}
      </div>
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] text-slate-500">{k}</dt>
              <dd className="truncate text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {f.observedPaths.length > 0 && (
        <p className="text-xs text-slate-500">Observed paths: {f.observedPaths.join(", ")}</p>
      )}
      {related.length > 0 && (
        <p className="text-xs text-slate-400">Related: {related.map((r) => r.label).join(", ")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <TextButton onClick={() => openMap(asset.id)}>
          <MapIcon size={12} /> Show on systems map
        </TextButton>
        {links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-cyan-200 hover:border-cyan-400/30"
          >
            {l.label} <ExternalLink size={11} />
          </a>
        ))}
      </div>
    </div>
  );
}
