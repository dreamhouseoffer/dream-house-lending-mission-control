"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Archive, ChevronDown, ChevronUp } from "lucide-react";

interface Brief {
  date: string;
  marketMode?: string;
  fearGreed?: string;
  btcStructure?: string;
  ethPrice?: string;
  solPrice?: string;
  spyTrend?: string;
  qqqTrend?: string;
  treasury10y?: string;
  dxy?: string;
  btcDominance?: string;
  totalCryptoMarketCap?: string;
  topOpportunity?: string;
  topRisk?: string;
  lastUpdated?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function ModeChip({ mode }: { mode?: string }) {
  if (!mode) return null;
  const colors: Record<string, string> = {
    "Risk-On": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    "Risk-Off": "bg-red-500/15 text-red-400 border-red-500/20",
    "Neutral": "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  };
  const cls = colors[mode] || "bg-white/10 text-white/60 border-white/10";
  const Icon = mode === "Risk-On" ? TrendingUp : mode === "Risk-Off" ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {mode}
    </span>
  );
}

function BriefCard({ brief, defaultOpen = false }: { brief: Brief; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const dataPoints = [
    { label: "BTC", value: brief.btcStructure },
    { label: "ETH", value: brief.ethPrice },
    { label: "SOL", value: brief.solPrice },
    { label: "SPY", value: brief.spyTrend },
    { label: "QQQ", value: brief.qqqTrend },
    { label: "10Y", value: brief.treasury10y },
    { label: "DXY", value: brief.dxy },
    { label: "BTC Dom", value: brief.btcDominance },
    { label: "Mkt Cap", value: brief.totalCryptoMarketCap },
  ].filter((d) => d.value);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
      {/* Header — always visible, tap to expand */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 text-left hover:bg-white/[0.02] transition-colors min-h-[44px]"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
          <span className="text-sm font-medium text-white/90">{formatDate(brief.date)}</span>
          <ModeChip mode={brief.marketMode} />
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {brief.fearGreed && (
            <span className="hidden sm:block text-xs text-white/30">{brief.fearGreed}</span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-white/30" />
          ) : (
            <ChevronDown className="h-4 w-4 text-white/30" />
          )}
        </div>
      </button>

      {/* Fear & Greed — mobile only teaser */}
      {!open && brief.fearGreed && (
        <div className="sm:hidden px-4 pb-3 -mt-1">
          <span className="text-xs text-white/30">{brief.fearGreed}</span>
        </div>
      )}

      {/* Expanded content */}
      {open && (
        <div className="px-4 sm:px-5 pb-5 border-t border-white/[0.06] pt-4 space-y-4">
          {/* Key data points */}
          {dataPoints.length > 0 && (
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wider mb-3">Market Snapshot</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {dataPoints.map((d) => (
                  <div key={d.label} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">{d.label}</p>
                    <p className="text-xs text-white/80 font-mono leading-tight">{d.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunity & Risk */}
          <div className="grid sm:grid-cols-2 gap-3">
            {brief.topOpportunity && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                <p className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-1">Top Opportunity</p>
                <p className="text-xs text-white/70">{brief.topOpportunity}</p>
              </div>
            )}
            {brief.topRisk && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3">
                <p className="text-[10px] text-red-400/60 uppercase tracking-wider mb-1">Top Risk</p>
                <p className="text-xs text-white/70">{brief.topRisk}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BriefsPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/briefs")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setBriefs(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Archive className="h-5 w-5 text-white/30" />
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Archive</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Morning Briefs</h1>
          <p className="text-sm text-white/40 mt-1">
            Daily market snapshots from Vega — newest first
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-3">
        {loading ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center">
            <p className="text-sm text-white/30">Loading briefs...</p>
          </div>
        ) : briefs.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center">
            <Archive className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">No briefs yet. Run the update script to generate the first brief.</p>
          </div>
        ) : (
          briefs.map((brief, i) => (
            <BriefCard key={brief.date} brief={brief} defaultOpen={i === 0} />
          ))
        )}
      </div>
    </div>
  );
}
