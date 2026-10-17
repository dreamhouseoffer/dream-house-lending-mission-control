"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Maximize2,
  RefreshCw,
  TrendingUp,
  Activity,
  Home,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoinData {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
}

interface LiveMarketData {
  lastUpdated: string;
  cached: boolean;
  marketMode: "Risk-On" | "Risk-Off" | "Neutral";
  coins: CoinData[];
  btcDominance: number | null;
  fearGreed: { value: number; label: string } | null;
  stocks: {
    spy: { price: number | null; changePct: number | null };
    qqq: { price: number | null; changePct: number | null };
  };
  macro: {
    treasury10y: { yield: number | null; changePct: number | null };
    dxy: { value: number | null; changePct: number | null };
  };
}

interface AgentEntry {
  id: string;
  name: string;
  lastRunAt: string | null;
  lastStatus: string;
  lastError: string | null;
}

interface AgentStatusData {
  lastUpdated: string;
  agents: AgentEntry[];
}

interface CostData {
  lastUpdated: string;
  todayCost: number;
  monthToDateCost: number;
  monthlyBudget: number;
}

interface Loan {
  primaryBorrower: string;
  loanAmount: number;
  stageName: string;
  interestRate: string;
  subjectCity: string;
  lockExpiration: string;
  estimatedClosingDate: string;
  loanOfficer: string;
  processor: string;
  lender: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DISPLAY_STAGES = [
  "Loan Setup",
  "Disclosed",
  "Approved w/ Conditions",
  "Clear to Close",
  "Funded",
];

const STAGE_COLORS: Record<string, string> = {
  "Loan Setup": "bg-blue-500",
  Disclosed: "bg-purple-500",
  "Approved w/ Conditions": "bg-yellow-500",
  "Clear to Close": "bg-emerald-500",
  "Docs Out": "bg-orange-500",
  Funded: "bg-green-400",
};

const STAGE_TEXT_COLORS: Record<string, string> = {
  "Loan Setup": "text-blue-400/60",
  Disclosed: "text-purple-400/60",
  "Approved w/ Conditions": "text-yellow-400/60",
  "Clear to Close": "text-emerald-400/60",
  Funded: "text-green-400/60",
};

const MONTHLY_REVENUE_GOAL = 5_000_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toLocaleString();
}

