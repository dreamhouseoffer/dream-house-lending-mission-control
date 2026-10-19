// Framework-neutral Mission Control capability and view-state helpers.
// Source readiness is declared statically here until the Mac bridge protocol exists:
// nothing in this phase is reported as "live", and no control is enabled on assumed data.

export const BRIDGE_ENABLE_HINT =
  "Enabled once the Mac execution bridge (mc-bridge) is running and an approved, authenticated Vercel-to-Mac transport is configured.";

export const SOURCE_STATES = ["live", "observed", "stale", "offline", "snapshot", "unverified", "not_connected"];

export const SOURCE_STATE_LABELS = {
  live: "Live",
  observed: "Read via bridge",
  stale: "Stale",
  offline: "Offline",
  snapshot: "Snapshot",
  unverified: "Not verified",
  not_connected: "Not connected",
};

export const SOURCES = {
  bridge: {
    id: "bridge",
    label: "Mac execution bridge",
    state: "not_connected",
    detail: "No bridge endpoint is configured for this deployment, so Hermes on the Mac cannot be reached.",
    enables: BRIDGE_ENABLE_HINT,
  },
  tasks: {
    id: "tasks",
    label: "Hermes task board",
    state: "not_connected",
    detail: "Tasks, runs and results are read from the Hermes kanban through the bridge.",
    enables: BRIDGE_ENABLE_HINT,
  },
  agents: {
    id: "agents",
    label: "Agent sessions & heartbeats",
    state: "not_connected",
    detail: "Agent identity, assignment and last activity come from runtime heartbeats through the bridge.",
    enables: BRIDGE_ENABLE_HINT,
  },
  approvals: {
    id: "approvals",
    label: "Execution approvals",
    state: "not_connected",
    detail: "Versioned approvals bound to task, artifact, destination and action live in the bridge ledger.",
    enables: BRIDGE_ENABLE_HINT,
  },
  schedules: {
    id: "schedules",
    label: "Hermes schedules",
    state: "snapshot",
    detail: "Build-time snapshot committed by scripts/update-dashboard.js. Not live telemetry; missed runs are not detected.",
    enables: BRIDGE_ENABLE_HINT,
  },
  knowledge: {
    id: "knowledge",
    label: "Hermes memory",
    state: "not_connected",
    detail: "The authoritative Hermes memory stays on the Mac and is read through the bridge.",
    enables: BRIDGE_ENABLE_HINT,
  },
  content: {
    id: "content",
    label: "Content workspace",
    state: "not_connected",
    detail: "Sources, drafts, revisions and final outputs are linked to bridge tasks.",
    enables: BRIDGE_ENABLE_HINT,
  },
  milo: {
    id: "milo",
    label: "Milo approvals (Airtable)",
    state: "unverified",
    detail: "Retained module reads Airtable server-side. Connection health is not checked from this page.",
    href: "/milo-approvals",
  },
  pipeline: {
    id: "pipeline",
    label: "Loan pipeline (Airtable)",
    state: "unverified",
    detail: "Retained module reads the pipeline server-side. Connection health is not checked from this page.",
    href: "/pipeline",
  },
  mailchimp: {
    id: "mailchimp",
    label: "Mailchimp campaigns",
    state: "unverified",
    detail: "Retained Campaigns module. This redesign never schedules or sends campaigns.",
    href: "/campaigns",
  },
  usage: {
    id: "usage",
    label: "Usage & cost",
    state: "unverified",
    detail: "No verified usage source is connected. Committed cost files are not treated as real spend.",
    enables: "Enabled once real provider usage is reported by the bridge or a provider billing API.",
  },
};

export const TASK_STATUSES = [
  { id: "queued", label: "Queued", tone: "neutral" },
  { id: "running", label: "Running", tone: "info" },
  { id: "waiting_approval", label: "Waiting approval", tone: "warn" },
  { id: "blocked", label: "Blocked", tone: "warn" },
  { id: "completed", label: "Completed", tone: "ok" },
  { id: "failed", label: "Failed", tone: "bad" },
  { id: "canceled", label: "Canceled", tone: "neutral" },
];

