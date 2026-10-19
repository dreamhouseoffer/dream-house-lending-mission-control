// Body OS: generic, data-free, browser-safe helpers shared by the protected /api/fitness routes and the /body-os page.
// No program text, health data or credentials live here; the program and logbook are private bridge files.

export const SET_KEYS = ["session_id", "exercise_id", "date", "kind", "set_number", "weight", "unit", "reps", "rir", "notes"];
export const MAX_SET_REQUEST_BYTES = 1024;
export const IDEM_RE = /^[A-Za-z0-9_-]{16,128}$/;
export const SESSION_RE = /^[A-D]$/;
const EXERCISE_RE = /^[a-z][a-z0-9_]{1,47}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u001f\u007f]/;
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function isIsoDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Strict shape check of one set submission (the bridge re-checks it against the private program). */
export function validateSetInput(data) {
  if (!isObj(data) || Object.keys(data).length !== SET_KEYS.length || !SET_KEYS.every((k) => Object.hasOwn(data, k))) return "invalid_fields";
  const { session_id, exercise_id, date, kind, set_number, weight, unit, reps, rir, notes } = data;
  if (typeof session_id !== "string" || !SESSION_RE.test(session_id)) return "invalid_session";
  if (typeof exercise_id !== "string" || !EXERCISE_RE.test(exercise_id)) return "invalid_exercise";
  if (!isIsoDate(date)) return "invalid_date";
  if (kind !== "warmup" && kind !== "working") return "invalid_kind";
  if (!int(set_number, 1, 20)) return "invalid_set_number";
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1500 || Math.round(weight * 4) !== weight * 4) return "invalid_weight";
  if (unit !== "lb" && unit !== "kg") return "invalid_unit";
  if (!int(reps, 0, 100)) return "invalid_reps";
  if (!(rir === null || int(rir, 0, 10))) return "invalid_rir";
  if (kind === "working" && rir === null) return "rir_required";
  if (typeof notes !== "string" || notes.length > 280 || CTRL.test(notes)) return "invalid_notes";
  return null;
}

