import { NextResponse } from "next/server";
import { readApprovalsRoute } from "@/lib/mission-control/approvals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

// Read-only approvals list (optional ?task_id=). No mutation exists on this route; decisions stay unavailable.
export async function GET(request: Request) {
  const { status, body } = await readApprovalsRoute("list", request.url);
  return NextResponse.json(body, { status, headers: HEADERS });
}
