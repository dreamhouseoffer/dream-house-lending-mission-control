// Framework-neutral rules for dashboard task submission. Pure and browser-safe (no node: imports, no env, no I/O):
// the BFF route uses it to enforce the contract and the client form uses the same limits and outcome copy.
// The browser only ever chooses a server-advertised template id, a short title and an idempotency key. The task
// body and assignee are always derived on the server from the bridge's current capabilities.

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
export const TEMPLATE_ID_RE = /^[a-z][a-z0-9_]{1,63}$/;
export const ASSIGNEE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const MAX_TITLE = 200;
export const MAX_TEMPLATE_BODY = 8000;
export const MAX_TEMPLATES = 20;
export const MAX_CREATE_REQUEST_BYTES = 2048;
export const CREATE_FIELDS = ["template_id", "title"];

// Same control-character rules as the bridge's own parser, restated independently.
const CTRL_TITLE = /[\u0000-\u001f\u007f]/;
const CTRL_BODY = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const boundedText = (v, max) => (typeof v === "string" && v.trim() && v.length <= max && !CTRL_TITLE.test(v) ? v.trim() : null);

/**
 * Strictly read the bridge's `task_templates`. A malformed entry is dropped (never repaired); duplicate ids drop
 * every copy so an ambiguous id can never be submitted. Missing or non-array input means no templates.
 * @returns {{ id: string, label: string, description: string, body: string, assignee: string }[]}
 */
export function checkTemplates(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Map();
  for (const t of raw.slice(0, MAX_TEMPLATES)) {
    if (!isObj(t)) continue;
    const keys = Object.keys(t);
    if (keys.length !== 5 || !["id", "label", "description", "body", "assignee"].every((k) => keys.includes(k))) continue;
    if (typeof t.id !== "string" || !TEMPLATE_ID_RE.test(t.id)) continue;
    if (typeof t.assignee !== "string" || !ASSIGNEE_RE.test(t.assignee)) continue;
    if (typeof t.body !== "string" || !t.body.trim() || t.body.length > MAX_TEMPLATE_BODY || CTRL_BODY.test(t.body)) continue;
    const label = boundedText(t.label, 80);
    const description = boundedText(t.description, 500);
    if (!label || !description) continue;
    seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
    out.push({ id: t.id, label, description, body: t.body, assignee: t.assignee });
  }
  return out.filter((t) => seen.get(t.id) === 1);
}

/** Browser-safe projection: the fixed body never leaves the server. */
export function publicTemplates(templates) {
  return (templates ?? []).map(({ id, label, description, assignee }) => ({ id, label, description, assignee }));
}

/**
 * Whether the dashboard may submit, with an exact reason when it may not. Fails closed on every missing piece.
 * @param {{ ops: string[], unsupported: Record<string, string>, readOnly: boolean, templates?: unknown[], assignees?: string[] | null } | null} caps
 */
export function createCapability(caps) {
  if (!caps) return { enabled: false, reason: "Bridge capabilities could not be read, so task creation is unavailable.", templates: [] };
  if (caps.readOnly !== false || !caps.ops.includes("POST /v0/tasks")) {
    return { enabled: false, reason: `The bridge reports task creation is disabled (${caps.unsupported["task.create"] ?? "read-only"}).`, templates: [] };
  }
  const templates = Array.isArray(caps.templates) ? caps.templates : [];
  const usable = caps.assignees ? templates.filter((t) => caps.assignees.includes(t.assignee)) : templates;
  if (usable.length === 0) {
    return {
      enabled: false,
      reason: "The bridge accepts tasks but advertises no safe task templates, so there is nothing the dashboard is allowed to submit.",
      templates: [],
    };
  }
  return { enabled: true, reason: null, templates: usable };
}

/**
 * Strict create request check. `input` is the parsed browser JSON, `key` the Idempotency-Key header and `templates`
 * the server-derived usable templates. Returns { ok: true, payload, key, template } with payload exactly
 * {title, body, assignee}, or { ok: false, code, field? }.
 */
