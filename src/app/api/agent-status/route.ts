import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "src/data/agent-status.json");
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return NextResponse.json(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { lastUpdated: null, agents: [], error: message },
      { status: 200 }
    );
  }
}
