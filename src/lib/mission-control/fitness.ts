// Server-only Body OS wrapper over the signed private bridge. Import from route handlers only.
// Reads MC_BRIDGE_URL / MC_BRIDGE_SECRET at request time, never logs either value, never caches.
import { unstable_noStore as noStore } from "next/cache";
import { readBridgeConfig } from "./bridge-client.mjs";
import { hasControlAccess } from "./bridge";
import { completeWhoopOAuth, fetchLogs, fetchPlan, fetchWhoop, fetchWhoopOAuthStatus, postSet, postWhoopClient, startWhoopOAuth } from "./fitness-client.mjs";

type Failure = { ok: false; state: string; code: string };

async function guarded(fn: (cfg: ReturnType<typeof readBridgeConfig>) => Promise<unknown>): Promise<Record<string, unknown>> {
  noStore();
  const cfg = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
  if (!cfg.configured) return { ok: false, state: "not_configured", code: cfg.reason ?? "not_configured" } satisfies Failure;
  if (!(await hasControlAccess())) return { ok: false, state: "unauthenticated", code: "unauthenticated" } satisfies Failure;
  return (await fn(cfg)) as Record<string, unknown>;
}

export const readFitnessPlan = () => guarded((cfg) => fetchPlan(cfg));
export const readWhoop = () => guarded((cfg) => fetchWhoop(cfg));
export const readFitnessLogs = (q: { date: string | null; session: string | null }) => guarded((cfg) => fetchLogs(cfg, q));
export const saveFitnessSet = (set: Record<string, unknown>, key: string) => guarded((cfg) => postSet(cfg, set, key));
export const readWhoopOAuthStatus = () => guarded((cfg) => fetchWhoopOAuthStatus(cfg));
export const saveWhoopClient = (input: { client_id: string; client_secret: string }) => guarded((cfg) => postWhoopClient(cfg, input));
export const beginWhoopOAuth = (nonceSha256: string) => guarded((cfg) => startWhoopOAuth(cfg, nonceSha256));

// Public callback only: no owner session exists on WHOOP's cross-site redirect, so this is NOT session-guarded. The bridge
// binds the attempt through the pending record (state + browser nonce from the authenticated start). Returns a fixed code.
export async function finishWhoopOAuth(cb: { state: string; nonce: string; code?: string; error?: string }): Promise<string> {
  noStore();
  const cfg = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
  if (!cfg.configured) return "unavailable";
  return completeWhoopOAuth(cfg, cb);
}
