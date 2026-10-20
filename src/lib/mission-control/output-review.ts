// Server-only Milo output-review wrapper over the signed private bridge. Import from route handlers only.
// Reads MC_BRIDGE_URL / MC_BRIDGE_SECRET at request time, never logs either value, never caches.
import { unstable_noStore as noStore } from "next/cache";
import { readBridgeConfig } from "./bridge-client.mjs";
import { hasControlAccess } from "./bridge";
import { fetchOutputReview, postHandoffRetry, postOutputDecision } from "./output-review-client.mjs";

type Failure = { ok: false; state: string; code: string };

async function guarded(fn: (cfg: ReturnType<typeof readBridgeConfig>) => Promise<unknown>): Promise<Record<string, unknown>> {
  noStore();
  if (!(await hasControlAccess())) return { ok: false, state: "unauthenticated", code: "unauthenticated" } satisfies Failure;
  const cfg = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
  if (!cfg.configured) return { ok: false, state: "not_configured", code: cfg.reason ?? "not_configured" } satisfies Failure;
  return (await fn(cfg)) as Record<string, unknown>;
}

export const readOutputReview = (recordId: string) => guarded((cfg) => fetchOutputReview(cfg, recordId));
export const decideOutput = (recordId: string, body: unknown, key: string) => guarded((cfg) => postOutputDecision(cfg, recordId, body, key));
export const retryOutputHandoff = (recordId: string, decisionId: string) => guarded((cfg) => postHandoffRetry(cfg, recordId, decisionId));
