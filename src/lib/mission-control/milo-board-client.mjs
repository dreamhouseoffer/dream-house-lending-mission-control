// Server-side signed read of the bridge's read-only GET /v0/milo-board (approved-queue supervisor state per exact record
// id). Never throws; never logs. The bridge already bounds and sanitises the payload; this re-checks the shape so a
// malformed answer is an explicit failure, never an empty board.
import { bridgeGet } from "./bridge-client.mjs";

export const MILO_BOARD_OP = "GET /v0/milo-board";
export const MILO_BOARD_SCHEMA = "mission-control.milo-board.v1";
export const MILO_BOARD_MAX_BYTES = 512 * 1024;
export const MILO_BOARD_TIMEOUT_MS = 20_000;

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// Same bounds as the bridge's lib/milo-board.js. Anything outside them fails the WHOLE board (explicit schema_mismatch),
// never an empty or partially trusted board. The result is rebuilt field by field; unknown keys are dropped.
export const MILO_BOARD_MAX_RECORDS = 200;
export const MILO_BOARD_MAX_LINKED = 20;
export const MILO_BOARD_MAX_SIGNALS = 50;
export const MILO_BOARD_MAX_REASON = 240;
const RECORD_RE = /^rec[A-Za-z0-9]{14}$/;
const VERSION_RE = /^[0-9a-f]{16}$/;
const DIGEST_RE = /^([0-9a-f]{12}|none)$/;
const TASK_RE = /^t_[0-9a-f]{6,32}$/;
const TOKEN_RE = /^[a-z0-9_-]{1,40}$/;
const CLASS_RE = /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const KINDS = ["dispatched", "draft_done", "needs_input", "request_only", "parked"];
const BLOCK_KINDS = ["dependency", "needs_input", "capability", "transient"];
const REASON_SOURCES = ["blocked_event", "failure_excerpt", "none"];
const LIVENESS = ["live", "not_live", "unverifiable"];
// Runner phase of a running linked task (reader: current-run claimed source_status, else latest ended outcome).
export const MILO_BOARD_PHASES = ["review", "implementation", "unknown"];
const PHASE_EVIDENCE = ["current_claim", "prior_outcome", "none"];
const SIGNAL_STATES = ["matches_snapshot", "acknowledged", "needs_fresh_read"];
const UNSAFE_REASON_RE = /[\u0000-\u001f\u007f]|:\/\/|(^|\s)[~.]{0,2}\/[^\s]/;

class Bad extends Error {}
const bad = () => { throw new Bad(); };
const re = (v, rx) => (typeof v === "string" && rx.test(v) ? v : bad());
const nullable = (v, f) => (v === null ? null : f(v));
const bool = (v) => (typeof v === "boolean" ? v : bad());
const iso = (v) => nullable(v, (x) => re(x, ISO_RE));
const code = (v) => (v === null || v === undefined ? null : re(v, TOKEN_RE));
const oneOf = (v, list) => (list.includes(v) ? v : bad());
const arr = (v, max) => (Array.isArray(v) && v.length <= max ? v : bad());

function blocker(b) {
  if (b === null || b === undefined) return null;
  if (!isObj(b)) bad();
  const source = oneOf(b.reason_source, REASON_SOURCES);
  const kind = b.kind === null ? null : oneOf(b.kind, BLOCK_KINDS);
  const reason = b.reason === null ? null
    : typeof b.reason === "string" && b.reason.length > 0 && b.reason.length <= MILO_BOARD_MAX_REASON && !UNSAFE_REASON_RE.test(b.reason) ? b.reason : bad();
  if ((reason === null) !== (source === "none")) bad();
  return { kind, reason, reason_source: source };
}

function phase(p, status) {
  // Running without phase evidence = explicit unknown (never assumed to be the author); non-running tasks carry none.
  if (p === null || p === undefined) return status === "running" ? { phase: "unknown", evidence: "none" } : null;
  if (!isObj(p) || status !== "running") bad();
  const out = { phase: oneOf(p.phase, MILO_BOARD_PHASES), evidence: oneOf(p.evidence, PHASE_EVIDENCE) };
  if ((out.phase === "unknown") !== (out.evidence === "none")) bad();
  return out;
}

function linked(t) {
  if (!isObj(t)) bad();
  const status = re(t.status, TOKEN_RE);
  return {
    task_id: re(t.task_id, TASK_RE), assignee: nullable(t.assignee ?? null, (x) => re(x, TOKEN_RE)), status, run: re(t.run, TOKEN_RE),
    liveness: t.liveness === null ? null : oneOf(t.liveness, LIVENESS), last_outcome: nullable(t.last_outcome ?? null, (x) => re(x, TOKEN_RE)),
    completed_at: t.completed_at === null ? null : Number.isSafeInteger(t.completed_at) && t.completed_at >= 0 ? t.completed_at : bad(),
    has_result: bool(t.has_result), has_attachments: bool(t.has_attachments), has_failure: bool(t.has_failure), blocker: blocker(t.blocker),
    phase: phase(t.phase, status),
  };
}