export const PUBLISH_GATE_REASON =
  "Publishing and scheduling are never triggered from this view. They require execution-level approval gates, which ship in a later phase.";

export const ACTIONS = {
  "task.create": { label: "Create assignment", source: "tasks" },
  "task.run": { label: "Run task", source: "tasks" },
  "task.retry": { label: "Retry task", source: "tasks" },
  "approval.decide": { label: "Approve / reject / revise", source: "approvals" },
  "knowledge.revise": { label: "Propose memory correction", source: "knowledge" },
  "content.publish": { label: "Schedule or publish", source: "content", gated: true },
};

/** @param {string} state */
export function sourceStateLabel(state) {
  return /** @type {Record<string, string>} */ (SOURCE_STATE_LABELS)[state] ?? "Unknown";
}

/**
 * Whether an action can run, with an exact reason when it cannot.
 * @param {string} action
 * @param {Record<string, { label: string, state: string, enables?: string }>} [sources]
 * @returns {{ enabled: boolean, reason: string | null }}
 */
export function capability(action, sources = SOURCES) {
  /** @type {{ label: string, source: string, gated?: boolean } | undefined} */
  const def = /** @type {any} */ (ACTIONS)[action];
  if (!def) return { enabled: false, reason: `Unknown action "${action}".` };
  if (def.gated) return { enabled: false, reason: PUBLISH_GATE_REASON };
  const source = sources[def.source];
  if (!source) return { enabled: false, reason: "No data source is defined for this action." };
  if (source.state !== "live") {
    return {
      enabled: false,
      reason: `${source.label} is ${sourceStateLabel(source.state).toLowerCase()}. ${source.enables ?? ""}`.trim(),
    };
  }
  return { enabled: true, reason: null };
}

/**
 * Resolve what a view should render. Silence never becomes "ready":
 * an unconnected source is not_connected, never an empty healthy list.
 * @param {{ source?: { state?: string } | null, loading?: boolean, error?: unknown, items?: unknown[] | null, observedAt?: string | null, now?: number, staleAfterMs?: number }} [options]
 */
export function resolveViewState({ source, loading = false, error = null, items = null, observedAt = null, now = Date.now(), staleAfterMs = 60_000 } = {}) {
  const state = source?.state ?? "not_connected";
  if (state === "not_connected") return "not_connected";
  if (state === "offline") return "offline";
  if (loading) return "loading";
  if (error) return "error";
  if (!Array.isArray(items)) return "unverified";
  if ((state === "live" || state === "observed") && observedAt) {
    const t = Date.parse(observedAt);
    if (!Number.isFinite(t) || now - t > staleAfterMs) return "stale";
  }
  if (items.length === 0) return "empty";
  return state === "snapshot" ? "snapshot" : "ready";
}

const COUNTABLE = new Set(["ready", "snapshot", "stale", "empty"]);

/** Totals are only shown when backed by data; otherwise "Unknown", never 0. */
/** @param {string} viewState @param {number | undefined} n */
export function displayTotal(viewState, n) {
  if (!COUNTABLE.has(viewState) || typeof n !== "number" || !Number.isFinite(n)) return "Unknown";
  return String(n);
}

/**
 * @template {{ status: string }} T
 * @param {T[]} items
 * @param {string} [status]
 * @returns {T[]}
 */
export function filterByStatus(items, status) {
  if (!status || status === "all") return items;
  return items.filter((item) => item.status === status);
}

/** @param {unknown} value @returns {string} */
export function parseTaskStatus(value) {
  return TASK_STATUSES.some((s) => s.id === value) ? value : "all";
}

/**
 * @typedef {{ id: string, name: string, enabled: boolean, schedule: string | null, tz: string | null, lastRunAt: string | null,
 *   lastStatus: string, nextRunAt: string | null, consecutiveErrors: number, lastError: string | null,
 *   status: "disabled" | "erroring" | "ran" | "never_run" }} ScheduleRow
 */