export function validateCreateRequest(input, key, templates) {
  if (typeof key !== "string" || !IDEMPOTENCY_KEY_RE.test(key)) return { ok: false, code: "idempotency_key_required", field: "idempotency_key" };
  if (!isObj(input)) return { ok: false, code: "invalid_input" };
  const keys = Object.keys(input);
  if (keys.length !== CREATE_FIELDS.length || !CREATE_FIELDS.every((k) => keys.includes(k))) return { ok: false, code: "unexpected_fields" };
  if (typeof input.template_id !== "string" || !TEMPLATE_ID_RE.test(input.template_id)) return { ok: false, code: "unknown_template", field: "template_id" };
  const template = (templates ?? []).find((t) => t.id === input.template_id);
  if (!template) return { ok: false, code: "unknown_template", field: "template_id" };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > MAX_TITLE || CTRL_TITLE.test(title)) return { ok: false, code: "invalid_title", field: "title" };
  return { ok: true, key, template, payload: { title, body: template.body, assignee: template.assignee } };
}

/**
 * Explicit same-origin rule for task creation, stricter than the logout check: Origin MUST be present and equal to
 * this request's own origin, and a present Sec-Fetch-Site must be same-origin. Pure; never logs.
 */
export function isSameOriginMutation(headers, requestUrl) {
  let self;
  try {
    self = new URL(requestUrl).origin;
  } catch {
    return false;
  }
  const origin = headers?.get("origin");
  if (origin == null || origin !== self) return false;
  const site = headers?.get("sec-fetch-site");
  return site == null || site === "same-origin";
}

/** Fingerprint of what the browser is about to submit. A changed fingerprint always gets a fresh idempotency key. */
export function submissionFingerprint({ templateId, title }) {
  return JSON.stringify([String(templateId ?? ""), String(title ?? "").trim()]);
}

/**
 * Outcome vocabulary shared by the BFF and the form. `retry` says what is safe next:
 *   same_key   — resend exactly this submission with the same key (bridge dedupes; never a second task)
 *   new_key    — the request definitely did not create anything; editing or resubmitting uses a fresh key
 *   check_first — creation may have happened; only an explicit, acknowledged new submission is allowed
 *   none       — nothing to retry
 */
export const OUTCOMES = {
  accepted: { http: 202, retry: "none", title: "Accepted by the Mac bridge", next: "Opening the task. Status and results come from the Hermes board, not from this form." },
  rejected: { http: 400, retry: "new_key", title: "The request was rejected before anything was created", next: "Fix the highlighted field and submit again." },
  unavailable: { http: 503, retry: "new_key", title: "Task creation is unavailable", next: "Nothing was submitted. Check Settings → Connections, then reload this page." },
  conflict: {
    http: 409,
    retry: "new_key",
    title: "This submission key was already used for a different request",
    next: "Nothing new was created. Start a fresh submission to send the current values.",
  },
  ambiguous: {
    http: 409,
    retry: "check_first",
    title: "Creation could not be confirmed",
    next: "A task may already exist. Check the task list (including archived tasks) for this title before submitting again as a new request.",
  },
  unconfirmed: {
    http: 504,
    retry: "same_key",
    title: "No confirmation received",
    next: "The bridge may or may not have received it. Retrying sends the same submission key, so the bridge returns the existing task instead of creating a second one.",
  },
};

export function outcomeCopy(outcome) {
  return OUTCOMES[outcome] ?? OUTCOMES.ambiguous;
}

// Same shape as the bridge client's task id rule, restated so this module stays browser-safe.
export const SUBMITTED_TASK_ID_RE = /^t_[0-9a-f]{6,32}$/;
const DEFINITE = new Set(["rejected", "unavailable", "conflict"]);

