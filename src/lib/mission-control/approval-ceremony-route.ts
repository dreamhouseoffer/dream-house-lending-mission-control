// Server-only Next wrapper for the approval CEREMONY adapter. Reads session, origin, opt-in and bridge config from
// server env at request time; the bridge HMAC secret never leaves this process. Fail closed: every route answers
// 503 ceremony_unavailable unless the owner opt-in and the bridge's reviewed challenge-only advertisement both hold.
import { unstable_noStore as noStore } from "next/cache";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session.mjs";
import { readBridgeConfig } from "./bridge-client.mjs";
import { handleChallengeDecision, handleChallengeIssue, revokeSessionOnLogout } from "./approval-ceremony.mjs";

type Result = { status: number; body: Record<string, unknown> };

function ceremonyEnv() {
  return {
    MISSION_CONTROL_PIN: process.env.MISSION_CONTROL_PIN,
    MISSION_CONTROL_SESSION_SECRET: process.env.MISSION_CONTROL_SESSION_SECRET,
    MISSION_CONTROL_CANONICAL_ORIGIN: process.env.MISSION_CONTROL_CANONICAL_ORIGIN,
    MISSION_CONTROL_APPROVAL_CEREMONY: process.env.MISSION_CONTROL_APPROVAL_CEREMONY,
  };
}

const bridgeConfig = () => readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });

export async function ceremonyRoute(kind: "issue" | "decide", approvalId: string, bodyText: string): Promise<Result> {
  noStore();
  const input = {
    env: ceremonyEnv(),
    token: cookies().get(SESSION_COOKIE)?.value,
    headers: headers(),
    approvalId,
    bodyText,
    bridgeConfig: bridgeConfig(),
  };
  return (kind === "issue" ? handleChallengeIssue(input) : handleChallengeDecision(input)) as Promise<Result>;
}

export async function revokeOnLogout(token: string | undefined): Promise<string> {
  noStore();
  return revokeSessionOnLogout({ env: ceremonyEnv(), token, bridgeConfig: bridgeConfig() });
}
