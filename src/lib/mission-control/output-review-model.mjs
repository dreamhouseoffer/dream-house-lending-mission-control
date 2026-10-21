// Milo output review: pure contract + helpers shared by the page and the server client. No imports, no I/O, never logs.
// The bridge is the authority (registered manifest + parent review + digests); this re-checks the shape so a malformed
// answer is an explicit failure, never a partially trusted draft.

export const OUTPUT_REVIEW_SCHEMA = "mission-control.output-review.v1";
export const OUTPUT_REVIEW_ACTION = "approve_draft_wording_internal";
export const OUTPUT_DECISIONS = ["approve", "revise", "reject"];
export const OUTPUT_MAX_BODY = 4096;
export const OUTPUT_MAX_NOTES = 2000;
export const OUTPUT_MIN_REVISE_NOTES = 15;
const MAX_DRAFT_CHARS = 512 * 1024;
const RECORD_RE = /^rec[A-Za-z0-9]{14}$/;
const TASK_RE = /^t_[0-9a-f]{6,32}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const ARTIFACT_RE = /^a[1-9][0-9]{0,9}$/;
export const DECISION_ID_RE = /^od_[0-9a-f]{24}$/;
const LABEL_RE = /^v[1-9][0-9]{0,3}$/;
const TOKEN_RE = /^[a-z0-9_-]{1,40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const OUTPUT_IDEM_RE = /^[A-Za-z0-9_-]{16,128}$/;
const COMPARISONS = ["exact_units", "partial_exact_units", "unavailable"];
const REVISION_STATES = ["handoff_unconfirmed", "produced", "missing", "queued", "revising", "running_unverified", "blocked", "returned", "archived", "unknown"];
const SOURCE_VERSION_RE = /^[0-9a-f]{8,64}$/;

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
class Bad extends Error {}
const bad = () => { throw new Bad(); };
const re = (v, rx) => (typeof v === "string" && rx.test(v) ? v : bad());
const str = (v, max) => (typeof v === "string" && v.length <= max ? v : bad());
const nstr = (v, max) => (v === null || v === undefined ? null : str(v, max));
const bool = (v) => (typeof v === "boolean" ? v : bad());
const arr = (v, max) => (Array.isArray(v) && v.length <= max ? v : bad());
const oneOf = (v, list) => (list.includes(v) ? v : bad());
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : bad());
const httpUrl = (v) => {
  const u = str(v, 2048);
  let p;
  try { p = new URL(u); } catch { bad(); }
  return p.protocol === "https:" || p.protocol === "http:" ? u : bad();
};

function receipt(r) {
  if (r === null || r === undefined) return null;
  if (!isObj(r)) bad();
  return {
    decision_id: re(r.decision_id, DECISION_ID_RE), decision: oneOf(r.decision, OUTPUT_DECISIONS), version_digest: re(r.version_digest, DIGEST_RE),
    version_label: r.version_label === null ? null : re(r.version_label, LABEL_RE), task_id: re(r.task_id, TASK_RE),
    manifest_artifact_id: re(r.manifest_artifact_id, ARTIFACT_RE), primary_sha256: r.primary_sha256 === null ? null : re(r.primary_sha256, DIGEST_RE),
    destinations_sha256: re(r.destinations_sha256, DIGEST_RE), action: oneOf(r.action, [OUTPUT_REVIEW_ACTION]), notes: nstr(r.notes, OUTPUT_MAX_NOTES),
    decided_at: re(r.decided_at, ISO_RE),
  };
}

function pair(p) {
  if (!isObj(p)) bad();
  return { part: nstr(p.part, 4), before_label: str(p.before_label, 200), before: str(p.before, 8000), after_label: str(p.after_label, 200), after: str(p.after, 8000) };
}

function unit(u) {
  if (!isObj(u)) bad();
  return { id: nstr(u.id, 16), title: str(u.title, 200), context: nstr(u.context, 1200), pairs: arr(u.pairs, 50).map(pair),
    extra: arr(u.extra ?? [], 50).map((x) => (isObj(x) ? { label: str(x.label, 200), text: str(x.text, 8000) } : bad())) };
}

