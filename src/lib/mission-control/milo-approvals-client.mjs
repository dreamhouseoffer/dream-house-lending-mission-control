// Pure reader for the existing Milo approvals Airtable table. Used by the retained /api/milo-approvals route and by the
// read-only Milo feed on /approvals. No env access, no writes, no logging: config and transport are injected so the
// server wrapper keeps the Airtable credential in-process and tests run against synthetic fixtures only.
//
// Labels here are Airtable values, not Mission Control facts. "Approved" records permission only; "In Progress" or
// "Verified / Done" are labels someone set in Airtable and say nothing verified about execution, task linkage or output.

// Client-safe (no node builtins) so the /milo-approvals page can show it without pulling in the server decision module.
export const DECISION_BOUNDARY = "Approval records permission; execution is confirmed by a linked task.";

export const MILO_DEFAULT_BASE_ID = "app9j7s9BTPr8UglD";
export const MILO_DEFAULT_TABLE_ID = "tblMixrIAukHjqBKl";
export const MILO_PAGE_SIZE = 100;
export const MILO_MAX_PAGES = 10;
export const MILO_TIMEOUT_MS = 10_000;

const RECORD_ID_RE = /^rec[A-Za-z0-9]{14}$/;
const OFFSET_RE = /^[A-Za-z0-9/._-]{1,200}$/;

/** Same fallbacks as the original route: AIRTABLE_BASE_ID / MILO_APPROVALS_TABLE_ID / AIRTABLE_API_KEY || AIRTABLE_TOKEN. */
export function readMiloConfig({ baseId, tableId, apiKey, token } = {}) {
  const key = apiKey || token || "";
  return { configured: Boolean(key), baseId: baseId || MILO_DEFAULT_BASE_ID, tableId: tableId || MILO_DEFAULT_TABLE_ID, key };
}

export function miloTableUrl(config, recordId) {
  const base = `https://api.airtable.com/v0/${config.baseId}/${config.tableId}`;
  return recordId ? `${base}/${recordId}` : base;
}

export function miloHeaders(config) {
  return { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" };
}

function stringField(fields, name) {
  const value = fields[name];
  return typeof value === "string" ? value : "";
}

/** Legacy /api/milo-approvals shape, unchanged (including its display defaults). */
export function normalizeLegacyRecord(record) {
  const fields = record.fields || {};
  return {
    id: record.id,
    createdTime: record.createdTime || "",
    title: stringField(fields, "Title"),
    status: stringField(fields, "Status") || "Drafted by Milo",
    approvalLevel: stringField(fields, "Approval Level") || "YELLOW",
    category: stringField(fields, "Category"),
    businessReason: stringField(fields, "Business Reason"),
    proposedChange: stringField(fields, "Proposed Change"),
    affectedUrl: stringField(fields, "Affected URL"),
    evidence: stringField(fields, "Evidence"),
    riskNote: stringField(fields, "Risk Note"),
    decision: stringField(fields, "Decision") || "Pending",
    fonzNotes: stringField(fields, "Fonz Notes"),
    approvedAt: stringField(fields, "Approved At"),
    // Raw saved values (null when missing) so the legacy page can show exactly what Airtable holds, not the defaults.
    savedStatus: raw(fields, "Status"),
    savedDecision: raw(fields, "Decision"),
  };
}

/** Legacy list URL: one page, same sort as the original route. */
export function legacyListUrl(config) {
  const url = new URL(miloTableUrl(config));
  url.searchParams.set("pageSize", String(MILO_PAGE_SIZE));
  url.searchParams.set("sort[0][field]", "Status");
  url.searchParams.set("sort[0][direction]", "asc");
  url.searchParams.set("sort[1][field]", "Approval Level");
  url.searchParams.set("sort[1][direction]", "desc");
  return url;
}

function raw(fields, name) {
  const value = fields[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Raw-source card for the inbox: missing fields stay null (shown as "not set"), never defaulted to Pending/Drafted.
 * Returns null for anything that is not a well-formed Airtable record.
 */
export function parseMiloRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  if (typeof record.id !== "string" || !RECORD_ID_RE.test(record.id)) return null;
  const fields = record.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  return {
    id: record.id,
    createdTime: typeof record.createdTime === "string" && record.createdTime ? record.createdTime : null,
    title: raw(fields, "Title"),
    category: raw(fields, "Category"),
    approvalLevel: raw(fields, "Approval Level"),
    decision: raw(fields, "Decision"),
    status: raw(fields, "Status"),
    approvedAt: raw(fields, "Approved At"),
  };
}

function failure(state, code, status) {
  return status === undefined ? { ok: false, state, code } : { ok: false, state, code, status };
}

function httpFailure(status) {
  if (status === 401 || status === 403) return failure("unavailable", "credential_rejected", status);
  if (status === 404) return failure("unavailable", "table_not_found", status);
  if (status === 429) return failure("unavailable", "rate_limited", status);
  return failure("unavailable", "http_error", status);
}

const defaultTransport = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(MILO_TIMEOUT_MS) });

/**
 * Read every card (bounded to maxPages). Any failed page fails the whole read: a partial list is never presented as
 * the feed. A remaining offset after maxPages is reported as truncated rather than silently dropped.
 */
