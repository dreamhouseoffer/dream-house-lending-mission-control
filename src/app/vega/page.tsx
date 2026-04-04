"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CryptoMarket {
  id: string;
  name: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  image: string;
}

interface FearGreed {
  value: string;
  value_classification: string;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function pctStr(pct: number | null): string {
  if (pct === null || pct === undefined) return "—";
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

const convictionEmoji: Record<string, string> = {
  HIGH: "🔥",
  MEDIUM: "⚡",
  LOW: "💤",
};

const verdictColor: Record<string, string> = {
  BUY: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  HOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SELL: "bg-red-500/20 text-red-400 border-red-500/30",
  SHORT: "bg-red-500/20 text-red-400 border-red-500/30",
  AVOID: "bg-red-500/20 text-red-400 border-red-500/30",
  WATCH: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

// ─── Vega Brief Types ────────────────────────────────────────────────────────

interface VegaBrief {
  lastUpdated: string | null;
  marketMode: string;
  fearGreed?: string;
  btcDominance?: string;
  spyTrend: string;
  btcStructure: string;
  ethPrice?: string;
  solPrice?: string;
  topOpportunity: string;
  topRisk: string;
  error?: string;
}

const fallbackBrief: VegaBrief = {
  lastUpdated: null,
  marketMode: "—",
  spyTrend: "Loading...",
  btcStructure: "Loading...",
  topOpportunity: "Loading...",
  topRisk: "Loading...",
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function VegaPage() {
  // Crypto data
  const [cryptoData, setCryptoData] = useState<CryptoMarket[]>([]);
  const [fng, setFng] = useState<FearGreed | null>(null);
  const [btcDominance, setBtcDominance] = useState<number | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);

  // Stock watchlist
  const [stocks, setStocks] = useState<StockItem[]>([
    { ticker: "AAPL", price: "—", change: "—", live: false },
    { ticker: "NVDA", price: "—", change: "—", live: false },
    { ticker: "TSLA", price: "—", change: "—", live: false },
    { ticker: "META", price: "—", change: "—", live: false },
    { ticker: "MSFT", price: "—", change: "—", live: false },
  ]);
  const [newTicker, setNewTicker] = useState("");

  // Ask Vega
  const [question, setQuestion] = useState("");
  const [vegaResponse, setVegaResponse] = useState<VegaResponse | null>(null);
  const [vegaLoading, setVegaLoading] = useState(false);

  // Brief (cached — updated by update-dashboard.js, zero LLM tokens)
  const [brief, setBrief] = useState<VegaBrief>(fallbackBrief);
  const [briefRefreshing, setBriefRefreshing] = useState(false);

  // Ticker strip
  const [tickerPrices, setTickerPrices] = useState<Record<string, { price: number; change: number }>>({});

  // ─── Fetch Market Data ───────────────────────────────────────────────────

  const fetchMarketData = useCallback(async () => {
    try {
      const [marketRes, fngRes, globalRes] = await Promise.all([
        fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,cardano,chainlink&order=market_cap_desc&sparkline=false"
        ),
        fetch("https://api.alternative.me/fng/?limit=1"),
        fetch("https://api.coingecko.com/api/v3/global"),
      ]);

      if (marketRes.ok) {
        const data = await marketRes.json();
        setCryptoData(data);

        // Build ticker prices from crypto
        const tp: Record<string, { price: number; change: number }> = {};
        for (const c of data) {
          if (c.id === "bitcoin") tp["BTC"] = { price: c.current_price, change: c.price_change_percentage_24h };
          if (c.id === "ethereum") tp["ETH"] = { price: c.current_price, change: c.price_change_percentage_24h };
        }
        setTickerPrices(tp);
      }

      if (fngRes.ok) {
        const data = await fngRes.json();
        if (data.data?.[0]) setFng(data.data[0]);
      }

      if (globalRes.ok) {
        const data = await globalRes.json();
        if (data.data?.market_cap_percentage?.btc) {
          setBtcDominance(data.data.market_cap_percentage.btc);
        }
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

  const fetchBrief = useCallback(async () => {
    setBriefRefreshing(true);
    try {
      const res = await fetch("/api/vega-brief");
      const data: VegaBrief = await res.json();
      setBrief(data);
    } catch {
      // keep existing brief
    } finally {
      setBriefRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  // ─── Ask Vega Handler ────────────────────────────────────────────────────

  async function handleAskVega(q?: string) {
    const query = q || question;
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
    setStocks((prev) => [...prev, { ticker: t, price: "—", change: "—", live: false }]);
    setNewTicker("");
  }

  function handleRefreshBrief() {
    fetchBrief();
  }

  const examplePrompts = [
    "Analyze BTC right now",
    "Is NVDA a buy?",
    "What's the macro environment?",
    "Best crypto plays this week?",
  ];

  // ─── SPY/QQQ hardcoded ticker (no free API) ─────────────────────────────
  const tickerStrip = [
    { sym: "SPY", price: "~520", change: null as number | null },
    { sym: "QQQ", price: "~440", change: null as number | null },
    { sym: "BTC", price: tickerPrices["BTC"] ? formatPrice(tickerPrices["BTC"].price) : "...", change: tickerPrices["BTC"]?.change ?? null },
    { sym: "ETH", price: tickerPrices["ETH"] ? formatPrice(tickerPrices["ETH"].price) : "...", change: tickerPrices["ETH"]?.change ?? null },
    { sym: "DXY", price: "~104", change: null as number | null },
  ];

  // Fear & Greed color
  const fngColor = fng
    ? Number(fng.value) >= 60
      ? "text-emerald-400"
      : Number(fng.value) >= 40
        ? "text-yellow-400"
        : "text-red-400"
    : "text-white/40";

  return (
    <div className="min-h-screen bg-[#09090b] text-white/90">
      {/* ═══ Live Ticker Strip ═══ */}
      <div className="border-b border-white/[0.06] bg-black/40 px-6 py-2 flex items-center gap-6 overflow-x-auto">
        {tickerStrip.map((t) => (
          <div key={t.sym} className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-white/50">{t.sym}</span>
            <span className="text-xs font-mono text-white/80">{t.price}</span>
            {t.change !== null && (
              <span className={`text-xs font-mono ${pctColor(t.change)}`}>
                {pctStr(t.change)}
              </span>
            )}
            {t.change === null && (
              <span className="text-[10px] text-white/20">est.</span>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-white/30">Updates every 30s</span>
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
        </div>
      </div>

      {/* ═══ Header ═══ */}
      <header className="border-b border-white/[0.06] px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Vega <span className="text-yellow-400">⚡</span>
            </h1>
            <p className="text-sm text-white/40 mt-1">Financial Intelligence Agent</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-400">Active</span>
          </div>
        </div>
      </header>

      {/* ═══ Main Layout ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        {/* ═══ LEFT COLUMN — Market Dashboard ═══ */}
        <div className="space-y-5">
          {/* Market Pulse */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
              <span className="text-base">📊</span> Market Pulse
            </h2>

            {loadingMarket ? (
              <p className="text-xs text-white/30 py-4 text-center">Loading market data...</p>
            ) : (
              <div className="space-y-4">
                {/* Key prices */}
                <div className="grid grid-cols-3 gap-3">
                  {["SPY", "QQQ", "BTC"].map((sym) => {
                    const btc = cryptoData.find((c) => c.id === "bitcoin");
                    const isBTC = sym === "BTC";
                    return (
                      <div key={sym} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/40">{sym}</p>
                        <p className="text-lg font-semibold text-white/90 mt-1">
                          {isBTC && btc ? formatPrice(btc.current_price) : sym === "SPY" ? "~$520" : "~$440"}
                        </p>
                        {isBTC && btc ? (
                          <p className={`text-xs mt-0.5 ${pctColor(btc.price_change_percentage_24h)}`}>
                            {pctStr(btc.price_change_percentage_24h)}
                          </p>
                        ) : (
                          <p className="text-[10px] text-white/20 mt-0.5">Approximate</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Indicators row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/40">Fear & Greed</p>
                    <p className={`text-lg font-semibold mt-1 ${fngColor}`}>
                      {fng ? fng.value : "—"}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {fng ? fng.value_classification : "Loading..."}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/40">BTC Dominance</p>
                    <p className="text-lg font-semibold text-white/90 mt-1">
                      {btcDominance ? btcDominance.toFixed(1) + "%" : "—"}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">CoinGecko</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/40">DXY</p>
                    <p className="text-lg font-semibold text-white/90 mt-1">~104</p>
                    <p className="text-[10px] text-white/20 mt-0.5">Approximate</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Crypto Watchlist */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
              <span className="text-base">🪙</span> Crypto Watchlist
            </h2>

            {cryptoData.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-white/30 border-b border-white/[0.06]">
                      <th className="text-left py-2 font-medium">Asset</th>
                      <th className="text-right py-2 font-medium">Price</th>
                      <th className="text-right py-2 font-medium">24h</th>
                      <th className="text-right py-2 font-medium">Market Cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cryptoData.map((coin) => (
                      <tr key={coin.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-2.5 flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={coin.image} alt={coin.name} className="w-5 h-5 rounded-full" />
                          <span className="text-white/80 font-medium">{coin.name}</span>
                          <span className="text-white/30 uppercase">{coin.symbol}</span>
                        </td>
                        <td className="py-2.5 text-right text-white/80 font-mono">
                          {formatPrice(coin.current_price)}
                        </td>
                        <td className={`py-2.5 text-right font-mono ${pctColor(coin.price_change_percentage_24h)}`}>
                          {pctStr(coin.price_change_percentage_24h)}
                        </td>
                        <td className="py-2.5 text-right text-white/50 font-mono">
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
            <h2 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
              <span className="text-base">📈</span> Stock Watchlist
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/30 border-b border-white/[0.06]">
                    <th className="text-left py-2 font-medium">Ticker</th>
                    <th className="text-right py-2 font-medium">Price</th>
                    <th className="text-right py-2 font-medium">Change</th>
                    <th className="text-right py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => (
                    <tr key={s.ticker} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="py-2.5 text-white/80 font-mono font-medium">{s.ticker}</td>
                      <td className="py-2.5 text-right text-white/50 font-mono">{s.price}</td>
                      <td className="py-2.5 text-right text-white/30 font-mono">{s.change}</td>
                      <td className="py-2.5 text-right">
                        <span className="text-[10px] text-white/20">
                          {s.live ? "Live" : "Offline"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-white/20 mt-3 mb-3">
              Connect Yahoo Finance API for live stock data
            </p>

            <div className="flex gap-2">
              <Input
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                placeholder="Add ticker (e.g. GOOG)"
                className="bg-white/[0.04] border-white/[0.08] text-white/90 placeholder:text-white/25 text-xs h-8"
                onKeyDown={(e) => e.key === "Enter" && handleAddTicker()}
              />
              <Button
                size="sm"
                onClick={handleAddTicker}
                className="bg-white/10 hover:bg-white/15 text-white/90 border-white/[0.08] text-xs h-8"
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN — Vega Intelligence ═══ */}
        <div className="space-y-5">
          {/* Ask Vega */}
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.02] p-5">
            <h2 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
              <span className="text-base">⚡</span> Ask Vega
            </h2>

            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Vega anything about markets, stocks, crypto..."
              className="bg-white/[0.04] border-white/[0.08] text-white/90 placeholder:text-white/25 min-h-[80px] mb-3"
            />

            {/* Example prompts */}
            <div className="flex flex-wrap gap-2 mb-3">
              {examplePrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setQuestion(p);
                    handleAskVega(p);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>

            <Button
              onClick={() => handleAskVega()}
              disabled={vegaLoading || !question.trim()}
              className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30"
            >
              {vegaLoading ? "Vega is analyzing..." : "Ask Vega ⚡"}
            </Button>

            {/* Response */}
            {vegaResponse && !vegaResponse.error && (
              <div className="mt-5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
                {/* Top badges */}
                <div className="flex items-center gap-3">
                  <Badge className={`${verdictColor[vegaResponse.verdict] || verdictColor["WATCH"]} border text-sm px-3 py-1`}>
                    {vegaResponse.verdict}
                  </Badge>
                  <span className="text-sm text-white/50">
                    {convictionEmoji[vegaResponse.conviction] || "⚡"} {vegaResponse.conviction} Conviction
                  </span>
                </div>

                {/* Sections */}
                {[
                  { label: "Macro Check", content: vegaResponse.macroCheck },
                  { label: "Technical Read", content: vegaResponse.technicalRead },
                  { label: "Sentiment", content: vegaResponse.sentiment },
                  { label: "Risk Assessment", content: vegaResponse.riskAssessment },
                  { label: "Verdict", content: vegaResponse.verdictDetail },
                ].map((s) =>
                  s.content ? (
                    <div key={s.label}>
                      <h3 className="text-[11px] uppercase tracking-wider text-white/40 mb-1">{s.label}</h3>
                      <p className="text-sm text-white/70 leading-relaxed">{s.content}</p>
                    </div>
                  ) : null
                )}

                <p className="text-[10px] text-white/20 pt-2 border-t border-white/[0.06]">
                  This is not licensed financial advice. Powered by Vega AI.
                </p>
              </div>
            )}

            {vegaResponse?.error && (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-4">
                <p className="text-xs text-red-400">{vegaResponse.error}</p>
              </div>
            )}
          </div>

          {/* Vega's Daily Brief */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <span className="text-base">📋</span> Vega&apos;s Daily Brief
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshBrief}
                disabled={briefRefreshing}
                className="text-xs h-7 border-white/[0.08] text-white/50 hover:text-white/80"
              >
                {briefRefreshing ? "Refreshing..." : "Refresh Brief"}
              </Button>
            </div>

            <div className="space-y-3">
              {[
                { label: "Market Mode", value: brief.marketMode, color: brief.marketMode === "Risk-On" ? "text-emerald-400" : brief.marketMode === "Risk-Off" ? "text-red-400" : "text-yellow-400" },
                { label: "Fear & Greed", value: brief.fearGreed ?? "—", color: "text-white/70" },
                { label: "BTC Dom.", value: brief.btcDominance ?? "—", color: "text-white/70" },
                { label: "BTC", value: brief.btcStructure, color: "text-white/70" },
                { label: "ETH", value: brief.ethPrice ?? "—", color: "text-white/70" },
                { label: "SOL", value: brief.solPrice ?? "—", color: "text-white/70" },
                { label: "Opportunity", value: brief.topOpportunity, color: "text-yellow-400" },
                { label: "Top Risk", value: brief.topRisk, color: "text-red-400/80" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-white/30 w-28 shrink-0 pt-0.5">
                    {item.label}
                  </span>
                  <span className={`text-sm ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-white/25 mt-4">
              Updated by update-dashboard.js (free APIs, zero LLM tokens)
              {brief.lastUpdated ? ` — ${new Date(brief.lastUpdated).toLocaleString()}` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