function pctStr(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

function pctColor(pct: number | null | undefined): string {
  if (pct == null) return "text-white/40";
  return pct >= 0 ? "text-emerald-400" : "text-red-400";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function parseDate(s: string): Date | null {
  if (!s || s.trim() === "") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(d: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Pipeline Stats ───────────────────────────────────────────────────────────

function computePipeline(loans: Loan[]) {
  const active = loans.filter((l) => l.stageName !== "Funded");
  const funded = loans.filter((l) => l.stageName === "Funded");

  const locksExpiring = loans.filter((l) => {
    const d = parseDate(l.lockExpiration);
    if (!d) return false;
    const days = daysUntil(d);
    return days >= 0 && days <= 7;
  });

  const closingThisWeek = active.filter((l) => {
    const d = parseDate(l.estimatedClosingDate);
    if (!d) return false;
    const days = daysUntil(d);
    return days >= 0 && days <= 7;
  });

  const stageCounts: Record<string, number> = {};
  for (const loan of loans) {
    stageCounts[loan.stageName] = (stageCounts[loan.stageName] || 0) + 1;
  }

  return {
    totalLoans: loans.length,
    activeCount: active.length,
    activeVolume: active.reduce((s, l) => s + l.loanAmount, 0),
    totalVolume: loans.reduce((s, l) => s + l.loanAmount, 0),
    fundedCount: funded.length,
    fundedVolume: funded.reduce((s, l) => s + l.loanAmount, 0),
    locksExpiringCount: locksExpiring.length,
    closingThisWeekCount: closingThisWeek.length,
    closingVolume: closingThisWeek.reduce((s, l) => s + l.loanAmount, 0),
    stageCounts,
  };
}

// ─── Agent Config ─────────────────────────────────────────────────────────────

const AGENTS = [
  { key: "jarvis", label: "Jarvis", emoji: "🦞", dotColor: "bg-blue-500", pingColor: "bg-blue-400", matchNames: [] as string[] },
  { key: "vega", label: "Vega", emoji: "⚡", dotColor: "bg-yellow-500", pingColor: "bg-yellow-400", matchNames: ["Vega"] },
  { key: "millan", label: "Millan", emoji: "🧠", dotColor: "bg-orange-500", pingColor: "bg-orange-400", matchNames: ["Millan"] },
  { key: "milo", label: "Milo", emoji: "📋", dotColor: "bg-emerald-500", pingColor: "bg-emerald-400", matchNames: ["Milo"] },
  { key: "mike", label: "Mike", emoji: "✍️", dotColor: "bg-pink-500", pingColor: "bg-pink-400", matchNames: ["Mike"] },
  { key: "jayjay", label: "Jay Jay", emoji: "📧", dotColor: "bg-cyan-500", pingColor: "bg-cyan-400", matchNames: ["Jay Jay", "Monday"] },
  { key: "nova", label: "Nova", emoji: "✨", dotColor: "bg-purple-500", pingColor: "bg-purple-400", matchNames: ["Nova"] },
];

function getAgentStatus(
  agent: (typeof AGENTS)[0],
  statusData: AgentStatusData | null
): { status: "active" | "ok" | "error" | "standby"; lastRun: string | null } {
  if (agent.key === "jarvis") return { status: "active", lastRun: null };
  if (!statusData?.agents) return { status: "standby", lastRun: null };

  const match = statusData.agents.find((a) =>
    agent.matchNames.some((name) => a.name.includes(name))
  );
  if (!match) return { status: "standby", lastRun: null };

  const st =
    match.lastStatus === "ok" || match.lastStatus === "success"
      ? "ok"
      : match.lastStatus === "error"
        ? "error"
        : "standby";

  return { status: st, lastRun: match.lastRunAt };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [market, setMarket] = useState<LiveMarketData | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatusData | null>(null);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [time, setTime] = useState("");

  // Load pipeline from localStorage (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("pipelineData");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) setLoans(parsed);
      }
    } catch {}
  }, []);

  // Live clock
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [m, a, c] = await Promise.all([
        fetch("/api/live-market").then((r) => r.json()).catch(() => null),
        fetch("/api/agent-status").then((r) => r.json()).catch(() => null),
        fetch("/api/usage").then((r) => r.json()).catch(() => null),
      ]);
      if (m) setMarket(m);
      if (a) setAgentStatus(a);
      if (c) setCosts(c);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 60_000);
    return () => clearInterval(iv);
  }, [refresh]);

  function enterTVMode() {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  }

  // Derived market data
  const btc = market?.coins.find((c) => c.id === "bitcoin");
  const spy = market?.stocks.spy;
  const t10y = market?.macro?.treasury10y;
  const fng = market?.fearGreed;
  const est30y = t10y?.yield != null ? t10y.yield * 1.15 : null;

  // Pipeline
  const pipeline = loans ? computePipeline(loans) : null;

  // Budget
  const budgetPct = costs
    ? Math.min((costs.monthToDateCost / costs.monthlyBudget) * 100, 100)
    : 0;

  // Revenue progress
  const revenuePct = pipeline
    ? Math.min((pipeline.fundedVolume / MONTHLY_REVENUE_GOAL) * 100, 100)
    : 0;

  // Fear & Greed color
  const fngColor = fng
    ? fng.value >= 60
      ? "text-emerald-400"
      : fng.value >= 40
        ? "text-yellow-400"
        : fng.value >= 25
          ? "text-orange-400"
          : "text-red-400"
    : "text-white/40";

  return (
    <div className="min-h-screen bg-[#080808] text-white/90">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.05] bg-black/20">
        <div className="flex items-center gap-3">
          <Home className="size-4 text-white/20" />
          <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">
            Mission Control
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/30 hidden sm:block">{time}</span>
          <span className="text-[10px] text-white/20 hidden sm:block">
            {lastRefresh ? `Updated ${relativeTime(lastRefresh.toISOString())}` : "Loading..."}
          </span>
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Refresh"
            className="flex items-center justify-center size-7 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={enterTVMode}
            className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-white/[0.07] text-white/35 hover:text-white/65 hover:border-white/15 transition-colors"
          >
            <Maximize2 className="size-3" />
            TV Mode
          </button>
        </div>
      </div>

      {/* ── Slim Ticker Strip ── */}
      <div className="border-b border-white/[0.05] bg-black/30 px-6 py-2 flex items-center gap-5 overflow-x-auto scrollbar-hide">
        {est30y != null && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">30Y EST</span>
            <span className="text-xs font-mono font-bold text-white/70">{est30y.toFixed(2)}%</span>
          </div>
        )}
        {t10y?.yield != null && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">10Y</span>
            <span className="text-xs font-mono font-bold text-white/70">{t10y.yield.toFixed(2)}%</span>
            {t10y.changePct != null && (
              <span className={`text-[10px] font-mono ${pctColor(t10y.changePct)}`}>
                {pctStr(t10y.changePct)}
              </span>
            )}
          </div>
        )}
        <div className="h-3 w-px bg-white/[0.06] shrink-0" />
        {btc && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">BTC</span>
            <span className="text-xs font-mono font-bold text-white/70">
              ${btc.current_price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            <span className={`text-[10px] font-mono ${pctColor(btc.price_change_percentage_24h)}`}>
              {pctStr(btc.price_change_percentage_24h)}
            </span>
          </div>
        )}
        {spy?.price != null && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">SPY</span>
            <span className="text-xs font-mono font-bold text-white/70">${spy.price.toFixed(2)}</span>
            {spy.changePct != null && (
              <span className={`text-[10px] font-mono ${pctColor(spy.changePct)}`}>
                {pctStr(spy.changePct)}
              </span>
            )}
          </div>
        )}
        {market && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10px] text-white/25 font-mono tracking-widest uppercase">Live</span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">

        {/* ══ HERO: Pipeline Overview ══ */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="text-base">🏠</span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-blue-400/80">
                Loan Pipeline
              </h2>
            </div>
            <Link
              href="/pipeline"
              className="text-[10px] text-blue-400/50 hover:text-blue-400/80 border border-blue-500/20 hover:border-blue-500/40 rounded px-2.5 py-1 transition-colors"
            >
              Manage →
            </Link>
          </div>

          {pipeline ? (
            <>
              {/* Big Numbers */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5">Active Loans</p>
                  <p className="text-5xl font-black text-white/90 leading-none">{pipeline.activeCount}</p>
                  <p className="text-xs text-white/30 mt-1.5">{fmt$(pipeline.activeVolume)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5">Pipeline Volume</p>
                  <p className="text-5xl font-black text-blue-400 leading-none">{fmt$(pipeline.totalVolume)}</p>
                  <p className="text-xs text-white/30 mt-1.5">{pipeline.totalLoans} total loans</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5">Closing This Week</p>
                  <p className={`text-5xl font-black leading-none ${pipeline.closingThisWeekCount > 0 ? "text-emerald-400" : "text-white/25"}`}>
                    {pipeline.closingThisWeekCount}
                  </p>
                  <p className="text-xs text-white/30 mt-1.5">
                    {pipeline.closingThisWeekCount > 0 ? fmt$(pipeline.closingVolume) : "none"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5">Locks Expiring</p>
                  <p className={`text-5xl font-black leading-none ${pipeline.locksExpiringCount > 0 ? "text-red-400" : "text-white/25"}`}>
                    {pipeline.locksExpiringCount}
                  </p>
                  <p className={`text-xs mt-1.5 ${pipeline.locksExpiringCount > 0 ? "text-red-400/60" : "text-white/30"}`}>
                    {pipeline.locksExpiringCount > 0 ? "⚠ within 7 days" : "none expiring"}
                  </p>
                </div>
              </div>

              {/* Stage Bar */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">By Stage</p>
                <div className="flex gap-0.5 h-7 rounded-lg overflow-hidden bg-white/[0.03]">
                  {DISPLAY_STAGES.map((stage) => {
                    const count = pipeline.stageCounts[stage] || 0;
                    if (count === 0) return null;
                    const pct = (count / pipeline.totalLoans) * 100;
                    const color = STAGE_COLORS[stage] || "bg-white/20";
                    return (
                      <div
                        key={stage}
                        className={`${color} flex items-center justify-center`}
                        style={{ width: `${pct}%`, minWidth: "2rem" }}
                      >
                        <span className="text-xs font-bold text-white/90 px-1">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 flex-wrap">
                  {DISPLAY_STAGES.map((stage) => {
                    const count = pipeline.stageCounts[stage] || 0;
                    const short =
                      stage === "Approved w/ Conditions" ? "Approved" :
                      stage === "Clear to Close" ? "CTC" : stage;
                    const tc = STAGE_TEXT_COLORS[stage] || "text-white/35";
                    return (
                      <div key={stage} className="flex items-center gap-1">
                        <span className={`text-[10px] ${tc}`}>{short}</span>
                        <span className="text-[10px] text-white/30">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="text-4xl mb-3">📂</p>
              <p className="text-sm text-white/35">No pipeline data — upload your Arive CSV</p>
              <Link
                href="/pipeline"
                className="inline-block mt-4 text-xs text-blue-400/60 hover:text-blue-400 border border-blue-500/20 hover:border-blue-500/40 rounded px-4 py-2 transition-colors"
              >
                Upload CSV →
              </Link>
            </div>
          )}
        </div>

        {/* ══ Middle: Agent Activity + Revenue Tracker ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Agent Activity */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
                Agent Activity
              </span>
              <Activity className="size-3.5 text-white/15" />
            </div>
            <div className="space-y-3">
              {AGENTS.map((agent) => {
                const { status, lastRun } = getAgentStatus(agent, agentStatus);
                return (
                  <div key={agent.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex size-2 shrink-0">
                        {(status === "ok" || status === "active") && (
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${agent.pingColor} opacity-35`}
                          />
                        )}
                        <span
                          className={`relative inline-flex size-2 rounded-full ${
                            status === "ok" || status === "active"
                              ? agent.dotColor
                              : status === "error"
                                ? "bg-red-500"
                                : "bg-white/15"
                          }`}
                        />
                      </span>
                      <span className="text-xs font-medium text-white/70">{agent.label}</span>
                      <span className="text-xs leading-none">{agent.emoji}</span>
                    </div>
                    <div className="text-right">
                      {status === "error" ? (
                        <span className="text-[10px] text-red-400">Error</span>
                      ) : status === "ok" ? (
                        <span className="text-[10px] text-white/30">
                          {lastRun ? relativeTime(lastRun) : "Active"}
                        </span>
                      ) : status === "active" ? (
                        <span className="text-[10px] text-emerald-400">Active</span>
                      ) : (
                        <span className="text-[10px] text-white/20">Standby</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {agentStatus?.lastUpdated && (
              <p className="mt-4 pt-3 border-t border-white/[0.04] text-[9px] text-white/20">
                Status updated {relativeTime(agentStatus.lastUpdated)}
              </p>
            )}
          </div>

          {/* Revenue Tracker */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
                Revenue Tracker
              </span>
              <TrendingUp className="size-3.5 text-white/15" />
            </div>
            {pipeline ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                      Funded Volume
                    </p>
                    <p className="text-3xl font-black text-emerald-400 leading-none">
                      {fmt$(pipeline.fundedVolume)}
                    </p>
                    <p className="text-xs text-white/25 mt-1">{pipeline.fundedCount} loans closed</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                      Monthly Goal
                    </p>
                    <p className="text-3xl font-black text-white/40 leading-none">
                      {fmt$(MONTHLY_REVENUE_GOAL)}
                    </p>
                    <p className="text-xs text-white/25 mt-1">target volume</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[10px] text-white/25">
                      {fmt$(pipeline.fundedVolume)} / {fmt$(MONTHLY_REVENUE_GOAL)}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        revenuePct >= 80
                          ? "text-emerald-400"
                          : revenuePct >= 50
                            ? "text-yellow-400"
                            : "text-white/35"
                      }`}
                    >
                      {revenuePct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        revenuePct >= 80
                          ? "bg-emerald-500"
                          : revenuePct >= 50
                            ? "bg-yellow-500"
                            : "bg-blue-500"
                      }`}
                      style={{ width: `${revenuePct}%` }}
                    />
                  </div>
                </div>
                {pipeline.closingThisWeekCount > 0 && (
                  <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] p-3">
                    <p className="text-[10px] text-emerald-400/60 mb-0.5">Expected This Week</p>
                    <p className="text-xl font-black text-emerald-400 leading-none">
                      {fmt$(pipeline.closingVolume)}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {pipeline.closingThisWeekCount} loans closing
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-white/25">Load pipeline data to see revenue metrics</p>
                <Link
                  href="/pipeline"
                  className="inline-block mt-3 text-xs text-white/25 hover:text-white/50 transition-colors"
                >
                  Upload CSV →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ══ Bottom: Small Widgets ══ */}
        <div className="grid grid-cols-3 gap-4">

          {/* AI Ops Cost */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <p className="text-[9px] uppercase tracking-widest text-white/25 mb-3">AI Operations</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-[9px] text-white/25 mb-0.5">MTD</p>
                <p className="text-xl font-black text-purple-400 leading-none">
                  ${costs?.monthToDateCost?.toFixed(0) ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-white/25 mb-0.5">Today</p>
                <p className="text-xl font-black text-emerald-400 leading-none">
                  ${costs?.todayCost?.toFixed(0) ?? "—"}
                </p>
              </div>
            </div>
            <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetPct >= 95 ? "bg-red-500" : budgetPct >= 80 ? "bg-orange-500" : "bg-emerald-500"
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className="text-[9px] text-white/20 mt-1.5">
              {budgetPct.toFixed(0)}% of ${costs?.monthlyBudget ?? "—"} budget
            </p>
          </div>

          {/* Crypto Mini */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <p className="text-[9px] uppercase tracking-widest text-white/25 mb-3">Crypto</p>
            <div>
              <p className="text-[9px] text-white/25 mb-0.5">BTC</p>
              <p className="text-2xl font-black text-orange-400 leading-none">
                {btc
                  ? `$${btc.current_price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                  : "—"}
              </p>
              {btc && (
                <p className={`text-[10px] font-mono mt-1 ${pctColor(btc.price_change_percentage_24h)}`}>
                  {pctStr(btc.price_change_percentage_24h)}
                </p>
              )}
            </div>
            <Link
              href="/portfolio"
              className="mt-3 block text-[9px] text-white/20 hover:text-white/40 transition-colors"
            >
              Portfolio →
            </Link>
          </div>

          {/* Fear & Greed */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <p className="text-[9px] uppercase tracking-widest text-white/25 mb-3">Fear & Greed</p>
            {fng ? (
              <div>
                <p className={`text-4xl font-black font-mono leading-none ${fngColor}`}>
                  {fng.value}
                </p>
                <p className={`text-xs font-bold mt-1 ${fngColor}`}>{fng.label}</p>
                <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full ${
                      fng.value >= 60 ? "bg-emerald-500" :
                      fng.value >= 40 ? "bg-yellow-500" :
                      fng.value >= 25 ? "bg-orange-500" : "bg-red-500"
                    }`}
                    style={{ width: `${fng.value}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/25">—</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pb-2">
          <span className="text-[9px] text-white/15">
            Auto-refreshes every 60s · CoinGecko · Yahoo Finance · alt.me
          </span>
        </div>
      </div>
    </div>
  );
}