export async function fetchMiloApprovals(config, { transport = defaultTransport, maxPages = MILO_MAX_PAGES, now = () => Date.now() } = {}) {
  if (!config?.configured) return failure("not_configured", "airtable_key_missing");
  const cards = [];
  let malformed = 0;
  let offset = null;
  let pages = 0;
  do {
    const url = legacyListUrl(config);
    if (offset) url.searchParams.set("offset", offset);
    let response;
    try {
      response = await transport(url.toString(), { headers: miloHeaders(config), cache: "no-store" });
    } catch {
      return failure("unavailable", "network_error");
    }
    if (!response.ok) return httpFailure(response.status);
    let data;
    try {
      data = await response.json();
    } catch {
      return failure("bad_payload", "invalid_json");
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.records)) return failure("bad_payload", "records_missing");
    if (data.offset !== undefined && (typeof data.offset !== "string" || !OFFSET_RE.test(data.offset))) {
      return failure("bad_payload", "invalid_offset");
    }
    for (const record of data.records) {
      const card = parseMiloRecord(record);
      if (card) cards.push(card);
      else malformed += 1;
    }
    offset = data.offset ?? null;
    pages += 1;
  } while (offset && pages < maxPages);
  return { ok: true, cards, malformed, truncated: Boolean(offset), pages, observedAt: new Date(now()).toISOString() };
}

/** Read ONE card by exact record id (raw Airtable record). Read-only; same transport/failure contract as the list read. */
export async function fetchMiloRecord(config, recordId, { transport = defaultTransport } = {}) {
  if (!config?.configured) return failure("not_configured", "airtable_key_missing");
  if (typeof recordId !== "string" || !RECORD_ID_RE.test(recordId)) return failure("error", "invalid_record_id");
  let response;
  try {
    response = await transport(miloTableUrl(config, recordId), { headers: miloHeaders(config), cache: "no-store" });
  } catch {
    return failure("unavailable", "network_error");
  }
  if (!response.ok) return httpFailure(response.status);
  let data;
  try {
    data = await response.json();
  } catch {
    return failure("bad_payload", "invalid_json");
  }
  if (!data || typeof data !== "object" || data.id !== recordId || !data.fields || typeof data.fields !== "object") return failure("bad_payload", "record_mismatch");
  return { ok: true, record: data };
}

// ---- Inbox view helpers -------------------------------------------------------------------------------------------

export const MILO_DECISION_FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "needs_changes", label: "Needs changes" },
  { id: "rejected", label: "Rejected" },
  { id: "other", label: "Not set / other" },
];

const DECISION_GROUP = { pending: "pending", approved: "approved", "needs changes": "needs_changes", rejected: "rejected" };

export function decisionGroup(decision) {
  return (decision && DECISION_GROUP[decision.toLowerCase()]) || "other";
}

export function filterMiloCards(cards, filter) {
  if (!filter || filter === "all" || !MILO_DECISION_FILTERS.some((f) => f.id === filter)) return cards;
  return cards.filter((c) => decisionGroup(c.decision) === filter);
}

export function activeMiloFilter(value) {
  return typeof value === "string" && MILO_DECISION_FILTERS.some((f) => f.id === value) ? value : "all";
}

export const NOT_VERIFIED = "Execution and task linkage are not verified by Mission Control.";

/** Honest reading of the raw labels. Never upgrades a label into an execution, health or completion claim. */
export function miloCardCaveat(card) {
  const status = (card.status ?? "").toLowerCase();
  const approved = decisionGroup(card.decision) === "approved";
  if (status === "in progress") return `"In Progress" is an Airtable label, not verified execution. ${NOT_VERIFIED}`;
  if (status.includes("done") || status.includes("verified")) {
    return `"${card.status}" is an Airtable label; completion and outputs are not verified by Mission Control.`;
  }
  if (approved) return `Approved records permission only — not an execution, publication or completion receipt. ${NOT_VERIFIED}`;
  return `Airtable labels only. ${NOT_VERIFIED}`;
}

export function decisionTone(decision) {
  const group = decisionGroup(decision);
  return group === "approved" ? "ok" : group === "rejected" ? "bad" : group === "needs_changes" ? "warn" : group === "pending" ? "info" : "neutral";
}

export function levelTone(level) {
  return level === "RED" ? "bad" : level === "YELLOW" ? "warn" : level === "GREEN" ? "ok" : "neutral";
}

const FAILURE_TEXT = {
  unauthenticated: "Sign in as the owner to read the Milo approval feed.",
  airtable_key_missing: "The Airtable credential is not configured on the server, so the Milo feed cannot be read.",
  credential_rejected: "Airtable rejected the configured credential.",
  table_not_found: "Airtable did not find the configured Milo approvals table.",
  rate_limited: "Airtable rate-limited the read. Try again shortly.",
  http_error: "Airtable returned an error.",
  network_error: "Airtable could not be reached.",
  invalid_json: "Airtable returned a response that is not valid JSON.",
  records_missing: "Airtable returned a response without a records list.",
  invalid_offset: "Airtable returned an invalid pagination cursor.",
};

export function miloFailureText(code) {
  return FAILURE_TEXT[code] ?? "The Milo feed could not be read.";
}
