import { NextResponse } from "next/server";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dir = join(process.cwd(), "src/data/briefs");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const briefs = files.map((file) => {
      try {
        const data = JSON.parse(readFileSync(join(dir, file), "utf-8"));
        return { date: file.replace(".json", ""), ...data };
      } catch {
        return { date: file.replace(".json", ""), error: "parse error" };
      }
    });

    return NextResponse.json(briefs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ briefs: [], error: message }, { status: 200 });
  }
}
