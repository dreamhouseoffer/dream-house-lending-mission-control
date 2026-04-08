"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoinData {
  id: string;
  name: string;
  symbol: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
}

interface LiveMarketData {
  lastUpdated: string;
  cached: boolean;
  marketMode: "Risk-On" | "Risk-Off" | "Neutral";
  coins: CoinData[];
  btcDominance: number | null;
  totalMarketCap: number | null;
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

interface VegaResponse {
  conviction: "HIGH" | "MEDIUM" | "LOW";
  verdict: string;
  macroCheck: string;
  technicalRead: string;
  sentiment: string;
  riskAssessment: string;
  verdictDetail: string;
  error?: string;
}

interface StockItem {
  ticker: string;
  price: string;
  change: string;
  live: boolean;
}

interface Brief {
  date: string;
  marketMode?: string;
  fearGreed?: string;
  btcDominance?: string;
  btcStructure?: string;
  ethPrice?: string;
  solPrice?: string;
  spyTrend?: string;
  dxy?: string;
  totalCryptoMarketCap?: string;
  topOpportunity?: string;
  topRisk?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  if (n >= 1000)
    return (
      "$" +
      n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  return "$" + n.toFixed(2);
}

function formatMcap(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  return "$" + n.toLocaleString();
}

function pctColor(pct: number): string {
  return pct >= 0 ? "text-emerald-400" : "text-red-400";
}

function pctStr(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "—";
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

const convictionEmoji: Record<string, string> = {
  HIGH: "🔥",
  MEDIUM: "⚡",
  LOW: "💤",
};

const verdictColor: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  HOLD: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  SELL: "bg-red-500/15 text-red-400 border-red-500/25",
  SHORT: "bg-red-500/15 text-red-400 border-red-500/25",
  AVOID: "bg-red-500/15 text-red-400 border-red-500/25",
  WATCH: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

function fngSignal(value: number): { action: string; color: string; reason: string } {
  if (value <= 20)
    return {
      action: "ACCUMULATE",
      color: "text-emerald-400",
      reason: "Extreme Fear — historically a buy zone. Scale in slowly.",
    };
  if (value <= 35)
    return {
      action: "BUY DIP",
      color: "text-emerald-400",
      reason: "Fear zone — consider adding to core positions.",
    };
  if (value <= 55)
    return {
      action: "HOLD",
      color: "text-yellow-400",
      reason: "Neutral — no strong directional bias. Wait for clarity.",
    };
  if (value <= 75)
    return {
      action: "CAUTIOUS",
      color: "text-orange-400",
      reason: "Greed zone — tighten stops, reduce leverage.",
    };
  return {
    action: "TAKE PROFIT",
    color: "text-red-400",
    reason: "Extreme Greed — historically a sell zone. Reduce exposure.",
  };
}

function btcDomSignal(dom: number | null): { label: string; color: string; note: string } {
  if (dom === null)
    return { label: "—", color: "text-white/40", note: "No data" };
  if (dom >= 60)
    return {
      label: "BTC Season",
      color: "text-orange-400",
      note: "BTC dom >60% — altcoins underperforming. Stick with BTC.",
    };
  if (dom >= 50)
    return {
      label: "Neutral",
      color: "text-yellow-400",
      note: "BTC dom 50-60% — mixed market. Be selective.",
    };
  return {
    label: "Alt Season Possible",
    color: "text-emerald-400",
    note: "BTC dom <50% — capital flowing into altcoins.",
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VegaPage() {
  const [liveMarket, setLiveMarket] = useState<LiveMarketData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [latestBrief, setLatestBrief] = useState<Brief | null>(null);

  const [stocks, setStocks] = useState<StockItem[]>([
    { ticker: "AAPL", price: "—", change: "—", live: false },
    { ticker: "NVDA", price: "—", change: "—", live: false },
    { ticker: "TSLA", price: "—", change: "—", live: false },
    { ticker: "META", price: "—", change: "—", live: false },
    { ticker: "MSFT", price: "—", change: "—", live: false },
  ]);
  const [newTicker, setNewTicker] = useState("");

  const [question, setQuestion] = useState("");
  const [vegaResponse, setVegaResponse] = useState<VegaResponse | null>(null);
  const [vegaLoading, setVegaLoading] = useState(false);

  // ─── Fetch live market data ────────────────────────────────────────────────

  const fetchMarketData = useCallback(async () => {
    try {
      const res = await fetch("/api/live-market");
      if (res.ok) {
        const data: LiveMarketData = await res.json();
        setLiveMarket(data);
        setLastFetched(new Date());
      }
    } catch {
      // silent
    } finally {
      setLoadingMarket(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
    const iv = setInterval(fetchMarketData, 30_000);
    return () => clearInterval(iv);
  }, [fetchMarketData]);

  // ─── Fetch latest brief ────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/briefs")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setLatestBrief(data[0]);
        }
      })
      .catch(() => {});
  }, []);

  // ─── Ask Vega ──────────────────────────────────────────────────────────────

  async function handleAskVega(q?: string) {
    const query = q ?? question;
    if (!query.trim()) return;
    setVegaLoading(true);
    setVegaResponse(null);
    try {
      const res = await fetch("/api/vega", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      if (data.error) {
        setVegaResponse({
          conviction: "LOW",
          verdict: "WATCH",
          macroCheck: data.error,
          technicalRead: "",
          sentiment: "",
          riskAssessment: "",
          verdictDetail: "",
          error: data.error,
        });
      } else {
        setVegaResponse(data);
      }
    } catch {
      setVegaResponse({
        conviction: "LOW",
        verdict: "WATCH",
        macroCheck: "Failed to reach Vega API.",
        technicalRead: "",
        sentiment: "",
        riskAssessment: "",
        verdictDetail: "",
        error: "Network error",
      });
    } finally {
      setVegaLoading(false);
    }
  }

  function handleAddTicker() {
    const t = newTicker.trim().toUpperCase();
    if (!t || stocks.some((s) => s.ticker === t)) return;
    setStocks((prev) => [
      ...prev,
      { ticker: t, price: "—", change: "—", live: false },
    ]);
    setNewTicker("");
  }

  const examplePrompts = [
    "Analyze BTC right now",
    "Is this a good time to buy?",
    "What's the macro environment?",
    "Best crypto plays this week?",
  ];

  // ─── Derived data ──────────────────────────────────────────────────────────

  const btc = liveMarket?.coins.find((c) => c.id === "bitcoin");
  const eth = liveMarket?.coins.find((c) => c.id === "ethereum");
  const sol = liveMarket?.coins.find((c) => c.id === "solana");
  const fng = liveMarket?.fearGreed;
  const spy = liveMarket?.stocks.spy;
  const qqq = liveMarket?.stocks.qqq;
  const dxy = liveMarket?.macro.dxy;
  const marketMode = liveMarket?.marketMode ?? "—";

  const fngSignalData = fng ? fngSignal(fng.value) : null;
  const btcDomData = btcDomSignal(liveMarket?.btcDominance ?? null);

  const fngColor = fng
    ? fng.value >= 60
      ? "text-emerald-400"
      : fng.value >= 40
        ? "text-yellow-400"
        : "text-red-400"
    : "text-white/40";

  const marketModeColor =
    marketMode === "Risk-On"
      ? "text-emerald-400"
      : marketMode === "Risk-Off"
        ? "text-red-400"
        : "text-yellow-400";

  const tickerStrip = [
    {
      sym: "BTC",
      price: btc ? formatPrice(btc.current_price) : "...",
      change: btc?.price_change_percentage_24h ?? null,
    },
    {
      sym: "ETH",
      price: eth ? formatPrice(eth.current_price) : "...",
      change: eth?.price_change_percentage_24h ?? null,
    },
    {
      sym: "SOL",
      price: sol ? formatPrice(sol.current_price) : "...",
      change: sol?.price_change_percentage_24h ?? null,
    },
    {
      sym: "SPY",
      price: spy?.price != null ? formatPrice(spy.price) : "...",
      change: spy?.changePct ?? null,
    },
    {
      sym: "QQQ",
      price: qqq?.price != null ? formatPrice(qqq.price) : "...",
      change: qqq?.changePct ?? null,
    },
    {
      sym: "DXY",
      price: dxy?.value != null ? dxy.value.toFixed(2) : "...",
      change: dxy?.changePct ?? null,
    },
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-white/90">
      {/* ══ Ticker Strip ══ */}
      <div className="border-b border-white/[0.05] bg-black/40 px-6 py-2.5 flex items-center gap-6 overflow-x-auto">
        {tickerStrip.map((t) => (
          <div key={t.sym} className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono text-white/40 tracking-wider">
              {t.sym}
            </span>
            <span className="text-sm font-mono font-bold text-white/90">
              {t.price}
            </span>
            {t.change !== null ? (
              <span className={`text-xs font-mono ${pctColor(t.change)}`}>
                {pctStr(t.change)}
              </span>
            ) : (
              <span className="text-[10px] text-white/20">...</span>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-white/25">
            {lastFetched
              ? `Live · ${lastFetched.toLocaleTimeString()}`
              : "Loading..."}
          </span>
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
        </div>
      </div>

      {/* ══ Page Header ══ */}
      <header className="border-b border-white/[0.05] px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
              Vega <span className="text-yellow-400">⚡</span>
            </h1>
            <p className="text-sm text-white/35 mt-0.5">
              Financial Intelligence Agent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-400 font-medium">Active</span>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* ══ Section 1: Portfolio Placeholder ══ */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/70 flex items-center gap-2">
              <span>💼</span> My Portfolio
            </h2>
            <Badge className="bg-yellow-500/10 text-yellow-400/70 border-yellow-500/20 text-[10px]">
              Coming Soon
            </Badge>
          </div>
          <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] p-6 text-center">
            <p className="text-sm text-white/30">
              Connect Kraken API to see your live portfolio
            </p>
            <p className="text-xs text-white/20 mt-1">
              Holdings, P&amp;L, allocation, and DCA tracking will appear here
            </p>
          </div>
        </div>

        {/* ══ Section 2: Market Signals ══ */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
            <span>📡</span> Market Signals
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Market Mode */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">
                Market Mode
              </p>
              <p className={`text-2xl font-black ${marketModeColor}`}>
                {marketMode}
              </p>
              <p className="text-xs text-white/35 mt-1">
                {marketMode === "Risk-On"
                  ? "Elevated risk appetite"
                  : marketMode === "Risk-Off"
                    ? "Defensive posture"
                    : "Mixed signals"}
              </p>
            </div>

            {/* Fear & Greed Signal */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">
                Fear & Greed → Action
              </p>
              <p className={`text-2xl font-black ${fngColor}`}>
                {fng?.value ?? "—"}
              </p>
              <p className="text-xs text-white/35 mt-0.5">{fng?.label ?? "Loading..."}</p>
              {fngSignalData && (
                <>
                  <p className={`text-sm font-bold mt-2 ${fngSignalData.color}`}>
                    → {fngSignalData.action}
                  </p>
                  <p className="text-[10px] text-white/30 mt-1 leading-snug">
                    {fngSignalData.reason}
                  </p>
                </>
              )}
            </div>

            {/* BTC Dominance Signal */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">
                BTC Dominance → Cycle
              </p>
              <p className="text-2xl font-black text-white/80">
                {liveMarket?.btcDominance
                  ? liveMarket.btcDominance.toFixed(1) + "%"
                  : "—"}
              </p>
              <p className={`text-sm font-bold mt-2 ${btcDomData.color}`}>
                → {btcDomData.label}
              </p>
              <p className="text-[10px] text-white/30 mt-1 leading-snug">
                {btcDomData.note}
              </p>
            </div>
          </div>

          {/* Market Pulse Table */}
          {!loadingMarket && liveMarket && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                {
                  label: "SPY",
                  price: spy?.price ?? null,
                  change: spy?.changePct ?? null,
                },
                {
                  label: "QQQ",
                  price: qqq?.price ?? null,
                  change: qqq?.changePct ?? null,
                },
                {
                  label: "BTC",
                  price: btc?.current_price ?? null,
                  change: btc?.price_change_percentage_24h ?? null,
                },
                {
                  label: "ETH",
                  price: eth?.current_price ?? null,
                  change: eth?.price_change_percentage_24h ?? null,
                },
                {
                  label: "SOL",
                  price: sol?.current_price ?? null,
                  change: sol?.price_change_percentage_24h ?? null,
                },
                {
                  label: "DXY",
                  price: dxy?.value ?? null,
                  change: dxy?.changePct ?? null,
                  isDxy: true,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-white/[0.05] bg-white/[0.02] p-3"
                >
                  <p className="text-[10px] uppercase tracking-wider text-white/35">
                    {item.label}
                  </p>
                  <p className="text-base font-bold text-white/85 mt-1">
                    {item.price != null
                      ? "isDxy" in item && item.isDxy
                        ? item.price.toFixed(2)
                        : formatPrice(item.price)
                      : "—"}
                  </p>
                  {item.change != null && (
                    <p className={`text-xs mt-0.5 ${pctColor(item.change)}`}>
                      {pctStr(item.change)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══ Two-column layout for Ask Vega + Watchlists ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ══ Section 3: Ask Vega ══ */}
          <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/[0.02] p-5">
            <h2 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
              <span>⚡</span> Ask Vega
            </h2>

            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Vega anything about markets, stocks, crypto..."
              className="bg-white/[0.03] border-white/[0.07] text-white/90 placeholder:text-white/20 min-h-[80px] mb-3"
            />

            <div className="flex flex-wrap gap-2 mb-3">
              {examplePrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setQuestion(p);
                    handleAskVega(p);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-white/[0.07] bg-white/[0.03] text-white/45 hover:text-white/75 hover:bg-white/[0.06] transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>

            <Button
              onClick={() => handleAskVega()}
              disabled={vegaLoading || !question.trim()}
              className="w-full bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/25"
            >
              {vegaLoading ? "Vega is analyzing..." : "Ask Vega ⚡"}
            </Button>

            {vegaResponse && !vegaResponse.error && (
              <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4 space-y-3.5">
                <div className="flex items-center gap-3">
                  <Badge
                    className={`${verdictColor[vegaResponse.verdict] ?? verdictColor["WATCH"]} border text-sm px-3 py-1`}
                  >
                    {vegaResponse.verdict}
                  </Badge>
                  <span className="text-sm text-white/45">
                    {convictionEmoji[vegaResponse.conviction] ?? "⚡"}{" "}
                    {vegaResponse.conviction} Conviction
                  </span>
                </div>

                {[
                  { label: "Macro Check", content: vegaResponse.macroCheck },
                  { label: "Technical Read", content: vegaResponse.technicalRead },
                  { label: "Sentiment", content: vegaResponse.sentiment },
                  { label: "Risk Assessment", content: vegaResponse.riskAssessment },
                  { label: "Verdict", content: vegaResponse.verdictDetail },
                ].map((s) =>
                  s.content ? (
                    <div key={s.label}>
                      <h3 className="text-[10px] uppercase tracking-wider text-white/35 mb-1">
                        {s.label}
                      </h3>
                      <p className="text-sm text-white/65 leading-relaxed">
                        {s.content}
                      </p>
                    </div>
                  ) : null
                )}

                <p className="text-[10px] text-white/20 pt-2 border-t border-white/[0.05]">
                  Not financial advice. Powered by Vega AI.
                </p>
              </div>
            )}

            {vegaResponse?.error && (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
                <p className="text-xs text-red-400">{vegaResponse.error}</p>
              </div>
            )}
          </div>

          {/* ══ Section 4: Crypto Watchlist ══ */}
          <div className="space-y-5">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                <span>🪙</span> Crypto Watchlist
              </h2>

              {!liveMarket || liveMarket.coins.length === 0 ? (
                <p className="text-xs text-white/30 py-4 text-center">Loading...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-white/30 border-b border-white/[0.05]">
                        <th className="text-left py-2 font-medium">Asset</th>
                        <th className="text-right py-2 font-medium">Price</th>
                        <th className="text-right py-2 font-medium">24h</th>
                        <th className="text-right py-2 font-medium">Mkt Cap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveMarket.coins.map((coin) => (
                        <tr
                          key={coin.id}
                          className="border-b border-white/[0.03] hover:bg-white/[0.02]"
                        >
                          <td className="py-2.5 flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coin.image}
                              alt={coin.name}
                              className="w-5 h-5 rounded-full"
                            />
                            <span className="text-white/75 font-medium">
                              {coin.name}
                            </span>
                            <span className="text-white/25 uppercase">
                              {coin.symbol}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-white/75 font-mono">
                            {formatPrice(coin.current_price)}
                          </td>
                          <td
                            className={`py-2.5 text-right font-mono ${pctColor(coin.price_change_percentage_24h)}`}
                          >
                            {pctStr(coin.price_change_percentage_24h)}
                          </td>
                          <td className="py-2.5 text-right text-white/40 font-mono">
                            {formatMcap(coin.market_cap)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Stock Watchlist */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                <span>📈</span> Stock Watchlist
              </h2>

              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-white/30 border-b border-white/[0.05]">
                      <th className="text-left py-2 font-medium">Ticker</th>
                      <th className="text-right py-2 font-medium">Price</th>
                      <th className="text-right py-2 font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.map((s) => (
                      <tr
                        key={s.ticker}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02]"
                      >
                        <td className="py-2.5 text-white/75 font-mono font-medium">
                          {s.ticker}
                        </td>
                        <td className="py-2.5 text-right text-white/40 font-mono">
                          {s.price}
                        </td>
                        <td className="py-2.5 text-right text-white/25 font-mono">
                          {s.change}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <Input
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                  placeholder="Add ticker (e.g. GOOG)"
                  className="bg-white/[0.03] border-white/[0.07] text-white/90 placeholder:text-white/20 text-xs h-8"
                  onKeyDown={(e) => e.key === "Enter" && handleAddTicker()}
                />
                <Button
                  size="sm"
                  onClick={handleAddTicker}
                  className="bg-white/[0.07] hover:bg-white/[0.12] text-white/80 border-white/[0.07] text-xs h-8"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ══ Section 5: Daily Brief ══ */}
        {latestBrief && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white/70 flex items-center gap-2">
                <span>📋</span> Daily Brief
              </h2>
              <span className="text-[10px] text-white/30 font-mono">{latestBrief.date}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Market Mode", value: latestBrief.marketMode },
                { label: "Fear & Greed", value: latestBrief.fearGreed },
                { label: "BTC Dom.", value: latestBrief.btcDominance },
                { label: "Total Mkt Cap", value: latestBrief.totalCryptoMarketCap },
              ].map(
                (item) =>
                  item.value && (
                    <div
                      key={item.label}
                      className="rounded-md border border-white/[0.05] bg-white/[0.02] p-3"
                    >
                      <p className="text-[9px] uppercase tracking-widest text-white/30 mb-1">
                        {item.label}
                      </p>
                      <p className="text-sm font-semibold text-white/80">
                        {item.value}
                      </p>
                    </div>
                  )
              )}
            </div>

            <div className="space-y-2">
              {[
                { label: "BTC", value: latestBrief.btcStructure },
                { label: "ETH", value: latestBrief.ethPrice },
                { label: "SOL", value: latestBrief.solPrice },
                { label: "SPY", value: latestBrief.spyTrend },
                { label: "DXY", value: latestBrief.dxy },
              ].map(
                (item) =>
                  item.value && (
                    <div key={item.label} className="flex items-start gap-3">
                      <span className="text-[10px] uppercase tracking-wider text-white/25 w-10 shrink-0 pt-0.5">
                        {item.label}
                      </span>
                      <span className="text-sm text-white/65">{item.value}</span>
                    </div>
                  )
              )}
            </div>

            {latestBrief.topOpportunity && (
              <div className="mt-4 rounded-md border border-yellow-500/15 bg-yellow-500/[0.04] p-3">
                <p className="text-[10px] uppercase tracking-wider text-yellow-400/60 mb-1">
                  Opportunity
                </p>
                <p className="text-xs text-white/65">{latestBrief.topOpportunity}</p>
              </div>
            )}

            {latestBrief.topRisk && (
              <div className="mt-2 rounded-md border border-red-500/15 bg-red-500/[0.04] p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-400/60 mb-1">
                  Top Risk
                </p>
                <p className="text-xs text-white/65">{latestBrief.topRisk}</p>
              </div>
            )}

            <p className="text-[10px] text-white/20 mt-4 flex items-center gap-1.5">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Live · CoinGecko · Yahoo Finance · alt.me ·{" "}
              {lastFetched ? `fetched ${lastFetched.toLocaleTimeString()}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
