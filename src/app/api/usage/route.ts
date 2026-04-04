import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "src/data/costs.json");
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return NextResponse.json(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        lastUpdated: "",
        todayCost: 0,
        yesterdayCost: 0,
        last7DaysCost: 0,
        monthToDateCost: 0,
        dailyBreakdown: [],
        topModels: [],
        monthlyBudget: 150,
        optimizationNote: "",
        error: message,
      },
      { status: 200 }
    );
  }
}
