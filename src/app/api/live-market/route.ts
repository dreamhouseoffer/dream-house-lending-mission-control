import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

interface LiveMarketResponse {
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

// ─── 5-minute server-side cache ───────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000;
let cache: { data: LiveMarketResponse; ts: number } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch(url: string, headers?: Record<string, string>) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "mission-control/1.0", ...headers },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchYahooQuote(
  symbol: string
): Promise<{ price: number | null; changePct: number | null }> {
  const encoded = encodeURIComponent(symbol);
  const data = await safeFetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2d`,
    { Accept: "application/json" }
  );
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return { price: null, changePct: null };
  const price: number | null = meta.regularMarketPrice ?? null;
  const prevClose: number | null =
    meta.chartPreviousClose ?? meta.previousClose ?? null;
  const changePct =
    price !== null && prevClose
      ? ((price - prevClose) / prevClose) * 100
      : null;
  return { price, changePct };
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function buildLiveMarket(): Promise<LiveMarketResponse> {
  const [coinsData, fngData, globalData, spy, qqq, tnx, dxy] =
    await Promise.all([
      safeFetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,cardano,chainlink&order=market_cap_desc&sparkline=false"
      ),
      safeFetch("https://api.alternative.me/fng/?limit=1"),
      safeFetch("https://api.coingecko.com/api/v3/global"),
      fetchYahooQuote("SPY"),
      fetchYahooQuote("QQQ"),
      fetchYahooQuote("^TNX"),
      fetchYahooQuote("DX-Y.NYB"),
    ]);

  const coins: CoinData[] = Array.isArray(coinsData) ? coinsData : [];

  const fearGreed =
    fngData?.data?.[0]
      ? {
          value: Number(fngData.data[0].value),
          label: fngData.data[0].value_classification as string,
        }
      : null;

  const btcDominance: number | null =
    globalData?.data?.market_cap_percentage?.btc ?? null;
  const totalMarketCap: number | null =
    globalData?.data?.total_market_cap?.usd ?? null;

  let marketMode: "Risk-On" | "Risk-Off" | "Neutral" = "Neutral";
  if (fearGreed) {
    if (fearGreed.value >= 65) marketMode = "Risk-On";
    else if (fearGreed.value <= 35) marketMode = "Risk-Off";
  }

  return {
    lastUpdated: new Date().toISOString(),
    cached: false,
    marketMode,
    coins,
    btcDominance,
    totalMarketCap,
    fearGreed,
    stocks: { spy, qqq },
    macro: {
      treasury10y: { yield: tnx.price, changePct: tnx.changePct },
      dxy: { value: dxy.price, changePct: dxy.changePct },
    },
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cache.ts < CACHE_TTL) {
      return NextResponse.json({ ...cache.data, cached: true });
    }
    const data = await buildLiveMarket();
    cache = { data, ts: now };
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