function disposition(d) {
  if (d === null) return null;
  if (!isObj(d)) bad();
  return { kind: oneOf(d.kind, KINDS), version: re(d.version, VERSION_RE), task: nullable(d.task, (x) => re(x, TASK_RE)),
    version_current: bool(d.version_current), observed_matches: d.observed_matches === null ? null : bool(d.observed_matches) };
}

function record(r) {
  if (!isObj(r)) bad();
  const out = {
    record_id: re(r.record_id, RECORD_RE), version: re(r.version, VERSION_RE), decision: re(r.decision, TOKEN_RE), status: re(r.status, TOKEN_RE),
    read_at: iso(r.read_at ?? null), read_source: oneOf(r.read_source, ["snapshot", "fresh_record"]), class: re(r.class, CLASS_RE),
    attention_task: nullable(r.attention_task ?? null, (x) => re(x, TASK_RE)), disposition: disposition(r.disposition ?? null),
    linked_digest: nullable(r.linked_digest ?? null, (x) => re(x, DIGEST_RE)), linked: arr(r.linked, MILO_BOARD_MAX_LINKED).map(linked),
    linked_truncated: r.linked_truncated === undefined ? false : bool(r.linked_truncated),
  };
  const ids = new Set(out.linked.map((t) => t.task_id));
  if (ids.size !== out.linked.length) bad();
  return out;
}

function part(v, states) {
  if (!isObj(v)) bad();
  return { state: oneOf(v.state, states), code: code(v.code) };
}

/** Strict shape check; returns a rebuilt board or null (caller reports schema_mismatch). */
export function checkMiloBoard(data) {
  try {
    if (!isObj(data) || data.schema !== MILO_BOARD_SCHEMA) return null;
    if (data.authority !== "read_only" || data.publication !== "never_published_by_reader") return null;
    const s = data.snapshot;
    const snapshot = { ...part(s, ["ok", "missing", "error"]), read_at: iso(s.read_at ?? null),
      count: s.count === null || s.count === undefined ? null : Number.isSafeInteger(s.count) && s.count >= 0 ? s.count : bad(),
      merged_records: arr(s.merged_records ?? [], MILO_BOARD_MAX_RECORDS).map((x) => re(x, RECORD_RE)) };
    const g = data.signals;
    const signals = { ...part(g, ["ok", "invalid"]), entries: arr(isObj(g) ? g.entries : null, MILO_BOARD_MAX_SIGNALS).map((e) => {
      if (!isObj(e)) bad();
      return { record_id: re(e.record_id, RECORD_RE), version: re(e.version, VERSION_RE), state: oneOf(e.state, SIGNAL_STATES) };
    }) };
    const records = arr(data.records, MILO_BOARD_MAX_RECORDS).map(record);
    if (new Set(records.map((r) => r.record_id)).size !== records.length) bad();
    const orphan_links = arr(data.orphan_links, MILO_BOARD_MAX_RECORDS).map((o) => {
      if (!isObj(o)) bad();
      return { record_id: re(o.record_id, RECORD_RE), task_ids: arr(o.task_ids, MILO_BOARD_MAX_LINKED).map((t) => re(t, TASK_RE)) };
    });
    return {
      schema: MILO_BOARD_SCHEMA, authority: "read_only", publication: "never_published_by_reader",
      snapshot, native: part(data.native, ["ok", "error"]), dispositions: part(data.dispositions, ["ok", "invalid"]), signals, records,
      records_truncated: data.records_truncated === undefined ? false : bool(data.records_truncated), orphan_links,
      supervisor_action: re(data.supervisor_action, TOKEN_RE), supervisor_action_record: nullable(data.supervisor_action_record ?? null, (x) => re(x, RECORD_RE)),
      fetched_at: re(data.fetched_at, ISO_RE),
    };
  } catch (e) {
    if (e instanceof Bad) return null;
    throw e;
  }
}

export async function fetchMiloBoard(config, options = {}) {
  const res = await bridgeGet(config, "/v0/milo-board", { maxBytes: MILO_BOARD_MAX_BYTES, timeoutMs: MILO_BOARD_TIMEOUT_MS, ...options });
  if (!res.ok) return res;
  const board = checkMiloBoard(res.data);
  return board ? { ok: true, board } : { ok: false, state: "bad_payload", code: "schema_mismatch" };
}
