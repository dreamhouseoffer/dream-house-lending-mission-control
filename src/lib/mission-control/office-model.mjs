// Pure roster model for the team office. Everyone shown comes from a real source:
//   - agents: configured Hermes profiles read through GET /v0/operations (test profiles and control lanes excluded)
//   - scheduled jobs: the Hermes cron schedules from the same read (shown as jobs, not employees)
//   - humans: the fixed human team, whose presence is never tracked.
// "Working" (typing at the desk) is set ONLY by authoritative native evidence read from the task DETAIL (GET /v0/tasks/:id,
// i.e. `hermes kanban show --json`): native status running for this assignee, exactly one open run claimed by this
// profile, and a native `heartbeat` event for that same run no older than HEARTBEAT_MAX_AGE_MS. The list view's
// ui.state=running_unverified is only a candidate (the bridge reports it even without run receipts), and the bridge's
// observed_at is an HTTP read time, never a worker heartbeat. Approved/saved labels, schedules and idle wandering are
// never treated as activity.
import { UI_STATE_LABELS, lastTouched, observationState, toEpochMs } from "./bridge-client.mjs";
import { CONTROL_LANES } from "./operations-client.mjs";

// Profiles that exist for testing only and are not team members.
export const TEST_PROFILES = new Set(["gpt56-test"]);
// Friendly names for profiles whose configured name is just their id.
export const DISPLAY_NAMES = { default: "Hermie" };

export const HUMAN_TEAM = [
  { id: "human-fonz", name: "Fonz", role: "Owner" },
  { id: "human-claudia", name: "Claudia", role: "Team member" },
  { id: "human-nathaly", name: "Nathaly", role: "Team member" },
];

const DONE = new Set(["completed", "completed_unverified", "review"]);
const OPEN = new Set(["queued", "queued_after_failure", "running_unverified", "waiting_approval", "review", "blocked", "interrupted"]);

export function displayName(profile) {
  const alias = DISPLAY_NAMES[profile.id];
  if (profile.name && profile.name !== profile.id) return profile.name;
  // A name that is only the profile id is shown title-cased (milo -> Milo); the id itself is unchanged.
  return alias ?? profile.id.charAt(0).toUpperCase() + profile.id.slice(1);
}

export function isEmployeeProfile(profile) {
  return !TEST_PROFILES.has(profile.id) && !(profile.id in CONTROL_LANES);
}

export const HEARTBEAT_MAX_AGE_MS = 120_000;
// At most this many task-detail reads per office render (newest running candidates first).
export const MAX_ACTIVITY_READS = 6;
export const ACTIVITY_SOURCE = "native kanban show via bridge GET /v0/tasks/:id (runs + heartbeat events)";

/**
 * Task ids worth a detail read: list-view running candidates of team agents, newest first, bounded.
 * @returns {string[]}
 */
export function activityCandidates(list, profiles, max = MAX_ACTIVITY_READS) {
  if (!list || !list.ok || !Array.isArray(profiles)) return [];
  const ids = new Set(profiles.filter(isEmployeeProfile).map((p) => p.id));
  return list.tasks
    .filter((t) => ids.has(t.assignee) && t.ui.state === "running_unverified")
    .sort((a, b) => lastTouched(b) - lastTouched(a))
    .slice(0, max)
    .map((t) => t.id);
}

const nullish = (v) => v === null || v === undefined;

/**
 * Verify native activity for `profileId` from one task-detail read. Returns
 *   { verified: true, runId, heartbeatAt (ms), expiresAt (ms) }  or  { verified: false, reason }.
 * Never uses the HTTP observation time as a heartbeat; future-dated heartbeats are rejected.
 */
export function nativeActivity(detail, profileId, now = Date.now(), maxAgeMs = HEARTBEAT_MAX_AGE_MS) {
  const no = (reason) => ({ verified: false, reason });
  if (!detail || !detail.ok) return no("task detail not read");
  if (observationState(detail.observedAt, now) !== "observed") return no("task detail read is stale");
  const { task, runs, events } = detail;
  if (!task || task.status !== "running") return no("native status is not running");
  if (task.assignee !== profileId) return no("task is assigned to another profile");
  const open = (runs ?? []).filter((r) => nullish(r.ended_at) && nullish(r.outcome));
  if (open.length !== 1) return no(open.length ? "more than one open run" : "no open native run");
  const run = open[0];
  if (!Number.isSafeInteger(run.id) || run.id <= 0) return no("open run has no id");
  if ((runs ?? []).some((r) => Number.isSafeInteger(r.id) && r.id > run.id)) return no("open run is not the latest run");
  if (run.status !== "running") return no("open run is not in running status");
  if (run.profile !== profileId) return no("open run belongs to another profile");
  const sameRun = (events ?? []).filter((e) => e.run_id === run.id);
  if (!sameRun.some((e) => e.kind === "claimed")) return no("no native claim event for the open run");
  let latest = null;
  let future = false;
  for (const e of sameRun) {
    if (e.kind !== "heartbeat") continue;
    const ms = toEpochMs(e.created_at);
    if (ms === null) continue;
    if (ms > now) { future = true; continue; }
    if (latest === null || ms > latest) latest = ms;
  }
  if (latest === null) return no(future ? "only future-dated heartbeats (rejected)" : "no native heartbeat event for the open run");
  if (now - latest > maxAgeMs) return no(`last native heartbeat ${Math.round((now - latest) / 1000)}s ago (older than ${maxAgeMs / 1000}s)`);
  return { verified: true, runId: run.id, heartbeatAt: latest, expiresAt: latest + maxAgeMs };
}

