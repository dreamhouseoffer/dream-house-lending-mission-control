// Owner decisions for the retained /milo-approvals module. Pure planner + injected transport so tests run on synthetic
// fixtures only; no env access, no logging. Recording a decision is permission, never worker execution: approve never
// writes "In Progress", repeats never rewrite Decision / Approved At, a completed outcome is never downgraded, evidence
// is never touched, and notes are only cleared when the caller explicitly says so.
import { miloHeaders, miloTableUrl, normalizeLegacyRecord } from "./milo-approvals-client.mjs";

export const RECORD_ID_RE = /^rec[A-Za-z0-9]{14}$/;
export const LEGACY_ACTIONS = ["approve", "reject", "needs_changes", "notes", "status"];
export const LEGACY_STATUSES = ["Drafted by Milo", "Hermie Reviewed", "Needs Fonz Approval", "Approved", "Verified / Done", "Rejected / Parked"];
export const MAX_NOTES = 5000;
export const DECISION_BOUNDARY = "Approval records permission; execution is confirmed by a linked task.";

const DECISIONS = { approve: "Approved", reject: "Rejected", needs_changes: "Needs Changes" };
const DECISION_STATUS = { approve: "Approved", reject: "Rejected / Parked", needs_changes: "Hermie Reviewed" };

const str = (fields, name) => (typeof fields?.[name] === "string" ? fields[name] : "");
export const isDoneStatus = (status) => /done|complete|verified/i.test(status ?? "");

/** Validate the browser body. Returns { ok, action, notes, notesProvided, clearNotes, status } or { ok:false, code }. */
export function parseDecisionRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, code: "invalid_body", error: "Invalid request." };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return { ok: false, code: "missing_id", error: "Missing approval id." };
  if (!RECORD_ID_RE.test(id)) return { ok: false, code: "invalid_id", error: "Invalid approval id." };
  const action = typeof body.action === "string" ? body.action : "";
  if (!LEGACY_ACTIONS.includes(action)) return { ok: false, code: "unknown_action", error: "Unknown action." };
  const notesProvided = typeof body.notes === "string";
  const notes = notesProvided ? body.notes : "";
  if (notes.length > MAX_NOTES) return { ok: false, code: "notes_too_long", error: "Notes are too long." };
  const status = typeof body.status === "string" ? body.status : "";
  if (action === "status") {
    if (!status) return { ok: false, code: "missing_status", error: "Missing status." };
    if (!LEGACY_STATUSES.includes(status)) {
      return { ok: false, code: "status_not_allowed", error: "That status cannot be set here. Execution is confirmed by a linked task, not a saved label." };
    }
  }
  return { ok: true, id, action, notes, notesProvided, clearNotes: body.clearNotes === true, status };
}

/**
 * Build the minimal field changes from the EXACT current record. Unchanged values are never written.
 * Returns { ok:true, fields, changed, repeat } or { ok:false, code, error }.
 */
export function planDecision(existingFields, req, now = () => Date.now()) {
  const fields = {};
  const currentDecision = str(existingFields, "Decision");
  const currentStatus = str(existingFields, "Status");
  let repeat = false;

  if (DECISIONS[req.action]) {
    const decision = DECISIONS[req.action];
    if (currentDecision === decision) {
      repeat = true; // keep Decision, Approved At, Status and any completed outcome exactly as saved
    } else {
      fields.Decision = decision;
      // A completed outcome (e.g. a verified release) is never downgraded by a later decision click.
      if (!isDoneStatus(currentStatus) && currentStatus !== DECISION_STATUS[req.action]) fields.Status = DECISION_STATUS[req.action];
      if (req.action === "approve" && !str(existingFields, "Approved At")) fields["Approved At"] = new Date(now()).toISOString();
    }
  } else if (req.action === "status") {
    if (currentStatus !== req.status) fields.Status = req.status;
  }

  const currentNotes = str(existingFields, "Fonz Notes");
  if (req.action === "notes" || (req.notesProvided && req.notes)) {
    if (req.notes !== currentNotes) {
      if (!req.notes && currentNotes && !req.clearNotes) {
        return { ok: false, code: "notes_clear_unconfirmed", error: "Saving empty notes would erase the existing notes. Confirm clearing explicitly." };
      }
      fields["Fonz Notes"] = req.notes;
    }
  }

  return { ok: true, fields, changed: Object.keys(fields).length > 0, repeat };
}

function effectFor(action, repeat, changed) {
  if (action === "approve") return repeat ? "approval_already_recorded" : "permission_recorded";
  if (DECISIONS[action]) return repeat ? "decision_already_recorded" : "decision_recorded";
  return changed ? "fields_saved" : "unchanged";
}

const defaultTransport = (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });

/**
 * Read the exact record, plan, and PATCH only the changed fields. Never starts, dispatches or publishes anything.
 * Returns { httpStatus, body } for the route to serialise.
 */
export async function applyLegacyDecision(config, rawBody, { transport = defaultTransport, now = () => Date.now() } = {}) {
  if (!config?.configured) return { httpStatus: 500, body: { ok: false, error: "Airtable API key is not configured." } };
  const req = parseDecisionRequest(rawBody);
  if (!req.ok) return { httpStatus: 400, body: { ok: false, code: req.code, error: req.error } };

  let current;
  try {
    current = await transport(miloTableUrl(config, req.id), { method: "GET", headers: miloHeaders(config) });
  } catch {
    return { httpStatus: 502, body: { ok: false, code: "network_error", error: "Airtable could not be reached; nothing was saved." } };
  }
  if (!current.ok) {
    const httpStatus = current.status === 404 ? 404 : current.status || 502;
    return { httpStatus, body: { ok: false, code: "read_failed", error: "Could not read the current record; nothing was saved." } };
  }
  const record = await current.json().catch(() => null);
  if (!record || record.id !== req.id || !record.fields || typeof record.fields !== "object") {
    return { httpStatus: 502, body: { ok: false, code: "bad_record", error: "Airtable returned an unexpected record; nothing was saved." } };
  }

  const plan = planDecision(record.fields, req, now);
  if (!plan.ok) return { httpStatus: 409, body: { ok: false, code: plan.code, error: plan.error } };

  const meta = {
    effect: effectFor(req.action, plan.repeat, plan.changed),
    changedFields: Object.keys(plan.fields),
    execution: "not_started",
    boundary: DECISION_BOUNDARY,
  };
  if (!plan.changed) return { httpStatus: 200, body: { ok: true, ...meta, approval: normalizeLegacyRecord(record) } };

  let response;
  try {
    response = await transport(miloTableUrl(config, req.id), { method: "PATCH", headers: miloHeaders(config), body: JSON.stringify({ fields: plan.fields }) });
  } catch {
    return { httpStatus: 502, body: { ok: false, code: "network_error", error: "Airtable could not be reached; the decision may not be saved. Refresh before retrying." } };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { httpStatus: response.status, body: { ok: false, error: "Airtable update failed.", detail: text.slice(0, 500) } };
  }
  const updated = await response.json().catch(() => null);
  return { httpStatus: 200, body: { ok: true, ...meta, approval: updated ? normalizeLegacyRecord(updated) : normalizeLegacyRecord(record) } };
}
