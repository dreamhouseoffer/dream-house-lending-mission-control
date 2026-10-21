// Server-only Milo output-review wrapper over the signed private bridge. Import from route handlers only.
// Reads MC_BRIDGE_URL / MC_BRIDGE_SECRET at request time, never logs either value, never caches.
import { unstable_noStore as noStore } from "next/cache";
import { readBridgeConfig } from "./bridge-client.mjs";
import { hasControlAccess } from "./bridge";
import { fetchOutputReview, postHandoffRetry } from "./output-review-client.mjs";
import { guardOutputDecision } from "./output-decision-guard.mjs";
import { miloConfigFromEnv } from "./milo-approvals";

type Failure = { ok: false; state: string; code: string };

async function guarded(fn: (cfg: ReturnType<typeof readBridgeConfig>) => Promise<unknown>): Promise<Record<string, unknown>> {
  noStore();
  if (!(await hasControlAccess())) return { ok: false, state: "unauthenticated", code: "unauthenticated" } satisfies Failure;
  const cfg = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
  if (!cfg.configured) return { ok: false, state: "not_configured", code: cfg.reason ?? "not_configured" } satisfies Failure;
  return (await fn(cfg)) as Record<string, unknown>;
}

export const readOutputReview = (recordId: string) => guarded((cfg) => fetchOutputReview(cfg, recordId));
// Owner eligibility from this request's own reads (live card + version, supervisor board, exact output review) — never
// from the browser. See output-decision-guard.mjs: a validated blocked review is refused before sending; an unreadable
// input is unknown (the bridge is not called and a pending same-key retry is kept rather than released).
export const decideOutput = (recordId: string, body: { version_digest: string }, key: string) =>
  guarded((cfg) => guardOutputDecision({ bridge: cfg, milo: miloConfigFromEnv(), recordId, body, key }));
export const retryOutputHandoff = (recordId: string, decisionId: string) => guarded((cfg) => postHandoffRetry(cfg, recordId, decisionId));