const brief = (t) => (t ? { id: t.id, title: t.title || "Untitled task", state: t.ui.state, label: UI_STATE_LABELS[t.ui.state] ?? "Unrecognised status" } : null);

/**
 * @param {{ ok: boolean, state?: string, observedAt?: string, profiles?: any[] | null, schedules?: any[] | null }} ops
 * @param {{ ok: boolean, state?: string, observedAt?: string, tasks?: any[] }} list
 * @param {Record<string, any>} details task-detail reads (readTask results) keyed by task id, for activityCandidates()
 */
export function officeRoster(ops, list, now = Date.now(), details = {}) {
  const tasksKnown = Boolean(list && list.ok);
  const fresh = tasksKnown && observationState(list.observedAt, now) === "observed";
  const tasks = tasksKnown ? list.tasks : [];
  const profiles = ops && ops.ok && Array.isArray(ops.profiles) ? ops.profiles : null;
  const excluded = profiles ? profiles.filter((p) => !isEmployeeProfile(p)).map((p) => p.id) : [];

  const agents = (profiles ?? []).filter(isEmployeeProfile).map((p) => {
    const mine = tasks.filter((t) => t.assignee === p.id).sort((a, b) => lastTouched(b) - lastTouched(a));
    const running = mine.find((t) => t.ui.state === "running_unverified") ?? null;
    let status;
    let statusLabel;
    let evidence = null;
    if (!tasksKnown) {
      status = "unknown";
      statusLabel = "Unknown — task board not read";
    } else if (!fresh) {
      status = "unknown";
      statusLabel = "Unknown — task board read is stale";
    } else if (running) {
      const act = nativeActivity(details[running.id], p.id, now);
      if (act.verified) {
        status = "working";
        statusLabel = "Working — open native run with a recent heartbeat";
        evidence = { source: ACTIVITY_SOURCE, taskId: running.id, runId: act.runId, heartbeatAt: new Date(act.heartbeatAt).toISOString(), expiresAt: act.expiresAt };
      } else {
        status = "unknown";
        statusLabel = `Unknown — run open, activity unverified (${act.reason})`;
        evidence = { source: ACTIVITY_SOURCE, taskId: running.id, runId: null, heartbeatAt: null, expiresAt: null, reason: act.reason };
      }
    } else {
      status = "idle";
      statusLabel = "No open run — idle";
    }
    return {
      id: p.id,
      name: displayName(p),
      role: p.role ?? "Role not recorded",
      kind: "agent",
      status,
      statusLabel,
      current: brief(running),
      latest: brief(mine.find((t) => DONE.has(t.ui.state)) ?? null),
      openCount: tasksKnown ? mine.filter((t) => OPEN.has(t.ui.state)).length : null,
      evidence,
    };
  });

  const scheduled = ops && ops.ok && Array.isArray(ops.schedules)
    ? ops.schedules.map((s) => ({
        id: `job-${s.id}`,
        name: s.name ?? "Unnamed schedule",
        kind: "scheduled",
        schedule: s.schedule,
        enabled: s.enabled,
        nextRunAt: s.next_run_at,
        lastRunAt: s.last_run_at,
        lastStatus: s.last_status,
        status: s.enabled === false ? "disabled" : s.has_error === true ? "erroring" : s.enabled === null || s.has_error === null ? "unknown" : "scheduled",
      }))
    : null;

  const humans = HUMAN_TEAM.map((h) => ({ ...h, kind: "human", status: "untracked", statusLabel: "Human — presence not tracked" }));

  return {
    agents,
    scheduled,
    humans,
    excluded,
    profilesState: ops && ops.ok ? (profiles ? "observed" : "unverified") : ops?.state ?? "unknown",
    tasksState: tasksKnown ? (fresh ? "observed" : "stale") : list?.state ?? "unknown",
    observedAt: tasksKnown ? list.observedAt : null,
  };
}
