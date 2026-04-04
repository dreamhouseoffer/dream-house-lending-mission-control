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

// ─── 2. Vega Brief (free market APIs, no LLM) ────────────────────────────────

async function buildVegaBrief() {
  log("Fetching market data for Vega brief...");
  try {
    const [marketRes, fngRes, globalRes] = await Promise.all([
      httpsGet(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&sparkline=false"
      ),
      httpsGet("https://api.alternative.me/fng/?limit=1"),
      httpsGet("https://api.coingecko.com/api/v3/global"),
    ]);

    const coins = Array.isArray(marketRes.body) ? marketRes.body : [];
    const btc = coins.find((c) => c.id === "bitcoin");
    const eth = coins.find((c) => c.id === "ethereum");
    const sol = coins.find((c) => c.id === "solana");

    const fngData = fngRes.body?.data?.[0];
    const fngValue = fngData ? Number(fngData.value) : null;
    const fngLabel = fngData ? fngData.value_classification : "Unknown";

    const btcDom = globalRes.body?.data?.market_cap_percentage?.btc;

    // Derive a simple market mode from Fear & Greed
    let marketMode = "Neutral";
    if (fngValue !== null) {
      if (fngValue >= 65) marketMode = "Risk-On";
      else if (fngValue <= 35) marketMode = "Risk-Off";
    }

    const fmt = (n) =>
      n >= 1000
        ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : "$" + n.toFixed(2);

    const pct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

    const brief = {
      lastUpdated: new Date().toISOString(),
      source: "update-dashboard-script",
      marketMode,
      fearGreed: fngValue !== null ? `${fngValue}/100 — ${fngLabel}` : "Unavailable",
      btcDominance: btcDom ? btcDom.toFixed(1) + "%" : "—",
      spyTrend: "Live data unavailable — use CoinGecko data below for crypto context",
      btcStructure: btc
        ? `${fmt(btc.current_price)} (${pct(btc.price_change_percentage_24h)} 24h)`
        : "Unavailable",
      ethPrice: eth
        ? `${fmt(eth.current_price)} (${pct(eth.price_change_percentage_24h)} 24h)`
        : "Unavailable",
      solPrice: sol
        ? `${fmt(sol.current_price)} (${pct(sol.price_change_percentage_24h)} 24h)`
        : "Unavailable",
      topOpportunity: "Check Vega's 7am Telegram brief for trade ideas",
      topRisk: `Fear & Greed at ${fngValue ?? "?"}/100 — monitor for sentiment shifts`,
    };

    fs.writeFileSync(
      path.join(DATA_DIR, "vega-brief.json"),
      JSON.stringify(brief, null, 2)
    );
    log(`Vega brief written — BTC: ${brief.btcStructure}, Mode: ${marketMode}`);
  } catch (err) {
    log(`Vega brief fetch failed: ${err.message} — skipping`);
  }
}

// ─── 3. Anthropic Usage → costs.json ─────────────────────────────────────────

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

// ─── 4. Git commit + push ────────────────────────────────────────────────────

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
    execSync("git push", { cwd: MC_DIR, stdio: "pipe" });
    log("Pushed — Vercel will redeploy in ~30 seconds");
  } catch (err) {
    log(`Git push failed: ${err.message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("=== Mission Control Dashboard Update ===");
  buildAgentStatus();
  await buildVegaBrief();
  await updateCosts();
  gitPush();
  log("=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
