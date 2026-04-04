#!/usr/bin/env node
/**
 * update-dashboard.js — Zero LLM token Mission Control updater
 *
 * What it does:
 *   1. Reads ~/.openclaw/cron/jobs.json → writes src/data/agent-status.json
 *   2. Fetches live market data (CoinGecko + Fear & Greed, free APIs) → writes src/data/vega-brief.json
 *   3. Fetches Anthropic usage API → updates src/data/costs.json
 *   4. Git commits and pushes → Vercel auto-redeploys
 *
 * Token cost: $0.00
 *
 * Setup:
 *   chmod +x scripts/update-dashboard.js
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/update-dashboard.js
 *
 * Scheduled via launchd: ~/Library/LaunchAgents/com.dreamhouse.dashboard-update.plist
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");

const HOME = process.env.HOME || "/Users/alfonsogarzabot";
const OPENCLAW_DIR = path.join(HOME, ".openclaw");
const MC_DIR = path.join(HOME, "Projects", "mission-control");
const DATA_DIR = path.join(MC_DIR, "src", "data");
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const MARKET_SNAPSHOT_PATH = path.join(HOME, ".openclaw", "workspace", "market-snapshot.json");

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── HTTPS helper ────────────────────────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { "User-Agent": "mission-control-updater/1.0", ...headers } };
    https.get(url, opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on("error", reject);
  });
}

// ─── 1. Agent Status ─────────────────────────────────────────────────────────

function buildAgentStatus() {
  log("Reading cron jobs...");
  const jobsPath = path.join(OPENCLAW_DIR, "cron", "jobs.json");
  const raw = JSON.parse(fs.readFileSync(jobsPath, "utf-8"));

  const agents = raw.jobs.map((job) => ({
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    schedule: job.schedule.expr,
    tz: job.schedule.tz,
    model: job.payload?.model || "default",
    lastRunAt: job.state?.lastRunAtMs
      ? new Date(job.state.lastRunAtMs).toISOString()
      : null,
    lastStatus: job.state?.lastStatus || "unknown",
    lastDurationMs: job.state?.lastDurationMs || null,
    consecutiveErrors: job.state?.consecutiveErrors || 0,
    nextRunAt: job.state?.nextRunAtMs
      ? new Date(job.state.nextRunAtMs).toISOString()
      : null,
    lastError: job.state?.lastError || null,
  }));

  const result = {
    lastUpdated: new Date().toISOString(),
    note: "Auto-updated by scripts/update-dashboard.js — do not edit manually",
    agents,
  };

  fs.writeFileSync(
    path.join(DATA_DIR, "agent-status.json"),
    JSON.stringify(result, null, 2)
  );
  log(`Agent status written — ${agents.length} agents`);
}

// ─── 2. Market Snapshot → /openclaw/workspace/market-snapshot.json ───────────

async function fetchYahooQuote(symbol) {
  try {
    const encoded = encodeURIComponent(symbol);
    const res = await httpsGet(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2d`,
      { Accept: "application/json" }
    );
    if (res.status !== 200 || !res.body?.chart?.result?.[0]) return null;
    const meta = res.body.chart.result[0].meta;
    const price = meta.regularMarketPrice ?? null;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const changePct = (price !== null && prevClose) ? ((price - prevClose) / prevClose) * 100 : null;
    return { price, prevClose, changePct };
  } catch {
    return null;
  }
}

async function buildMarketSnapshot() {
  log("Fetching market snapshot data...");

  // Load previous snapshot for fallback on failure
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(MARKET_SNAPSHOT_PATH, "utf-8"));
  } catch { /* first run */ }

  // ── Crypto: CoinGecko ──
  let cryptoData = prev.crypto || null;
  try {
    const [marketRes, fngRes, globalRes] = await Promise.all([
      httpsGet(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&sparkline=false&price_change_percentage=7d"
      ),
      httpsGet("https://api.alternative.me/fng/?limit=1"),
      httpsGet("https://api.coingecko.com/api/v3/global"),
    ]);

    const coins = Array.isArray(marketRes.body) ? marketRes.body : [];
    const btc = coins.find((c) => c.id === "bitcoin");
    const eth = coins.find((c) => c.id === "ethereum");
    const sol = coins.find((c) => c.id === "solana");
    const fngData = fngRes.body?.data?.[0];
    const globalInfo = globalRes.body?.data || {};

    const coinEntry = (c) => c ? {
      price: c.current_price,
      change24h: c.price_change_percentage_24h ?? null,
      change7d: c.price_change_percentage_7d_in_currency ?? null,
      marketCap: c.market_cap ?? null,
    } : null;

    cryptoData = {
      btc: coinEntry(btc),
      eth: coinEntry(eth),
      sol: coinEntry(sol),
      totalMarketCap: globalInfo.total_market_cap?.usd ?? null,
      btcDominance: globalInfo.market_cap_percentage?.btc ?? null,
      fearGreed: fngData ? {
        value: Number(fngData.value),
        label: fngData.value_classification,
      } : null,
      status: "live",
    };
    log(`Crypto snapshot: BTC $${btc?.current_price?.toLocaleString() ?? "?"}`);
  } catch (err) {
    log(`Crypto fetch failed: ${err.message} — using last known`);
    if (cryptoData) cryptoData.status = "stale";
  }

  // ── Stocks & Macro: Yahoo Finance (no key needed) ──
  let stocksData = prev.stocks || null;
  let macroData = prev.macro || null;
  try {
    const [spyQ, qqqQ, tnxQ, dxyQ] = await Promise.all([
      fetchYahooQuote("SPY"),
      fetchYahooQuote("QQQ"),
      fetchYahooQuote("^TNX"),
      fetchYahooQuote("DX-Y.NYB"),
    ]);

    stocksData = {
      spy: spyQ ? { price: spyQ.price, changePct: spyQ.changePct } : { price: null, changePct: null },
      qqq: qqqQ ? { price: qqqQ.price, changePct: qqqQ.changePct } : { price: null, changePct: null },
      status: (spyQ || qqqQ) ? "live" : "unavailable",
    };

    macroData = {
      treasury10y: tnxQ ? { yield: tnxQ.price, changePct: tnxQ.changePct } : { yield: null, changePct: null, note: "unavailable" },
      dxy: dxyQ ? { value: dxyQ.price, changePct: dxyQ.changePct } : { value: null, changePct: null, note: "unavailable" },
      status: (tnxQ || dxyQ) ? "live" : "unavailable",
    };
    log(`Stocks: SPY $${spyQ?.price ?? "?"}, QQQ $${qqqQ?.price ?? "?"} | 10Y: ${tnxQ?.price ?? "?"}%`);
  } catch (err) {
    log(`Stocks/macro fetch failed: ${err.message} — using last known`);
    if (stocksData) stocksData.status = "stale";
    if (macroData) macroData.status = "stale";
  }

  // ── Mortgage: placeholder (FRED requires API key) ──
  const mortgageData = prev.mortgage?.rate30y
    ? { ...prev.mortgage, status: "stale" }
    : {
        rate30y: null,
        status: "unavailable",
        note: "Live data requires FRED API key (series MORTGAGE30US). Set FRED_API_KEY env var to enable.",
      };

  const snapshot = {
    timestamp: new Date().toISOString(),
    source: "update-dashboard.js",
    crypto: cryptoData,
    stocks: stocksData,
    macro: macroData,
    mortgage: mortgageData,
  };

  fs.writeFileSync(MARKET_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  log(`Market snapshot written → ${MARKET_SNAPSHOT_PATH}`);
  return snapshot;
}

