// Strict, bounded reader for the bridge's protected GET /v0/operations (configured Hermes profiles + cron schedules).
// Server-only: it goes through the signed bridge client. Framework-neutral so the parser can be tested directly.
// Fails closed: one malformed record rejects the whole payload, unknowns stay null, and a source the bridge reports
// unavailable is returned as null (unknown), never as an empty healthy list.
import { bridgeGet, failureCopy, formatTime, observationState } from "./bridge-client.mjs";

export const OPERATIONS_TARGET = "/v0/operations";
export const OPERATIONS_MAX_BYTES = 256 * 1024;
export const MAX_PROFILES = 100;
export const MAX_SCHEDULES = 200;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// Exactly the bridge's native cron job id rule (lib/operations.js JOB_ID_RE); a leading "_" or "-" is valid there.
const SCHEDULE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const MAX_NAME = 200;

// The bridge reports null when it could not determine a flag; that stays null (unknown), never true/false.
const flag = (v) => (typeof v === "boolean" || v === null ? v : NO);

// Native task assignees that are execution lanes of Mission Control itself, not Hermes agent profiles.
export const CONTROL_LANES = {
  "mc-runner": "Mission Control execution lane. Runs dashboard-submitted tasks; it is not an agent profile.",
};

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const NO = Symbol("invalid");

function text(v, max, { nullable = false } = {}) {
  if (v === null && nullable) return null;
  if (typeof v !== "string") return NO;
  const s = v.trim();
  if (!s || s.length > max || CONTROL_RE.test(s)) return nullable && !s ? null : NO;
  return s;
}

function iso(v, { nullable = true } = {}) {
  if (v === null && nullable) return null;
  return typeof v === "string" && v.length <= 64 && Number.isFinite(Date.parse(v)) ? v : NO;
}

function checkProfile(p) {
  if (!isObj(p)) return null;
  const id = typeof p.id === "string" && ID_RE.test(p.id) ? p.id : NO;
  const name = text(p.name, MAX_NAME);
  const role = text(p.role, 120, { nullable: true });
  const configured = flag(p.configured);
  // The contract never asserts liveness; any other activity claim is not trusted.
  if ([id, name, role, configured].includes(NO) || p.activity !== "unverified") return null;
  return { id, name, configured, activity: "unverified", role };
}

function checkSchedule(s) {
  if (!isObj(s)) return null;
  const out = {
    id: typeof s.id === "string" && SCHEDULE_ID_RE.test(s.id) ? s.id : NO,
    name: text(s.name, MAX_NAME, { nullable: true }),
    schedule: text(s.schedule, MAX_NAME, { nullable: true }),
    enabled: flag(s.enabled),
    last_run_at: iso(s.last_run_at),
    last_status: text(s.last_status, 64, { nullable: true }),
    next_run_at: iso(s.next_run_at),
    has_error: flag(s.has_error),
  };
  return Object.values(out).includes(NO) ? null : out;
}

function checkSource(src) {
  if (!isObj(src) || typeof src.available !== "boolean") return null;
  const updatedAt = iso(src.updated_at);
  return updatedAt === NO ? null : { available: src.available, updatedAt };
}

