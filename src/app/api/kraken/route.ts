import { NextResponse } from "next/server";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetHolding {
  asset: string;
  rawBalance: number;
  usdValue: number | null;
  pct: number;
}

interface KrakenPortfolio {
  connected: boolean;
  assets: AssetHolding[];
  totalUSD: number;
  lastUpdated: string;
  cached?: boolean;
  error?: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cache: { data: KrakenPortfolio; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Asset name normalization ─────────────────────────────────────────────────

const ASSET_MAP: Record<string, string> = {
  XXBT: "BTC",
  XBT: "BTC",
  XETH: "ETH",
  ETH: "ETH",
  ZUSD: "USD",
  USD: "USD",
  USDC: "USDC",
  USDT: "USDT",
  SOL: "SOL",
  XSOL: "SOL",
  XXRP: "XRP",
  XRP: "XRP",
  ADA: "ADA",
  DOT: "DOT",
  LINK: "LINK",
  MATIC: "MATIC",
  POL: "POL",
  XLTC: "LTC",
  LTC: "LTC",
  AVAX: "AVAX",
  ATOM: "ATOM",
  UNI: "UNI",
  AAVE: "AAVE",
};

function normalizeAsset(krakenName: string): string {
  return ASSET_MAP[krakenName] ?? krakenName;
}

// ─── Kraken signature ─────────────────────────────────────────────────────────

function getKrakenSignature(
  urlPath: string,
  nonce: string,
  postData: string,
  secret: string
): string {
  const sha256 = crypto
    .createHash("sha256")
    .update(nonce + postData)
    .digest();
  const hmac = crypto.createHmac("sha512", Buffer.from(secret, "base64"));
  hmac.update(Buffer.concat([Buffer.from(urlPath), sha256]));
  return hmac.digest("base64");
}

// ─── Price fetch ──────────────────────────────────────────────────────────────

async function fetchCryptoPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price" +
        "?ids=bitcoin,ethereum,solana,cardano,polkadot,chainlink,litecoin,ripple,avalanche-2,matic-network,cosmos,uniswap,aave" +
        "&vs_currencies=usd",
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return {};
    const data = await res.json();
    return {
      BTC: data.bitcoin?.usd ?? 0,
      ETH: data.ethereum?.usd ?? 0,
      SOL: data.solana?.usd ?? 0,
      ADA: data.cardano?.usd ?? 0,
      DOT: data.polkadot?.usd ?? 0,
      LINK: data.chainlink?.usd ?? 0,
      LTC: data.litecoin?.usd ?? 0,
      XRP: data.ripple?.usd ?? 0,
      AVAX: data["avalanche-2"]?.usd ?? 0,
      MATIC: data["matic-network"]?.usd ?? 0,
      POL: data["matic-network"]?.usd ?? 0,
      ATOM: data.cosmos?.usd ?? 0,
      UNI: data.uniswap?.usd ?? 0,
      AAVE: data.aave?.usd ?? 0,
      USDC: 1,
      USDT: 1,
      USD: 1,
    };
  } catch {
    return {};
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  // Serve from cache if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  const apiKey = process.env.KRAKEN_API_KEY;
  const privateKey = process.env.KRAKEN_PRIVATE_KEY;

  if (!apiKey || !privateKey) {
    return NextResponse.json({
      connected: false,
      assets: [],
      totalUSD: 0,
      lastUpdated: new Date().toISOString(),
      cached: false,
      error: "Kraken API keys not configured",
    } satisfies KrakenPortfolio);
  }

  try {
    const urlPath = "/0/private/Balance";
    const nonce = Date.now().toString();
    const postData = `nonce=${nonce}`;
    const signature = getKrakenSignature(urlPath, nonce, postData, privateKey);

    const res = await fetch(`https://api.kraken.com${urlPath}`, {
      method: "POST",
      headers: {
        "API-Key": apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: postData,
    });

    if (!res.ok) {
      return NextResponse.json({
        connected: false,
        assets: [],
        totalUSD: 0,
        lastUpdated: new Date().toISOString(),
        cached: false,
        error: `Kraken HTTP error: ${res.status}`,
      } satisfies KrakenPortfolio);
    }

    const krakenData = await res.json();

    if (krakenData.error?.length > 0) {
      return NextResponse.json({
        connected: false,
        assets: [],
        totalUSD: 0,
        lastUpdated: new Date().toISOString(),
        cached: false,
        error: krakenData.error.join(", "),
      } satisfies KrakenPortfolio);
    }

    const prices = await fetchCryptoPrices();
    const balances = krakenData.result as Record<string, string>;

    const assets: AssetHolding[] = Object.entries(balances)
      .filter(([, balance]) => parseFloat(balance) > 0.00001)
      .map(([krakenAsset, balance]) => {
        const symbol = normalizeAsset(krakenAsset);
        const rawBalance = parseFloat(balance);
        const price = prices[symbol] ?? null;
        const usdValue = price != null ? rawBalance * price : null;
        return { asset: symbol, rawBalance, usdValue, pct: 0 };
      })
      .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

    const totalUSD = assets.reduce((sum, a) => sum + (a.usdValue ?? 0), 0);

    // Compute portfolio %
    for (const a of assets) {
      a.pct =
        totalUSD > 0 && a.usdValue != null
          ? (a.usdValue / totalUSD) * 100
          : 0;
    }

    const portfolio: KrakenPortfolio = {
      connected: true,
      assets,
      totalUSD,
      lastUpdated: new Date().toISOString(),
    };

    cache = { data: portfolio, timestamp: Date.now() };

    return NextResponse.json({ ...portfolio, cached: false });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      assets: [],
      totalUSD: 0,
      lastUpdated: new Date().toISOString(),
      cached: false,
      error: err instanceof Error ? err.message : "Unknown error",
    } satisfies KrakenPortfolio);
  }
}