/**
 * Normalize the committed schedule snapshot for display.
 * @param {unknown} snapshot
 * @returns {ScheduleRow[]}
 */
export function scheduleRows(snapshot) {
  /** @type {any[]} */
  const jobs = Array.isArray(/** @type {any} */ (snapshot)?.agents) ? /** @type {any} */ (snapshot).agents : [];
  return jobs.map((job) => ({
    id: String(job.id ?? job.name ?? "unknown"),
    name: String(job.name ?? "Unnamed schedule"),
    enabled: job.enabled === true,
    schedule: job.schedule ?? null,
    tz: job.tz ?? null,
    lastRunAt: job.lastRunAt ?? null,
    lastStatus: job.lastStatus ?? "unknown",
    nextRunAt: job.nextRunAt ?? null,
    consecutiveErrors: Number(job.consecutiveErrors) || 0,
    lastError: job.lastError ?? null,
    status: job.enabled !== true ? "disabled" : Number(job.consecutiveErrors) > 0 ? "erroring" : job.lastRunAt ? "ran" : "never_run",
  }));
}

export const SCHEDULE_FILTERS = [
  { id: "all", label: "All" },
  { id: "erroring", label: "Erroring" },
  { id: "never_run", label: "Never run" },
  { id: "ran", label: "Ran" },
  { id: "disabled", label: "Disabled" },
];

/**
 * @param {ScheduleRow[]} rows
 * @param {{ status?: string, q?: string }} [options]
 * @returns {ScheduleRow[]}
 */
export function filterSchedules(rows, { status = "all", q = "" } = {}) {
  const needle = String(q).trim().toLowerCase();
  return filterByStatus(rows, status).filter((r) => !needle || r.name.toLowerCase().includes(needle));
}

export const CORE_NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/agents", label: "Agents", icon: "agents" },
  { href: "/office", label: "Office", icon: "office" },
  { href: "/approvals", label: "Approvals", icon: "approvals" },
  { href: "/workflows", label: "Workflows", icon: "workflows" },
  { href: "/content", label: "Content", icon: "content" },
  { href: "/knowledge", label: "Knowledge", icon: "knowledge" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const MODULE_NAV = [
  {
    title: "Work modules",
    items: [
      { href: "/pipeline", label: "Pipeline" },
      { href: "/ask", label: "Ask Hermes" },
      { href: "/milo-approvals", label: "Milo approvals" },
      { href: "/headquarters", label: "Headquarters" },
      { href: "/briefs", label: "Briefs" },
      { href: "/content/training", label: "Loan training" },
      { href: "/campaigns", label: "Campaigns" },
    ],
  },
  {
    title: "Money & life",
    items: [
      { href: "/finance", label: "Finance" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/vega", label: "Markets" },
      { href: "/body-os", label: "Body OS" },
    ],
  },
  {
    title: "Legacy (browser-local)",
    items: [
      { href: "/today", label: "Today (legacy)" },
      { href: "/tasks/legacy", label: "Mission board (legacy)" },
      { href: "/projects/legacy", label: "Projects (legacy)" },
      { href: "/team", label: "Team roster" },
      { href: "/calendar", label: "Calendar" },
      { href: "/memory", label: "Memory notes" },
      { href: "/docs", label: "Docs" },
      { href: "/tools", label: "Tools" },
    ],
  },
];

export function allNavItems() {
  return [...CORE_NAV, ...MODULE_NAV.flatMap((g) => g.items)];
}

/** Most specific nav item for a pathname (exact match wins, then longest prefix). */
/** @param {string} [pathname] @returns {{ href: string, label: string, icon?: string } | null} */
export function navItemFor(pathname = "/") {
  const items = allNavItems();
  const exact = items.find((i) => i.href === pathname);
  if (exact) return exact;
  return items
    .filter((i) => i.href !== "/" && pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}