/** Validate a list; null when the source is unavailable, NO when malformed. */
function checkList(raw, source, max, checkItem) {
  if (!source.available) return raw === null || Array.isArray(raw) ? null : NO;
  if (!Array.isArray(raw) || raw.length > max) return NO;
  const seen = new Set();
  const items = [];
  for (const r of raw) {
    const item = checkItem(r);
    if (!item || seen.has(item.id)) return NO;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

/**
 * @returns {{ observedAt: string, profiles: any[] | null, schedules: any[] | null,
 *   sources: { profiles: { available: boolean, updatedAt: string | null }, schedules: { available: boolean, updatedAt: string | null } } } | null}
 */
export function checkOperations(data) {
  if (!isObj(data) || !isObj(data.sources)) return null;
  const observedAt = iso(data.observed_at, { nullable: false });
  const sources = { profiles: checkSource(data.sources.profiles), schedules: checkSource(data.sources.schedules) };
  if (observedAt === NO || !sources.profiles || !sources.schedules) return null;
  const profiles = checkList(data.profiles, sources.profiles, MAX_PROFILES, checkProfile);
  const schedules = checkList(data.schedules, sources.schedules, MAX_SCHEDULES, checkSchedule);
  if (profiles === NO || schedules === NO) return null;
  return { observedAt, profiles, schedules, sources };
}

/** Signed, bounded GET of the fixed operations path. Never throws. */
export async function fetchOperations(config, options = {}) {
  const res = await bridgeGet(config, OPERATIONS_TARGET, { maxBytes: OPERATIONS_MAX_BYTES, ...options });
  if (!res.ok) return res;
  const value = checkOperations(res.data);
  return value ? { ok: true, ...value } : { ok: false, state: "bad_payload", code: "schema_mismatch" };
}

// ---- view helpers -----------------------------------------------------------------------------------------

const OPEN_BUCKETS = new Set(["queued", "running", "waiting_approval", "blocked"]);

/**
 * Join configured profiles with real native task assignments. Control lanes (mc-runner) are never agents.
 * Task counts are null (unknown) when the task read failed.
 * @param {any[]} profiles
 * @param {any[] | null} tasks
 */
export function agentView(profiles, tasks) {
  const counts = new Map();
  for (const t of tasks ?? []) {
    if (typeof t.assignee !== "string" || !t.assignee) continue;
    const c = counts.get(t.assignee) ?? { open: 0, total: 0 };
    c.total += 1;
    if (OPEN_BUCKETS.has(t.bucket)) c.open += 1;
    counts.set(t.assignee, c);
  }
  const tally = (key) => (tasks ? counts.get(key) ?? { open: 0, total: 0 } : null);
  const agents = profiles.filter((p) => !(p.id in CONTROL_LANES)).map((p) => ({ ...p, tasks: tally(p.id) }));
  const known = new Set(agents.map((a) => a.id));
  const lanes = Object.entries(CONTROL_LANES).map(([id, detail]) => ({ id, detail, tasks: tally(id) }));
  const unmatched = tasks ? [...counts.keys()].filter((k) => !known.has(k) && !(k in CONTROL_LANES)).sort() : [];
  return { agents, lanes, unmatched };
}

export const UNNAMED_SCHEDULE = "Unnamed (name not recorded)";

/**
 * Snapshot status ids (SCHEDULE_FILTERS) plus "unknown", sourced from the scheduler's own report. An explicit
 * disabled or error report is shown as such; otherwise an unreported enabled/error flag is "unknown", never healthy.
 */
export function liveScheduleRows(schedules) {
  return schedules.map((s) => ({
    id: s.id,
    name: s.name ?? UNNAMED_SCHEDULE,
    enabled: s.enabled,
    schedule: s.schedule,
    lastRunAt: s.last_run_at,
    lastStatus: s.last_status,
    nextRunAt: s.next_run_at,
    hasError: s.has_error,
    status:
      s.enabled === false ? "disabled"
      : s.has_error === true ? "erroring"
      : s.enabled === null || s.has_error === null ? "unknown"
      : s.last_run_at ? "ran" : "never_run",
  }));
}

const FAILURE_SOURCE_STATE = { not_configured: "not_connected", unauthenticated: "not_connected", offline: "offline" };

/**
 * Source descriptors for Agents / Workflows / Settings. "Read via bridge" only after a checked read and only for a
 * source the bridge reports available; never "Live", and an unavailable source is "Not verified", not healthy.
 * @param {"profiles" | "schedules"} key
 */
export function operationsSource(result, key, now = Date.now()) {
  const label = key === "profiles" ? "Hermes profiles (configured)" : "Hermes cron schedules";
  if (!result.ok) return { label, state: FAILURE_SOURCE_STATE[result.state] ?? "unverified", detail: failureCopy(result.state).body };
  const src = result.sources[key];
  if (!src.available) {
    return { label, state: "unverified", detail: `Bridge answered at ${formatTime(result.observedAt)} but reports this source unavailable. Values are unknown, not zero.` };
  }
  const updated = src.updatedAt ? ` Source last updated ${formatTime(src.updatedAt)}.` : " Source update time not reported.";
  return {
    label,
    state: observationState(result.observedAt, now),
    detail: `Bridge read this at ${formatTime(result.observedAt)}.${updated} This is a configuration observation, not a runtime heartbeat.`,
  };
}
