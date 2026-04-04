"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Position {
  asset: string;
  symbol: string;
  amount: number;
  entryPrice: number;
  currentPrice: number | null;
  color: string;
}

interface VegaBrief {
  btcStructure?: string;
  ethPrice?: string;
  solPrice?: string;
  marketMode?: string;
  fearGreed?: string;
  lastUpdated?: string;
}

const INITIAL_POSITIONS: Position[] = [
  { asset: "Bitcoin", symbol: "BTC", amount: 0.15, entryPrice: 42000, currentPrice: null, color: "#f97316" },
  { asset: "Ethereum", symbol: "ETH", amount: 2.5, entryPrice: 2200, currentPrice: null, color: "#6366f1" },
  { asset: "Solana", symbol: "SOL", amount: 25, entryPrice: 95, currentPrice: null, color: "#a855f7" },
  { asset: "Chainlink", symbol: "LINK", amount: 100, entryPrice: 14, currentPrice: null, color: "#3b82f6" },
];

function parsePrice(str: string | undefined): number | null {
  if (!str) return null;
  const match = str.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

function fmt(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return "$" + n.toFixed(2);
}

function fmtSmall(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>(INITIAL_POSITIONS);
  const [vegaBrief, setVegaBrief] = useState<VegaBrief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/vega-brief")
      .then((r) => r.json())
      .then((data: VegaBrief) => {
        setVegaBrief(data);
        const btcPrice = parsePrice(data.btcStructure);
        const ethPrice = parsePrice(data.ethPrice);
        const solPrice = parsePrice(data.solPrice);

        setPositions((prev) =>
          prev.map((p) => {
            if (p.symbol === "BTC" && btcPrice) return { ...p, currentPrice: btcPrice };
            if (p.symbol === "ETH" && ethPrice) return { ...p, currentPrice: ethPrice };
            if (p.symbol === "SOL" && solPrice) return { ...p, currentPrice: solPrice };
            return p;
          })
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Calculations
  const positionsWithCalcs = positions.map((p) => {
    const currentValue = p.currentPrice !== null ? p.currentPrice * p.amount : null;
    const costBasis = p.entryPrice * p.amount;
    const pnl = currentValue !== null ? currentValue - costBasis : null;
    const pnlPct = pnl !== null ? (pnl / costBasis) * 100 : null;
    return { ...p, currentValue, costBasis, pnl, pnlPct };
  });

  const totalValue = positionsWithCalcs.reduce((s, p) => s + (p.currentValue ?? p.costBasis), 0);
  const totalCost = positionsWithCalcs.reduce((s, p) => s + p.costBasis, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = (totalPnl / totalCost) * 100;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-1">Vega ⚡</p>
              <h1 className="text-2xl font-semibold tracking-tight">Portfolio Tracker</h1>
              <p className="text-sm text-white/40 mt-1">
                {vegaBrief?.marketMode ? (
                  <span>
                    Market: <span className={vegaBrief.marketMode === "Risk-On" ? "text-emerald-400" : vegaBrief.marketMode === "Risk-Off" ? "text-red-400" : "text-yellow-400"}>
                      {vegaBrief.marketMode}
                    </span>
                    {" · "}{vegaBrief.fearGreed}
                  </span>
                ) : "Loading market data..."}
              </p>
            </div>
            {loading && (
              <RefreshCw className="h-4 w-4 text-white/30 animate-spin shrink-0" />
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-6">

        {/* Total Portfolio Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Total Value</p>
            <p className="text-2xl font-semibold">{fmtSmall(totalValue)}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Total P&amp;L</p>
            <p className={`text-xl font-semibold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnl >= 0 ? "+" : ""}{fmtSmall(totalPnl)}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">P&amp;L %</p>
            <p className={`text-xl font-semibold ${totalPnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Allocation Bar */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-white/70 mb-4 uppercase tracking-wider">Allocation</h2>
          <div className="flex h-8 w-full rounded-lg overflow-hidden gap-0.5">
            {positionsWithCalcs.map((p) => {
              const alloc = ((p.currentValue ?? p.costBasis) / totalValue) * 100;
              return (
                <div
                  key={p.symbol}
                  title={`${p.symbol}: ${alloc.toFixed(1)}%`}
                  style={{ width: `${alloc}%`, backgroundColor: p.color + "cc" }}
                  className="transition-all"
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {positionsWithCalcs.map((p) => {
              const alloc = ((p.currentValue ?? p.costBasis) / totalValue) * 100;
              const overLimit = alloc > 25;
              return (
                <div key={p.symbol} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-xs text-white/60">{p.symbol}</span>
                  <span className={`text-xs font-medium ${overLimit ? "text-amber-400" : "text-white/80"}`}>
                    {alloc.toFixed(1)}%
                    {overLimit && " ⚠"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Positions Table — desktop */}
        <div className="hidden sm:block rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
          <div className="p-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Asset</th>
                  <th className="text-right px-4 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Amount</th>
                  <th className="text-right px-4 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Entry Price</th>
                  <th className="text-right px-4 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Current Price</th>
                  <th className="text-right px-4 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">P&amp;L</th>
                  <th className="text-right px-4 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Allocation</th>
                </tr>
              </thead>
              <tbody>
                {positionsWithCalcs.map((p) => {
                  const alloc = ((p.currentValue ?? p.costBasis) / totalValue) * 100;
                  return (
                    <tr key={p.symbol} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="font-medium">{p.asset}</span>
                          <span className="text-white/30 text-xs">{p.symbol}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-white/70 font-mono text-xs">
                        {p.amount} {p.symbol}
                      </td>
                      <td className="px-4 py-3 text-right text-white/60 font-mono text-xs">
                        {fmt(p.entryPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {p.currentPrice !== null ? (
                          <span className="text-white/90">{fmt(p.currentPrice)}</span>
                        ) : (
                          <span className="text-white/25">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.pnl !== null ? (
                          <div>
                            <span className={`font-mono text-xs font-medium ${p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {p.pnl >= 0 ? "+" : ""}{fmtSmall(p.pnl)}
                            </span>
                            <div className={`text-[10px] ${p.pnlPct! >= 0 ? "text-emerald-400/60" : "text-red-400/60"}`}>
                              {p.pnlPct! >= 0 ? "+" : ""}{p.pnlPct!.toFixed(1)}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-white/25 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-medium ${alloc > 25 ? "text-amber-400" : "text-white/60"}`}>
                          {alloc.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Positions Cards — mobile */}
        <div className="sm:hidden space-y-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Positions</h2>
          {positionsWithCalcs.map((p) => {
            const alloc = ((p.currentValue ?? p.costBasis) / totalValue) * 100;
            return (
              <div key={p.symbol} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="font-medium">{p.asset}</span>
                    <span className="text-white/30 text-xs">{p.symbol}</span>
                  </div>
                  {p.pnl !== null && (
                    <span className={`text-sm font-medium ${p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.pnl >= 0 ? "+" : ""}{p.pnlPct!.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-white/30">Amount</p>
                    <p className="text-white/80 font-mono">{p.amount} {p.symbol}</p>
                  </div>
                  <div>
                    <p className="text-white/30">Entry</p>
                    <p className="text-white/80 font-mono">{fmt(p.entryPrice)}</p>
                  </div>
                  <div>
                    <p className="text-white/30">Current</p>
                    <p className="text-white/80 font-mono">{p.currentPrice ? fmt(p.currentPrice) : "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-white/30">P&amp;L</p>
                    <p className={`font-mono ${p.pnl !== null ? (p.pnl >= 0 ? "text-emerald-400" : "text-red-400") : "text-white/25"}`}>
                      {p.pnl !== null ? `${p.pnl >= 0 ? "+" : ""}${fmtSmall(p.pnl)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/30">Allocation</p>
                    <p className={alloc > 25 ? "text-amber-400" : "text-white/80"}>{alloc.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Vega Risk Rules */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-400 mb-2">Vega Risk Rules</p>
              <ul className="space-y-1 text-sm text-white/60">
                <li>• Never more than 25% in any single asset</li>
                <li>• Respect stop losses — no moving them lower once set</li>
                <li>• Risk-Off mode: reduce position sizes, hold more stable assets</li>
                <li>• Extreme Fear (&lt;20): watch for capitulation, not the time to panic sell</li>
                <li>• Extreme Greed (&gt;80): begin reducing exposure, take profits</li>
              </ul>
            </div>
          </div>
        </div>

        {vegaBrief?.lastUpdated && (
          <p className="text-xs text-white/20 text-right">
            Prices from Vega brief · Updated {new Date(vegaBrief.lastUpdated).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
