import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const VEGA_SYSTEM_PROMPT = `You are Vega, an elite AI-powered financial analyst and investment advisor. You operate at the level of a seasoned Wall Street quant analyst combined with a hedge fund portfolio manager and a crypto-native on-chain researcher. You think like a trader, reason like a risk manager, and communicate like a trusted advisor. Always structure responses with: 1) Macro Check 2) Technical Read 3) Sentiment Pulse 4) Risk Assessment 5) Verdict (Buy/Hold/Sell/Short/Avoid/Watch) with clear price levels. State conviction level: HIGH/MEDIUM/LOW. Be direct, cite data sources, no fluff. Note: nothing here constitutes licensed financial advice.

IMPORTANT: You must respond in valid JSON with this exact structure:
{
  "conviction": "HIGH" | "MEDIUM" | "LOW",
  "verdict": "BUY" | "HOLD" | "SELL" | "SHORT" | "AVOID" | "WATCH",
  "macroCheck": "string",
  "technicalRead": "string",
  "sentiment": "string",
  "riskAssessment": "string",
  "verdictDetail": "string"
}`;

async function fetchCryptoContext(): Promise<string> {
  try {
    const [marketRes, fngRes] = await Promise.all([
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&sparkline=false",
        { next: { revalidate: 0 } }
      ),
      fetch("https://api.alternative.me/fng/?limit=1", {
        next: { revalidate: 0 },
      }),
    ]);

    const market = marketRes.ok ? await marketRes.json() : [];
    const fng = fngRes.ok ? await fngRes.json() : { data: [] };

    const prices = market
      .map(
        (c: { name: string; current_price: number; price_change_percentage_24h: number; market_cap: number }) =>
          `${c.name}: $${c.current_price.toLocaleString()} (${c.price_change_percentage_24h?.toFixed(2)}% 24h, MCap: $${(c.market_cap / 1e9).toFixed(1)}B)`
      )
      .join("\n");

    const fngData = fng.data?.[0];
    const fngStr = fngData
      ? `Fear & Greed Index: ${fngData.value}/100 (${fngData.value_classification})`
      : "Fear & Greed: unavailable";

    return `LIVE MARKET DATA:\n${prices}\n${fngStr}\nDXY: ~104 (approximate)`;
  } catch {
    return "Live market data temporarily unavailable.";
  }
}

export async function POST(request: Request) {
  try {
    const { question } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const marketContext = await fetchCryptoContext();

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 1024,
      system: VEGA_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${marketContext}\n\nUser question: ${question}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(text);
      return NextResponse.json(parsed);
    } catch {
      // If not valid JSON, return raw text as a fallback
      return NextResponse.json({
        conviction: "MEDIUM",
        verdict: "WATCH",
        macroCheck: text,
        technicalRead: "See analysis above.",
        sentiment: "See analysis above.",
        riskAssessment: "See analysis above.",
        verdictDetail: "See analysis above.",
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
