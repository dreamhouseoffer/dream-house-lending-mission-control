import { NextResponse } from "next/server";
import { ceremonyRoute } from "@/lib/mission-control/approval-ceremony-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

// Owner challenge issue. Fail closed (503 ceremony_unavailable) unless the reviewed challenge-only bridge
// capability and the owner opt-in are both present. Grants nothing; no UI calls this yet.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { status, body } = await ceremonyRoute("issue", params.id, await request.text());
  return NextResponse.json(body, { status, headers: HEADERS });
}