// ─── 3. Vega Brief (free market APIs, no LLM) ────────────────────────────────

async function buildVegaBrief(snapshot) {
  log("Building Vega brief from market snapshot...");
  try {
    const crypto = snapshot?.crypto || {};
    const stocks = snapshot?.stocks || {};
    const macro = snapshot?.macro || {};

    const btc = crypto.btc;
    const eth = crypto.eth;
    const sol = crypto.sol;
    const fng = crypto.fearGreed;
    const fngValue = fng?.value ?? null;
    const fngLabel = fng?.label ?? "Unknown";
    const btcDom = crypto.btcDominance;

    let marketMode = "Neutral";
    if (fngValue !== null) {
      if (fngValue >= 65) marketMode = "Risk-On";
      else if (fngValue <= 35) marketMode = "Risk-Off";
    }

    const fmt = (n) =>
      n == null ? "Unavailable"
      : n >= 1000
        ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : "$" + n.toFixed(2);

    const pct = (n) => n == null ? "?" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

    const spyStr = stocks.spy?.price
      ? `${fmt(stocks.spy.price)} (${pct(stocks.spy.changePct)} today)`
      : "Unavailable";
    const qqqStr = stocks.qqq?.price
      ? `${fmt(stocks.qqq.price)} (${pct(stocks.qqq.changePct)} today)`
      : "Unavailable";
    const tnxStr = macro.treasury10y?.yield
      ? `${macro.treasury10y.yield.toFixed(2)}% (${pct(macro.treasury10y.changePct)} today)`
      : "Unavailable";
    const dxyStr = macro.dxy?.value
      ? `${macro.dxy.value.toFixed(2)} (${pct(macro.dxy.changePct)} today)`
      : "Unavailable";

    const brief = {
      lastUpdated: new Date().toISOString(),
      source: "update-dashboard-script",
      snapshotPath: MARKET_SNAPSHOT_PATH,
      marketMode,
      fearGreed: fngValue !== null ? `${fngValue}/100 — ${fngLabel}` : "Unavailable",
      btcDominance: btcDom ? btcDom.toFixed(1) + "%" : "—",
      spyTrend: spyStr,
      qqqTrend: qqqStr,
      treasury10y: tnxStr,
      dxy: dxyStr,
      btcStructure: btc
        ? `${fmt(btc.price)} (${pct(btc.change24h)} 24h | ${pct(btc.change7d)} 7d)`
        : "Unavailable",
      ethPrice: eth
        ? `${fmt(eth.price)} (${pct(eth.change24h)} 24h | ${pct(eth.change7d)} 7d)`
        : "Unavailable",
      solPrice: sol
        ? `${fmt(sol.price)} (${pct(sol.change24h)} 24h | ${pct(sol.change7d)} 7d)`
        : "Unavailable",
      totalCryptoMarketCap: crypto.totalMarketCap
        ? "$" + (crypto.totalMarketCap / 1e12).toFixed(2) + "T"
        : "—",
      topOpportunity: "Check Vega's 7am Telegram brief for trade ideas",
      topRisk: `Fear & Greed at ${fngValue ?? "?"}/100 — monitor for sentiment shifts`,
    };

    fs.writeFileSync(
      path.join(DATA_DIR, "vega-brief.json"),
      JSON.stringify(brief, null, 2)
    );
    log(`Vega brief written — BTC: ${brief.btcStructure}, Mode: ${marketMode}`);
  } catch (err) {
    log(`Vega brief build failed: ${err.message} — skipping`);
  }
}

