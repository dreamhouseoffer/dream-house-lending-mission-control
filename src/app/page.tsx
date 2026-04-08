"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Maximize2,
  RefreshCw,
  TrendingUp,
  Zap,
  Calendar,
  Mail,
  Users,
  Archive,
  FolderKanban,
  CheckSquare,
  Activity,
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

interface TickerItem {
  sym: string;
  price: string;
  change: number | null;
  label?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pctStr(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

function pctColor(pct: number | null | undefined): string {
  if (pct == null) return "text-white/40";
  return pct >= 0 ? "text-emerald-400" : "text-red-400";
}

function formatPrice(n: number): string {
  if (n >= 1000)
    return (
      "$" +
      n.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    );
  return "$" + n.toFixed(2);
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

// ─── Agent config ─────────────────────────────────────────────────────────────

const AGENTS = [
  {
    key: "jarvis",
    label: "Jarvis",
    emoji: "🦞",
    dotColor: "bg-blue-500",
    pingColor: "bg-blue-400",
    matchNames: [] as string[],
  },
  {
    key: "vega",
    label: "Vega",
    emoji: "⚡",
    dotColor: "bg-yellow-500",
    pingColor: "bg-yellow-400",
    matchNames: ["Vega"],
  },
  {
    key: "millan",
    label: "Millan",
    emoji: "🧠",
    dotColor: "bg-orange-500",
    pingColor: "bg-orange-400",
    matchNames: ["Millan"],
  },
  {
    key: "milo",
    label: "Milo",
    emoji: "📋",
    dotColor: "bg-emerald-500",
    pingColor: "bg-emerald-400",
    matchNames: ["Milo"],
  },
  {
    key: "mike",
    label: "Mike",
    emoji: "✍️",
    dotColor: "bg-pink-500",
    pingColor: "bg-pink-400",
    matchNames: ["Mike"],
  },
  {
    key: "jayjay",
    label: "Jay Jay",
    emoji: "📧",
    dotColor: "bg-cyan-500",
    pingColor: "bg-cyan-400",
    matchNames: ["Jay Jay", "Monday"],
  },
  {
    key: "nova",
    label: "Nova",
    emoji: "✨",
    dotColor: "bg-purple-500",
    pingColor: "bg-purple-400",
    matchNames: ["Nova"],
  },
];

function getAgentStatus(
  agent: (typeof AGENTS)[0],
  statusData: AgentStatusData | null
): { status: "active" | "ok" | "error" | "standby"; lastRun: string | null } {
  if (agent.key === "jarvis")
    return { status: "active", lastRun: null };
  if (!statusData?.agents)
    return { status: "standby", lastRun: null };

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

// ─── Quick Links ──────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { href: "/vega", label: "Vega", icon: Zap, color: "text-yellow-400" },
  { href: "/calendar", label: "Calendar", icon: Calendar, color: "text-blue-400" },
  { href: "/projects", label: "Projects", icon: FolderKanban, color: "text-purple-400" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, color: "text-cyan-400" },
  { href: "/campaigns", label: "Campaigns", icon: Mail, color: "text-emerald-400" },
  { href: "/team", label: "Team", icon: Users, color: "text-orange-400" },
  { href: "/briefs", label: "Briefs", icon: Archive, color: "text-white/60" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [market, setMarket] = useState<LiveMarketData | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatusData | null>(null);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [time, setTime] = useState("");

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
        fetch("/api/live-market")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/agent-status")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/usage")
          .then((r) => r.json())
          .catch(() => null),
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
  const eth = market?.coins.find((c) => c.id === "ethereum");
  const sol = market?.coins.find((c) => c.id === "solana");
  const spy = market?.stocks.spy;
  const qqq = market?.stocks.qqq;
  const dxy = market?.macro.dxy;
  const fng = market?.fearGreed;
  const marketMode = market?.marketMode;

  const marketModeColor =
    marketMode === "Risk-On"
      ? "text-emerald-400"
      : marketMode === "Risk-Off"
        ? "text-red-400"
        : "text-yellow-400";

  const marketModeBorder =
    marketMode === "Risk-On"
      ? "border-emerald-500/25 bg-emerald-500/[0.04]"
      : marketMode === "Risk-Off"
        ? "border-red-500/25 bg-red-500/[0.04]"
        : "border-yellow-500/25 bg-yellow-500/[0.04]";

  const fngColor =
    fng
      ? fng.value >= 60
        ? "text-emerald-400"
        : fng.value >= 40
          ? "text-yellow-400"
          : fng.value >= 25
            ? "text-orange-400"
            : "text-red-400"
      : "text-white/40";

  const fngBarColor =
    fng
      ? fng.value >= 60
        ? "bg-emerald-500"
        : fng.value >= 40
          ? "bg-yellow-500"
          : fng.value >= 25
            ? "bg-orange-500"
            : "bg-red-500"
      : "bg-white/20";

  const budgetPct = costs
    ? Math.min((costs.monthToDateCost / costs.monthlyBudget) * 100, 100)
    : 0;

  const tickerItems: TickerItem[] = [
    {
      sym: "BTC",
      price: btc ? formatPrice(btc.current_price) : "—",
      change: btc?.price_change_percentage_24h ?? null,
    },
    {
      sym: "ETH",
      price: eth ? formatPrice(eth.current_price) : "—",
      change: eth?.price_change_percentage_24h ?? null,
    },
    {
      sym: "SOL",
      price: sol ? formatPrice(sol.current_price) : "—",
      change: sol?.price_change_percentage_24h ?? null,
    },
    {
      sym: "SPY",
      price: spy?.price != null ? formatPrice(spy.price) : "—",
      change: spy?.changePct ?? null,
    },
    {
      sym: "QQQ",
      price: qqq?.price != null ? formatPrice(qqq.price) : "—",
      change: qqq?.changePct ?? null,
    },
    {
      sym: "DXY",
      price: dxy?.value != null ? dxy.value.toFixed(2) : "—",
      change: dxy?.changePct ?? null,
    },
    ...(fng
      ? [{ sym: "F&G", price: String(fng.value), change: null, label: fng.label }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-white/90">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.05] bg-black/20">
        <div className="flex items-center gap-3">
          <TrendingUp className="size-4 text-white/20" />
          <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">
            Live Dashboard
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

      {/* ── Market Ticker Strip ── */}
      <div className="border-b border-white/[0.05] bg-black/30 px-6 py-3 flex items-center gap-6 overflow-x-auto scrollbar-hide">
        {tickerItems.map((t) => (
          <div key={t.sym} className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono text-white/40 uppercase tracking-wider">
              {t.sym}
            </span>
            <span className="text-sm font-mono font-bold text-white/90">
              {t.price}
            </span>
            {t.change !== null && t.change !== undefined ? (
              <span className={`text-xs font-mono ${pctColor(t.change)}`}>
                {pctStr(t.change)}
              </span>
            ) : t.label ? (
              <span className={`text-xs font-mono ${fngColor}`}>{t.label}</span>
            ) : null}
          </div>
        ))}

        {/* Live indicator */}
        {market && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10px] text-white/25 font-mono tracking-widest uppercase">
              Live
            </span>
          </div>
        )}
      </div>

      {/* ── Main Grid ── */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ─ Market Mode + Fear & Greed ─ */}
        <div className={`rounded-xl border p-6 space-y-5 ${marketModeBorder}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
              Market Mode
            </span>
            <TrendingUp className="size-3.5 text-white/15" />
          </div>

          <div>
            <p className={`text-5xl font-black tracking-tight leading-none ${marketModeColor}`}>
              {marketMode ?? "—"}
            </p>
            <p className="text-xs text-white/25 mt-2 uppercase tracking-wider">
              {marketMode === "Risk-On"
                ? "Bullish conditions — elevated appetite"
                : marketMode === "Risk-Off"
                  ? "Defensive conditions — risk is elevated"
                  : "Neutral — mixed signals"}
            </p>
          </div>

          {/* Fear & Greed */}
          <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
            <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-3">
              Fear & Greed Index
            </span>
            <div className="flex items-end gap-3 mb-3">
              <span className={`text-6xl font-black font-mono leading-none ${fngColor}`}>
                {fng?.value ?? "—"}
              </span>
              <div className="pb-1 space-y-0.5">
                <p className="text-[10px] text-white/25">/100</p>
                <p className={`text-sm font-bold ${fngColor}`}>
                  {fng?.label ?? "Loading..."}
                </p>
              </div>
            </div>
            {fng && (
              <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${fngBarColor}`}
                  style={{ width: `${fng.value}%` }}
                />
              </div>
            )}
          </div>

          {/* BTC Dominance */}
          {market?.btcDominance != null && (
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
              <span className="text-xs text-white/35">BTC Dominance</span>
              <span className="text-sm font-mono font-bold text-white/75">
                {market.btcDominance.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* ─ Agent Status ─ */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
              Agent Status
            </span>
            <Activity className="size-3.5 text-white/15" />
          </div>

          <div className="space-y-3.5">
            {AGENTS.map((agent) => {
              const { status, lastRun } = getAgentStatus(agent, agentStatus);
              return (
                <div key={agent.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Status dot */}
                    <span className="relative flex size-2.5 shrink-0">
                      {(status === "ok" || status === "active") && (
                        <span
                          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${agent.pingColor} opacity-35`}
                        />
                      )}
                      <span
                        className={`relative inline-flex size-2.5 rounded-full ${
                          status === "ok" || status === "active"
                            ? agent.dotColor
                            : status === "error"
                              ? "bg-red-500"
                              : "bg-white/15"
                        }`}
                      />
                    </span>
                    <span className="text-sm font-medium text-white/80">
                      {agent.label}
                    </span>
                    <span className="text-sm leading-none">{agent.emoji}</span>
                  </div>
                  <div className="text-right">
                    {status === "error" ? (
                      <span className="text-xs text-red-400 font-medium">Error</span>
                    ) : status === "ok" ? (
                      <span className="text-xs text-white/35">
                        {lastRun ? relativeTime(lastRun) : "Active"}
                      </span>
                    ) : status === "active" ? (
                      <span className="text-xs text-emerald-400 font-medium">Active</span>
                    ) : (
                      <span className="text-xs text-white/20">Standby</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {agentStatus?.lastUpdated && (
            <p className="mt-5 pt-4 border-t border-white/[0.04] text-[10px] text-white/20">
              Status file updated {relativeTime(agentStatus.lastUpdated)}
            </p>
          )}
        </div>

        {/* ─ AI Cost + Quick Links ─ */}
        <div className="space-y-4">
          {/* AI Ops Cost */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35 block mb-4">
              AI Operations
            </span>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                  Month-to-Date
                </p>
                <p className="text-3xl font-black text-purple-400 leading-none">
                  ${costs?.monthToDateCost?.toFixed(2) ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                  Today
                </p>
                <p className="text-3xl font-black text-emerald-400 leading-none">
                  ${costs?.todayCost?.toFixed(2) ?? "—"}
                </p>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-[10px] text-white/25">
                  ${costs?.monthToDateCost?.toFixed(0) ?? "0"} /{" "}
                  ${costs?.monthlyBudget ?? "—"} budget
                </span>
                <span
                  className={`text-[10px] font-mono font-bold ${
                    budgetPct >= 80 ? "text-orange-400" : "text-white/35"
                  }`}
                >
                  {budgetPct.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    budgetPct >= 95
                      ? "bg-red-500"
                      : budgetPct >= 80
                        ? "bg-orange-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35 block mb-3">
              Quick Access
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center gap-1.5 rounded-lg p-2.5 border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.10] transition-colors group"
                >
                  <link.icon
                    className={`size-4 ${link.color} group-hover:opacity-100 opacity-70 transition-opacity`}
                  />
                  <span className="text-[9px] text-white/40 group-hover:text-white/60 transition-colors text-center leading-none">
                    {link.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Auto-refresh notice ── */}
      <div className="px-5 pb-4 text-center">
        <span className="text-[10px] text-white/15">
          Auto-refreshes every 60 seconds · CoinGecko · Yahoo Finance · alt.me
        </span>
      </div>
    </div>
  );
}