function version(v) {
  if (v === null) return null;
  if (!isObj(v)) bad();
  const primary = v.primary === null ? null : isObj(v.primary) ? {
    artifact_id: re(v.primary.artifact_id, ARTIFACT_RE), name: str(v.primary.name, 255), sha256: re(v.primary.sha256, DIGEST_RE), size: nat(v.primary.size),
    text: str(v.primary.text, MAX_DRAFT_CHARS), selection: re(v.primary.selection, TOKEN_RE) } : bad();
  const review = v.review === null ? null : isObj(v.review) ? {
    reviewer: nstr(v.review.reviewer, 100), reviewed_at: nstr(v.review.reviewed_at, 64), decision: nstr(v.review.decision, 300),
    accepted: bool(v.review.accepted),
    publication_authorized: v.review.publication_authorized === false ? false : v.review.publication_authorized === true ? true : null,
    covers_all_declared: bool(v.review.covers_all_declared),
    source_id: v.review.source_id === null || v.review.source_id === undefined ? null : re(v.review.source_id, RECORD_RE),
    source_version: v.review.source_version === null || v.review.source_version === undefined ? null : re(v.review.source_version, SOURCE_VERSION_RE) } : bad();
  return {
    version_label: re(v.version_label, LABEL_RE), version_digest: re(v.version_digest, DIGEST_RE), task_id: re(v.task_id, TASK_RE),
    task_title: str(v.task_title, 200), native_status: re(v.native_status, TOKEN_RE), is_revision: bool(v.is_revision),
    manifest_artifact_id: re(v.manifest_artifact_id, ARTIFACT_RE), reviewable: bool(v.reviewable),
    not_reviewable: v.reviewable === true ? null : re(v.not_reviewable, TOKEN_RE), review, primary,
    units: arr(v.units, 80).map(unit), unparsed_units: arr(v.unparsed_units, 80).map((x) => str(x, 200)),
    comparison: oneOf(v.comparison, COMPARISONS),
    destinations: arr(v.destinations, 20).map((d) => (isObj(d) ? { url: httpUrl(d.url), label: str(d.label, 40) } : bad())),
    destinations_sha256: re(v.destinations_sha256, DIGEST_RE), action: oneOf(v.action, [OUTPUT_REVIEW_ACTION]),
    files: arr(v.files, 50).map((f) => (isObj(f) ? { artifact_id: re(f.artifact_id, ARTIFACT_RE), name: str(f.name, 255),
      sha256: f.sha256 === null ? null : re(f.sha256, DIGEST_RE), size: nat(f.size), role: oneOf(f.role, ["shown_draft", "supporting"]) } : bad())),
    decision: receipt(v.decision),
  };
}

function revision(r) {
  if (r === null || r === undefined) return null;
  if (!isObj(r)) bad();
  return { state: oneOf(r.state, REVISION_STATES), label: str(r.label, 240), native_status: r.native_status === null ? null : re(r.native_status, TOKEN_RE),
    requested_against_version: re(r.requested_against_version, DIGEST_RE), requested_against_label: r.requested_against_label === null ? null : re(r.requested_against_label, LABEL_RE),
    source_task_id: re(r.source_task_id, TASK_RE), revision_task_id: r.revision_task_id === null ? null : re(r.revision_task_id, TASK_RE),
    attempts: nat(r.attempts), requested_at: re(r.requested_at, ISO_RE), run_id: r.run_id === null || r.run_id === undefined ? null : nat(r.run_id) };
}

const nextStep = (n) => (isObj(n) ? { owner_needed: bool(n.owner_needed), text: str(n.text, 400) } : bad());

