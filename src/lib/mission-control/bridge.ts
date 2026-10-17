// Server-only Next wrapper around the generic bridge client. Import from route handlers or server components only.
// Reads MC_BRIDGE_URL / MC_BRIDGE_SECRET at request time (server env only, never browser-exposed), never logs either value, and never caches.
import { unstable_noStore as noStore } from "next/cache";
import { hasHeadquartersAccess } from "@/lib/headquarters/guard";
import {
  TASK_ID_RE,
  bridgeGet,
  checkCapabilities,
  checkRunList,
  checkTaskDetail,
  checkTaskList,
  readBridgeConfig,
} from "./bridge-client.mjs";

export type BridgeFailure = { ok: false; state: string; code: string };
export type BridgeOk<T> = { ok: true } & T;
export type BridgeResult<T> = BridgeOk<T> | BridgeFailure;

export type BridgeTask = {
  id: string;
  title?: string | null;
  body?: string | null;
  assignee?: string | null;
  status: string;
  bucket: string | null;
  verified: boolean;
  ui: { state: string; reason: string; native_status: string | null; latest_run_outcome: string | null };
  [key: string]: unknown;
};
export type BridgeRun = Record<string, string | number | boolean | null>;
export type TaskList = { tasks: BridgeTask[]; observedAt: string };
export type TaskDetail = { task: BridgeTask; runs: BridgeRun[]; events: BridgeRun[]; latestSummary: string | null; observedAt: string };
export type RunList = { taskId: string; runs: BridgeRun[]; observedAt: string };
export type Capabilities = { ops: string[]; unsupported: Record<string, string>; readOnly: boolean };

export async function hasControlAccess(): Promise<boolean> {
  return hasHeadquartersAccess();
}

async function read<T>(target: string, check: (data: unknown) => T | null): Promise<BridgeResult<T>> {
  noStore();
  const config = readBridgeConfig({ url: process.env.MC_BRIDGE_URL, secret: process.env.MC_BRIDGE_SECRET });
  if (!config.configured) return { ok: false, state: "not_configured", code: config.reason ?? "not_configured" };
  if (!(await hasControlAccess())) return { ok: false, state: "unauthenticated", code: "unauthenticated" };
  const res = (await bridgeGet(config, target)) as { ok: true; data: unknown } | BridgeFailure;
  if (!res.ok) return res;
  const value = check(res.data);
  return value ? ({ ok: true, ...value } as BridgeOk<T>) : { ok: false, state: "bad_payload", code: "schema_mismatch" };
}

export function isTaskId(id: unknown): id is string {
  return typeof id === "string" && TASK_ID_RE.test(id);
}

export function readTasks() {
  return read<TaskList>("/v0/tasks", (d) => checkTaskList(d) as TaskList | null);
}

export function readTask(id: string) {
  if (!isTaskId(id)) return Promise.resolve<BridgeResult<TaskDetail>>({ ok: false, state: "not_found", code: "invalid_task_id" });
  return read<TaskDetail>(`/v0/tasks/${id}`, (d) => checkTaskDetail(d) as TaskDetail | null);
}

export function readTaskRuns(id: string) {
  if (!isTaskId(id)) return Promise.resolve<BridgeResult<RunList>>({ ok: false, state: "not_found", code: "invalid_task_id" });
  return read<RunList>(`/v0/tasks/${id}/runs`, (d) => checkRunList(d, id) as RunList | null);
}

export function readCapabilities() {
  return read<Capabilities>("/v0/capabilities", (d) => checkCapabilities(d) as Capabilities | null);
}

const HTTP_FOR: Record<string, number> = {
  unauthenticated: 401,
  not_found: 404,
  not_configured: 503,
  offline: 503,
  hermes_unavailable: 503,
  unauthorized: 502,
  bad_payload: 502,
  error: 502,
};

export function failureHttpStatus(state: string): number {
  return HTTP_FOR[state] ?? 502;
}