// ─── 4. Anthropic Usage → costs.json ─────────────────────────────────────────

async function updateCosts() {
  if (!ANTHROPIC_KEY) {
    log("ANTHROPIC_API_KEY not set — updating costs.json timestamp only");
    updateCostsTimestamp();
    return;
  }

  log("Fetching Anthropic usage...");
  try {
    // Anthropic usage API — requires API key with billing access
    const res = await httpsGet(
      "https://api.anthropic.com/v1/usage",
      {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      }
    );

    if (res.status !== 200 || !res.body?.data) {
      log(`Anthropic usage API returned ${res.status} — updating timestamp only`);
      updateCostsTimestamp();
      return;
    }

    // Build cost breakdown from API response
    const today = new Date().toISOString().split("T")[0];
    const costsPath = path.join(DATA_DIR, "costs.json");
    const existing = JSON.parse(fs.readFileSync(costsPath, "utf-8"));

    // Anthropic usage API response shape may vary — handle gracefully
    const usage = res.body.data || [];
    let todayCost = 0;
    let monthCost = 0;
    const modelMap = {};

    for (const entry of usage) {
      const cost = entry.cost_usd || 0;
      const model = entry.model || "unknown";
      monthCost += cost;
      if (entry.date === today) todayCost += cost;
      modelMap[model] = (modelMap[model] || 0) + cost;
    }

    const topModels = Object.entries(modelMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([model, cost]) => ({
        model,
        cost: Number(cost.toFixed(2)),
        percentage: monthCost > 0 ? Math.round((cost / monthCost) * 100) : 0,
      }));

    const updated = {
      ...existing,
      lastUpdated: today,
      todayCost: Number(todayCost.toFixed(2)),
      monthToDateCost: Number(monthCost.toFixed(2)),
      topModels: topModels.length > 0 ? topModels : existing.topModels,
    };

    fs.writeFileSync(costsPath, JSON.stringify(updated, null, 2));
    log(`Costs updated — today: $${todayCost.toFixed(2)}, MTD: $${monthCost.toFixed(2)}`);
  } catch (err) {
    log(`Anthropic usage fetch failed: ${err.message} — updating timestamp only`);
    updateCostsTimestamp();
  }
}

function updateCostsTimestamp() {
  const costsPath = path.join(DATA_DIR, "costs.json");
  const existing = JSON.parse(fs.readFileSync(costsPath, "utf-8"));
  existing.lastUpdated = new Date().toISOString().split("T")[0];
  fs.writeFileSync(costsPath, JSON.stringify(existing, null, 2));
  log("Costs timestamp updated");
}

// ─── 5. Git commit + push ────────────────────────────────────────────────────

function gitPush() {
  log("Committing and pushing to GitHub...");
  try {
    execSync("git add src/data/agent-status.json src/data/vega-brief.json src/data/costs.json", {
      cwd: MC_DIR,
      stdio: "pipe",
    });

    const hasChanges = execSync("git diff --cached --stat", {
      cwd: MC_DIR,
      stdio: "pipe",
    }).toString().trim();

    if (!hasChanges) {
      log("No changes to commit — skipping push");
      return;
    }

    const date = new Date().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
    execSync(`git commit -m "auto: dashboard data update ${date}"`, {
      cwd: MC_DIR,
      stdio: "pipe",
    });
    execSync("git push --set-upstream origin main", { cwd: MC_DIR, stdio: "pipe" });
    log("Pushed — Vercel will redeploy in ~30 seconds");
  } catch (err) {
    log(`Git push failed: ${err.message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("=== Mission Control Dashboard Update ===");
  const snapshot = await buildMarketSnapshot();
  buildAgentStatus();
  await buildVegaBrief(snapshot);
  await updateCosts();
  gitPush();
  log("=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