/** Strict rebuild of GET /v0/output-reviews/:record_id. Returns null for anything outside the contract. */
export function checkOutputReview(d) {
  try {
    if (!isObj(d) || d.schema !== OUTPUT_REVIEW_SCHEMA) bad();
    const c = isObj(d.controls) ? d.controls : bad();
    const state = oneOf(d.state, ["ok", "none", "blocked"]);
    const blocked = d.blocked === null || d.blocked === undefined ? null
      : isObj(d.blocked) ? { code: re(d.blocked.code, TOKEN_RE), task_id: d.blocked.task_id === null ? null : re(d.blocked.task_id, TASK_RE) } : bad();
    if ((state === "blocked") !== (blocked !== null)) bad();
    const gate = c.decide_unavailable === null ? null : re(c.decide_unavailable, TOKEN_RE);
    // Decision controls are never trusted on their own: any reason not to decide (or a blocked/missing current) disables them all.
    const open = gate === null && state === "ok" && d.current !== null;
    // schema is carried so the server-checked review (route JSON) re-checks in the page: the check must be idempotent.
    return {
      schema: OUTPUT_REVIEW_SCHEMA, record_id: re(d.record_id, RECORD_RE), state, blocked,
      linked_tasks: arr(d.linked_tasks, 20).map((t) => (isObj(t) ? { task_id: re(t.task_id, TASK_RE), native_status: re(t.native_status, TOKEN_RE) } : bad())),
      current: version(d.current),
      previous: arr(d.previous, 20).map((p) => (isObj(p) ? { version_label: re(p.version_label, LABEL_RE), version_digest: re(p.version_digest, DIGEST_RE),
        task_id: re(p.task_id, TASK_RE), is_revision: bool(p.is_revision), primary_sha256: p.primary_sha256 === null ? null : re(p.primary_sha256, DIGEST_RE),
        decision: receipt(p.decision) } : bad())),
      revision: revision(d.revision), next_step: nextStep(d.next_step),
      history: arr(d.history, 50).map(receipt),
      problems: arr(d.problems, 20).map((p) => (isObj(p) ? { task_id: re(p.task_id, TASK_RE), code: re(p.code, TOKEN_RE) } : bad())),
      controls: { decide_unavailable: gate, approve: open && bool(c.approve), reject: open && bool(c.reject), revise: open && bool(c.revise),
        revise_unavailable: nstr(c.revise_unavailable, 240) },
      boundary: str(d.boundary, 600),
      observed_at: d.observed_at === undefined || d.observed_at === null ? null : re(d.observed_at, ISO_RE),
    };
  } catch (e) {
    if (e instanceof Bad) return null;
    throw e;
  }
}

export const isRecordId = (v) => typeof v === "string" && RECORD_RE.test(v);

/** Revise notes rule (same as the bridge): enough characters, three real words, not one repeated character. */
export function meaningfulNotes(t) {
  const s = String(t || "").trim();
  if (s.length < OUTPUT_MIN_REVISE_NOTES || s.length > OUTPUT_MAX_NOTES) return false;
  return s.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length >= 3 && new Set(s.replace(/\s/g, "").toLowerCase()).size >= 5;
}

/**
 * The exact decision body for the version the owner is looking at. Every binding field comes from the shown version,
 * never from free input; only `decision` and `notes` are the owner's.
 * @returns {{ ok: true, body: Record<string, unknown> } | { ok: false, code: string }}
 */
export function decisionBody(current, decision, notes) {
  if (!current || !OUTPUT_DECISIONS.includes(decision)) return { ok: false, code: "invalid_input" };
  if (!current.reviewable) return { ok: false, code: "not_parent_reviewed" };
  if (!current.primary) return { ok: false, code: "not_parent_reviewed" };
  const n = String(notes ?? "").replace(/\r\n?/g, "\n").trim();
  if (n.length > OUTPUT_MAX_NOTES) return { ok: false, code: "notes_too_long" };
  if (decision === "revise" && !meaningfulNotes(n)) return { ok: false, code: "revision_notes_required" };
  return { ok: true, body: { decision, task_id: current.task_id, version_digest: current.version_digest, manifest_artifact_id: current.manifest_artifact_id,
    primary_sha256: current.primary ? current.primary.sha256 : null, destinations_sha256: current.destinations_sha256, action: OUTPUT_REVIEW_ACTION, notes: n } };
}

