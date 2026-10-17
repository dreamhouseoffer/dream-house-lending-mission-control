import { NextResponse } from "next/server";
import { readApprovalsRoute } from "@/lib/mission-control/approvals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

// Read-only approval detail. No mutation exists on this route; decisions stay unavailable.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { status, body } = await readApprovalsRoute("detail", request.url, params.id);
  return NextResponse.json(body, { status, headers: HEADERS });
}
