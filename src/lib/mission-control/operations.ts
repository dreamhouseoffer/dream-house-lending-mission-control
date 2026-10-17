// Server-only Next wrapper for the bridge operations read (profiles + schedules). Import from route handlers or server
// components only. Reads MC_BRIDGE_URL / MC_BRIDGE_SECRET at request time, never logs them, never caches.
import { unstable_noStore as noStore } from "next/cache";
import { readBridgeConfig } from "./bridge-client.mjs";
import { hasControlAccess, type BridgeResult } from "./bridge";
import { fetchOperations } from "./operations-client.mjs";

// null = the bridge could not determine the value; it is shown as unknown, never coerced to true/false.
export type OpsProfile = { id: string; name: string; configured: boolean | null; activity: "unverified"; role: string | null };
export type OpsSchedule = {
  id: string;
  name: string | null;
  schedule: string | null;
  enabled: boolean | null;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
  has_error: boolean | null;
};
export type OpsSource = { available: boolean; updatedAt: string | null };
export type Operations = {
  observedAt: string;
  profiles: OpsProfile[] | null;
  schedules: OpsSchedule[] | null;
  sources: { profiles: OpsSource; schedules: OpsSource };
};

export async function readOperations(): Promise<BridgeResult<Operations>> {
  noStore();
  const config = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
  if (!config.configured) return { ok: false, state: "not_configured", code: config.reason ?? "not_configured" };
  if (!(await hasControlAccess())) return { ok: false, state: "unauthenticated", code: "unauthenticated" };
  return (await fetchOperations(config)) as BridgeResult<Operations>;
}
