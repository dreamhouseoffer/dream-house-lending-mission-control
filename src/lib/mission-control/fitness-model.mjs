// Body OS: generic, data-free, browser-safe helpers shared by the protected /api/fitness routes and the /body-os page.
// No program text, health data or credentials live here; the program and logbook are private bridge files.

export const SET_KEYS = ["session_id", "exercise_id", "date", "kind", "set_number", "weight", "unit", "reps", "rir", "notes"];
export const MAX_SET_REQUEST_BYTES = 1024;
// In-place edit of one saved set: the row key, the revision it was read at, and the correctable values only.
export const EDIT_KEYS = ["key", "expected_revision", "weight", "unit", "reps", "rir", "notes"];
export const MAX_EDIT_REQUEST_BYTES = 1024;
export const REVISION_RE = /^[0-9a-f]{32}$/;
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

/** Strict shape check of one edit (the bridge re-checks values against the saved row's kind and the program). */
export function validateEditInput(data) {
  if (!isObj(data) || Object.keys(data).length !== EDIT_KEYS.length || !EDIT_KEYS.every((k) => Object.hasOwn(data, k))) return "invalid_fields";
  const { key, expected_revision, weight, unit, reps, rir, notes } = data;
  if (typeof key !== "string" || !IDEM_RE.test(key)) return "invalid_set_key";
  if (typeof expected_revision !== "string" || !REVISION_RE.test(expected_revision)) return "invalid_revision";
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1500 || Math.round(weight * 4) !== weight * 4) return "invalid_weight";
  if (unit !== "lb" && unit !== "kg") return "invalid_unit";
  if (!int(reps, 0, 100)) return "invalid_reps";
  if (!(rir === null || int(rir, 0, 10))) return "invalid_rir";
  if (typeof notes !== "string" || notes.length > 280 || CTRL.test(notes)) return "invalid_notes";
  return null;
}

/** Edit form strings for a saved row -> { input } or { error }. Identity and key come from the row, never the form. */
export function editDraftToInput(row, d) {
  const num = (s) => (typeof s === "string" && /^\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const rirBlank = String(d.rir ?? "").trim() === "";
  const input = { key: row.key, expected_revision: row.revision, weight: num(d.weight), unit: d.unit, reps: num(d.reps),
    rir: rirBlank && row.kind === "warmup" ? null : num(d.rir), notes: String(d.notes ?? "").trim() };
  if (rirBlank && row.kind === "working") return { error: "rir_required" };
  const error = validateEditInput(input);
  return error ? { error } : { input };
}

/**
 * The one edit operation to send. While an earlier operation is unresolved (pending) it is returned EXACTLY — same op key, same
 * serialized body — whatever the draft says; otherwise the draft is validated and a key is minted only for a valid input.
 */
export function editOperation(pending, row, draft, mintKey) {
  if (pending) return { op: pending };
  const parsed = editDraftToInput(row, draft);
  if ("error" in parsed) return { error: parsed.error };
  return { op: { opKey: mintKey(), body: JSON.stringify(parsed.input) } };
}

/** What the editor does with a classified edit answer: close (confirmed or stale), unlock (explicit refusal), or hold the exact op. */
export function editSettle(kind) {
  if (kind === "updated" || kind === "unchanged" || kind === "stale") return "close";
  if (kind === "refused") return "unlock";
  return "hold";
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
  invalid_set_key: "That saved set could not be identified. Reload the page.",
  invalid_revision: "That saved set could not be identified. Reload the page.",
  set_not_found: "That saved set is no longer in the logbook. Reload the page.",
  revision_conflict: "This set was changed elsewhere since you opened it. Nothing was overwritten.",
};

/**
 * Classify the answer to an edit POST. Only a 2xx "updated"/"unchanged" carrying the row confirms; 409 revision_conflict is a
 * stale edit (reload, nothing overwritten); other 4xx are refusals; anything else is NOT CONFIRMED (retry with the same op key).
 */
export function classifyEditResponse(status, data) {
  if (status >= 200 && status < 300 && isObj(data) && data.ok === true && (data.outcome === "updated" || data.outcome === "unchanged") && isObj(data.set)) {
    return { kind: data.outcome, deduplicated: data.deduplicated === true, set: data.set };
  }
  if (status === 409 && isObj(data) && data.code === "revision_conflict") return { kind: "stale" };
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    const code = isObj(data) && typeof data.code === "string" ? data.code : isObj(data) && typeof data.state === "string" ? data.state : "rejected";
    return { kind: "refused", code };
  }
  return { kind: "unconfirmed" };
}

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
  return { state: "connected", observedAt: d.observed_at, freshness: ["current", "stale", "no_data"].includes(d.freshness) ? d.freshness : "stale",
    cached: d.cached === true, cycle: c, recovery: r, sleep: s };
}

// ---- WHOOP gauges (pure; actual API fields only) ----
/** Official WHOOP recovery bands: 0-33 red, 34-66 yellow, 67-100 green. Unknown is null, never a colour. */
export function recoveryBand(score) {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) return null;
  return score < 34 ? "red" : score < 67 ? "yellow" : "green";
}
const STATE_STATUS = { PENDING_SCORE: "pending", UNSCORABLE: "unscorable" };
/**
 * Gauge view of one connected WHOOP read: { sleep, recovery, strain } each { status, fraction, display, tone }.
 * Sleep = sleep_performance_percentage (0-100), recovery = recovery_score with official bands, strain = native 0-21 score.
 * Missing/pending/unscorable/calibrating have no value and no colour; a stale read keeps its value but loses its colour.
 * retained = an earlier read still shown after a failed refresh: treated as stale (value kept, no colour). freshness no_data and
 * out-of-range or non-finite scores are unknown — never clipped to a full or empty ring.
 */
export function whoopGauges(w, { retained = false } = {}) {
  if (!isObj(w) || w.state !== "connected") return null;
  const stale = retained || w.freshness !== "current";
  const unknown = { status: "unknown", fraction: null, display: null, tone: null };
  const one = (rec, value, max, tone, fmt, extra = null) => {
    if (w.freshness === "no_data") return unknown;
    if (!rec) return { status: "missing", fraction: null, display: null, tone: null };
    if (rec.score_state !== "SCORED") return { status: STATE_STATUS[rec.score_state] ?? "unknown", fraction: null, display: null, tone: null };
    if (extra) return { status: extra, fraction: null, display: null, tone: null };
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) return unknown;
    const fraction = value / max;
    return { status: stale ? "stale" : "scored", fraction, display: fmt(value), tone: stale ? null : tone(value) };
  };
  const pct = (v) => `${Math.round(v)}%`;
  return {
    sleep: one(w.sleep, w.sleep?.sleep_performance_percentage, 100, () => "purple", pct),
    recovery: one(w.recovery, w.recovery?.recovery_score, 100, recoveryBand, pct, w.recovery?.user_calibrating ? "calibrating" : null),
    strain: one(w.cycle, w.cycle?.strain, 21, () => "blue", (v) => (Math.round(v * 10) / 10).toFixed(1)),
  };
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
