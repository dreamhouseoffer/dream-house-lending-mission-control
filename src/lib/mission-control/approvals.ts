// Server-only Next wrapper for the approvals READ adapter. Reads session and bridge config from server env at request
// time; the bridge HMAC secret never leaves this process. No decision or challenge entry point exists here.
import { unstable_noStore as noStore } from "next/cache";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session.mjs";
import { readBridgeConfig } from "./bridge-client.mjs";
import { handleApprovalRead } from "./approvals-client.mjs";

export async function readApprovalsRoute(kind: "list" | "detail", requestUrl: string, id?: string) {
  noStore();
  return handleApprovalRead({
    env: {
      MISSION_CONTROL_PIN: process.env.MISSION_CONTROL_PIN,
      MISSION_CONTROL_SESSION_SECRET: process.env.MISSION_CONTROL_SESSION_SECRET,
      MISSION_CONTROL_CANONICAL_ORIGIN: process.env.MISSION_CONTROL_CANONICAL_ORIGIN,
    },
    token: cookies().get(SESSION_COOKIE)?.value,
    headers: headers(),
    kind,
    id,
    query: new URL(requestUrl).searchParams,
    bridgeConfig: readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET }),
  }) as Promise<{ status: number; body: Record<string, unknown> }>;
}