/**
 * Classify one POST /api/control/tasks response (or `network: true` when fetch threw). Only HTTP 202 `accepted` with a
 * valid task id is success; 401/403/rejected/unavailable/conflict are definite failures OF THIS REQUEST; ambiguous stays
 * ambiguous; anything else (unparseable body, unknown outcome, accepted without a valid task id) is unconfirmed.
 * @returns {{ outcome: string, definite: boolean, task_id?: string, deduplicated?: boolean, code?: string, data?: any }}
 */
export function classifySubmitResponse({ status, data, network = false }) {
  if (network) return { outcome: "unconfirmed", definite: false, code: "network" };
  if (status === 401) return { outcome: "unavailable", definite: true, code: "session_ended" };
  if (status === 403) return { outcome: "unavailable", definite: true, code: "request_blocked" };
  if (!isObj(data) || typeof data.outcome !== "string") return { outcome: "unconfirmed", definite: false, code: `http_${status}` };
  if (data.outcome === "accepted") {
    // The BFF answers every acceptance (deduplicated included) with OUTCOMES.accepted.http; any other status means the
    // body cannot be trusted as confirmation (e.g. a proxy/500 echoing an accepted-looking payload).
    if (status !== OUTCOMES.accepted.http) return { outcome: "unconfirmed", definite: false, code: `accepted_with_http_${status}` };
    if (typeof data.task_id === "string" && SUBMITTED_TASK_ID_RE.test(data.task_id)) {
      return { outcome: "accepted", definite: true, task_id: data.task_id, deduplicated: data.deduplicated === true, data };
    }
    return { outcome: "unconfirmed", definite: false, code: "accepted_without_task_id" };
  }
  if (data.outcome === "ambiguous") return { outcome: "ambiguous", definite: false, data };
  if (DEFINITE.has(data.outcome)) return { outcome: data.outcome, definite: true, data };
  return { outcome: "unconfirmed", definite: false, code: "unknown_outcome" };
}

/**
 * Pending submission state machine shared by the form and its tests. A pending record is
 * { key, fp, templateId, title, uncertain } where `uncertain` means some attempt with this key may have created a task.
 * Uncertainty is sticky: once set it survives every later error (a retry failing with 401/403/unavailable/rejected/
 * conflict says nothing about the earlier unknown attempt) and refreshes, and is only cleared by a confirmed
 * acceptance or by the owner explicitly acknowledging they checked the task list before a deliberate new-key request.
 */
export function beginSubmission(current, { templateId, title }, { acknowledged = false } = {}, makeKey) {
  const fresh = () => ({ key: makeKey(), fp: submissionFingerprint({ templateId, title }), templateId: String(templateId), title: String(title).trim(), uncertain: false });
  if (current?.uncertain) return acknowledged ? fresh() : current; // locked to the original key and payload
  if (!current || current.fp !== submissionFingerprint({ templateId, title })) return fresh();
  return current;
}

/** Pending state after `attempt` produced `result` (from classifySubmitResponse). Returns the record to keep, or null. */
export function settleSubmission(attempt, result) {
  if (!attempt) return null;
  if (result.outcome === "accepted" && result.task_id) return null;
  if (!result.definite) return { ...attempt, uncertain: true };
  return attempt.uncertain ? attempt : null; // definite failure clears only a first attempt with no earlier uncertainty
}

/** Strictly restore a persisted pending record. Anything restored after a refresh is uncertain: it was in flight. */
export function restorePending(raw) {
  let p;
  try {
    p = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!isObj(p) || typeof p.key !== "string" || !IDEMPOTENCY_KEY_RE.test(p.key) || typeof p.templateId !== "string" || typeof p.title !== "string") return null;
  return { key: p.key, fp: submissionFingerprint(p), templateId: p.templateId, title: p.title, uncertain: true };
}

export const SAFE_CAPABILITY_COPY =
  "Only the fixed, server-advertised task templates below can run. Each one is a read-only Mac check or a deliberate safe failure test executed by a dedicated runner. Free-form AI instructions, shell commands, file paths, model or provider choices, messaging, publishing and spending are not available from the dashboard.";