/** Strict re-validation of a browser decision body (route handler). Returns the canonical body or null. */
export function validateDecisionBody(j) {
  const keys = ["decision", "task_id", "version_digest", "manifest_artifact_id", "primary_sha256", "destinations_sha256", "action", "notes"];
  if (!isObj(j) || Object.keys(j).length !== keys.length || !keys.every((k) => Object.hasOwn(j, k))) return null;
  if (!OUTPUT_DECISIONS.includes(j.decision) || typeof j.task_id !== "string" || !TASK_RE.test(j.task_id)) return null;
  if (typeof j.version_digest !== "string" || !DIGEST_RE.test(j.version_digest) || typeof j.destinations_sha256 !== "string" || !DIGEST_RE.test(j.destinations_sha256)) return null;
  if (j.primary_sha256 !== null && (typeof j.primary_sha256 !== "string" || !DIGEST_RE.test(j.primary_sha256))) return null;
  if (typeof j.manifest_artifact_id !== "string" || !ARTIFACT_RE.test(j.manifest_artifact_id) || j.action !== OUTPUT_REVIEW_ACTION) return null;
  if (typeof j.notes !== "string" || j.notes.length > OUTPUT_MAX_NOTES) return null;
  return Object.fromEntries(keys.map((k) => [k, j[k]]));
}

const OUTCOME_COPY = {
  stale_version: "A newer draft version exists. Refresh and review the current draft — nothing was saved.",
  unknown_version: "This draft version is no longer registered. Refresh — nothing was saved.",
  draft_changed: "The draft bytes changed since you opened it. Refresh and re-read — nothing was saved.",
  destinations_changed: "The draft's destinations changed since you opened it. Refresh and re-read — nothing was saved.",
  not_parent_reviewed: "Hermie has not parent-reviewed every file of this version yet — nothing was saved.",
  already_decided: "A decision is already recorded for this exact version.",
  revision_in_progress: "A revision is already in progress for this card.",
  revision_handoff_disabled: "Revision handoff is not enabled on this bridge — nothing was saved.",
  revision_notes_required: "A revision needs specific notes (at least a short sentence).",
  idempotency_conflict: "This retry does not match the original request. Refresh and decide again.",
  no_registered_output: "No registered output exists for this card.",
  current_output_invalid: "The newest registered output is incomplete or its files changed. Nothing is decidable until Hermie re-registers it — nothing was saved.",
  revision_output_invalid: "The revision's registered output is incomplete or changed. Nothing is decidable until Hermie fixes it — nothing was saved.",
  too_many_linked_tasks: "Too many native tasks are linked to this card to identify the current output safely — nothing was saved.",
  output_blocked: "This draft is blocked (its registered files changed or are incomplete) — nothing was sent or saved. Hermie re-registers it before it reaches you.",
  not_owner_eligible: "This draft is not in Your Review right now (Hermie owns the next step for this card) — nothing was saved. Refresh the board.",
};
export const outcomeMessage = (code) => OUTCOME_COPY[code] || `Not saved (${code}).`;
/** Codes where resending the SAME request (same key) is the right recovery: the outcome is unknown. */
export const isUnknownOutcome = (code) => ["unreachable", "timeout", "busy", "bad_payload", "network", "http_5xx", "unavailable"].includes(code);

export const errOf = (d) => (isObj(d) && typeof d.error === "string" && /^[a-z_]{1,40}$/.test(d.error) ? d.error : "bad_payload");

export function settleDecision(status, d) {
  if ((status === 200 || status === 201) && isObj(d)) {
    try {
      return { outcome: status === 201 ? "saved" : "replayed", receipt: receipt(d.receipt) ?? bad(), revision: revision(d.revision), next_step: nextStep(d.next_step) };
    } catch (e) { if (!(e instanceof Bad)) throw e; return { outcome: "unknown", code: "bad_payload" }; }
  }
  if ([400, 404, 409, 413, 415, 503].includes(status)) {
    let prior = null;
    try { prior = isObj(d) ? receipt(d.receipt) : null; } catch { prior = null; }
    return { outcome: "refused", code: errOf(d), receipt: prior };
  }
  return { outcome: "unknown", code: "bad_payload" };
}

/** Pure reading of POST /v0/output-reviews/:record_id/handoff-retry. */
export function settleHandoffRetry(status, d) {
  if (status !== 200) return { outcome: "refused", code: errOf(d) };
  try { return { outcome: "saved", receipt: receipt(isObj(d) ? d.receipt : null) ?? bad(), revision: revision(d.revision) }; } catch (e) {
    if (!(e instanceof Bad)) throw e;
    return { outcome: "unknown", code: "bad_payload" };
  }
}
