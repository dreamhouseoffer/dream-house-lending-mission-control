import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "src/data/vega-brief.json");
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return NextResponse.json(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        lastUpdated: null,
        marketMode: "Unknown",
        spyTrend: "Data unavailable",
        btcStructure: "Data unavailable",
        topOpportunity: "Data unavailable",
        topRisk: "Data unavailable",
        error: message,
      },
      { status: 200 }
    );
  }
}