/** Turn raw form strings into a set submission; returns { set } or { error }. Drafts are never saved implicitly. */
export function draftToSet(d) {
  const num = (s) => (typeof s === "string" && /^\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const set = {
    session_id: d.sessionId, exercise_id: d.exerciseId, date: d.date, kind: d.kind, set_number: num(d.setNumber),
    weight: num(d.weight), unit: d.unit, reps: num(d.reps), rir: d.kind === "warmup" && String(d.rir ?? "").trim() === "" ? null : num(d.rir),
    notes: String(d.notes ?? "").trim(),
  };
  const error = validateSetInput(set);
  return error ? { error } : { set };
}

export const SET_ERROR_COPY = {
  invalid_fields: "The set could not be read. Reload the page and try again.",
  invalid_session: "Choose a session.",
  invalid_exercise: "That exercise is not in this session's program.",
  invalid_date: "Use a real date (not in the future).",
  invalid_kind: "Choose warm-up or working set.",
  invalid_set_number: "Set number must be 1–20.",
  invalid_weight: "Weight must be 0–1500 in steps of 0.25.",
  invalid_unit: "Choose lb or kg.",
  invalid_reps: "Reps must be a whole number 0–100.",
  invalid_rir: "RIR must be a whole number 0–10.",
  rir_required: "Working sets need an RIR (reps in reserve).",
  invalid_notes: "Notes: up to 280 characters, single line.",
  idempotency_conflict: "This submission key was already used for different values. Nothing was overwritten; edit and save again.",
  set_already_logged: "That set number is already logged for this exercise and date. Nothing was overwritten; use the next set number.",
  plan_unavailable: "No program is available, so nothing can be logged.",
  log_store_full: "The logbook is full. Nothing was saved.",
};

/**
 * Classify the answer to a set POST. Only a 2xx carrying outcome "saved" is saved; a 4xx refusal from the app or bridge is
 * definitely not saved; anything else (5xx, timeout, unreadable body) is NOT CONFIRMED and must be retried with the same key.
 */
export function classifySaveResponse(status, data) {
  if (status >= 200 && status < 300 && isObj(data) && data.ok === true && data.outcome === "saved" && isObj(data.set)) {
    return { kind: "saved", deduplicated: data.deduplicated === true, set: data.set };
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    const code = isObj(data) && typeof data.code === "string" ? data.code : isObj(data) && typeof data.state === "string" ? data.state : "rejected";
    return { kind: "refused", code };
  }
  return { kind: "unconfirmed" };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** The weekly_schedule entry for a calendar date's weekday (plan template, not a record), or null when none matches. */
export function scheduledFor(schedule, isoDate) {
  if (!Array.isArray(schedule) || !isIsoDate(isoDate)) return null;
  const wd = WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  const hit = schedule.find((d) => isObj(d) && typeof d.day === "string" && d.day.length >= 3 && wd.startsWith(d.day.trim().toLowerCase()));
  if (!hit) return null;
  return { day: hit.day, session_id: typeof hit.session_id === "string" && SESSION_RE.test(hit.session_id) ? hit.session_id : null, note: typeof hit.note === "string" ? hit.note : "" };
}

// ---- strict readers of bridge answers ----
const str = (v, max = 600) => typeof v === "string" && v.length <= max;
const strs = (v) => Array.isArray(v) && v.length <= 20 && v.every((s) => str(s));
function checkSession(s) {
  return isObj(s) && SESSION_RE.test(s.id) && str(s.label) && str(s.focus) && isObj(s.warmup) && strs(s.warmup.steps)
    && Array.isArray(s.ramp_sets) && Array.isArray(s.exercises) && s.exercises.length > 0
    && s.exercises.every((e) => isObj(e) && EXERCISE_RE.test(e.id) && str(e.name) && int(e.sets, 1, 10) && int(e.rep_min, 1, 50)
      && int(e.rep_max, 1, 50) && int(e.rest_seconds, 0, 600) && str(e.rir) && (e.condition === null || str(e.condition)) && strs(e.cues))
    && isObj(s.cardio) && isObj(s.cooldown) && strs(s.cooldown.steps) && str(s.effort);
}
export function checkPlan(d) {
  if (!isObj(d)) return null;
  if (d.state === "missing") return { state: "missing" };
  const p = d.program;
  if (d.state !== "ready" || !isObj(p) || !Array.isArray(p.sessions) || p.sessions.length !== 4 || !p.sessions.every(checkSession)) return null;
  if (!isObj(p.safety_gate) || !strs(p.safety_gate.rules) || !strs(p.safety_gate.stop_signs) || !Array.isArray(p.weekly_schedule)) return null;
  return { state: "ready", program: p, planSha256: typeof d.plan_sha256 === "string" ? d.plan_sha256 : null };
}
const ENTRY = (e) => isObj(e) && IDEM_RE.test(e.key) && validateSetInput(Object.fromEntries(SET_KEYS.map((k) => [k, e[k]]))) === null && str(e.saved_at, 40);
export function checkLogs(d) {
  if (!isObj(d) || !Array.isArray(d.sets) || d.sets.length > 300 || !d.sets.every(ENTRY) || !Number.isInteger(d.total)) return null;
  return { sets: d.sets, total: d.total, truncated: d.truncated === true };
}
const nn = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ts = (v) => (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : null);
const SCORE = new Set(["SCORED", "PENDING_SCORE", "UNSCORABLE"]);
/** Allowlisted WHOOP view; unknown keys (and anything token-like) are dropped. Missing or unscored values stay null. */
export function checkWhoop(d) {
  if (!isObj(d)) return null;
  if (d.state === "not_connected") return { state: "not_connected" };
  if (d.state === "error") return { state: "error", code: typeof d.code === "string" && /^[a-z_]{1,40}$/.test(d.code) ? d.code : "whoop_unavailable" };
  if (d.state !== "connected" || !ts(d.observed_at)) return null;
  const st = (v) => (SCORE.has(v) ? v : null);
  const c = isObj(d.cycle) ? { id: nn(d.cycle.id), start: ts(d.cycle.start), end: ts(d.cycle.end), updated_at: ts(d.cycle.updated_at), score_state: st(d.cycle.score_state),
    strain: nn(d.cycle.strain), average_heart_rate: nn(d.cycle.average_heart_rate) } : null;
  const r = isObj(d.recovery) ? { updated_at: ts(d.recovery.updated_at), score_state: st(d.recovery.score_state), user_calibrating: d.recovery.user_calibrating === true,
    recovery_score: nn(d.recovery.recovery_score), resting_heart_rate: nn(d.recovery.resting_heart_rate), hrv_rmssd_milli: nn(d.recovery.hrv_rmssd_milli) } : null;
  const s = isObj(d.sleep) ? { start: ts(d.sleep.start), end: ts(d.sleep.end), updated_at: ts(d.sleep.updated_at), score_state: st(d.sleep.score_state), nap: d.sleep.nap === true,
    sleep_performance_percentage: nn(d.sleep.sleep_performance_percentage), asleep_milli: nn(d.sleep.asleep_milli), in_bed_milli: nn(d.sleep.in_bed_milli) } : null;
  if (c && (c.id === null || c.start === null)) return null;
  return { state: "connected", observedAt: d.observed_at, freshness: ["current", "stale", "no_data"].includes(d.freshness) ? d.freshness : "stale", cycle: c, recovery: r, sleep: s };
}

// ---- rest timer (pure; the page only re-renders from these values) ----
export function timerInit(seconds) { return { durationMs: seconds * 1000, remainingMs: seconds * 1000, startedAt: null }; }
export function timerRemaining(t, now) { return t.startedAt === null ? t.remainingMs : Math.max(0, t.remainingMs - (now - t.startedAt)); }
export function timerStart(t, now) { return t.startedAt !== null || t.remainingMs <= 0 ? t : { ...t, startedAt: now }; }
export function timerPause(t, now) { return t.startedAt === null ? t : { ...t, remainingMs: timerRemaining(t, now), startedAt: null }; }
export function timerReset(t, seconds = t.durationMs / 1000) { return timerInit(seconds); }
export function formatClock(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
