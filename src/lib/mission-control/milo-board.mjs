// Milo Growth Board: pure, client-safe lane derivation. Read-only: nothing here moves, dispatches or publishes a card.
// Inputs are the Airtable feed (/api/milo-approvals, with a per-card content version computed server-side) and the
// supervisor's read-only board (/api/control/milo-board: the approved-queue monitor's own class/disposition/native facts
// per exact record id). The feed version is compared with the supervisor's snapshot version HERE, so a card edited after
// the supervisor's read is never shown as settled. Linkage is by exact record id only; titles are never matched.
//
// Approval is permission, not execution. Working needs a linked native run with verified liveness. Ownership is explicit:
// Your Review holds only an exact current, parent-reviewed, undecided draft the output review says is waiting for the owner
// (website not changed); Needs You holds only an
// actual missing owner decision or a precise recorded question. Everything Hermie owns — native done/review, reviewer runs,
// blocks, stale/unknown/unverified/duplicate/archived state, rework and saved notes — is the Hermie lane with its next
// action. Unknown or unreadable state is Hermie recovery — never an empty lane, a false Ready or owner homework.

// Owner lanes first (always in view on desktop and phone), then the pipeline in flow order.
export const LANES = [
  { id: "needs_you", label: "Needs You", hint: "A decision or answer only you can give" },
  { id: "review", label: "Your Review", hint: "Draft accepted by Hermie for you — not published" },
  { id: "ready", label: "Ready", hint: "Approved or queued — not started" },
  { id: "working", label: "Working", hint: "Linked worker verified live" },
  { id: "hermie", label: "Hermie", hint: "Checks, recovery and preparation — not your homework" },
  { id: "done", label: "Done", hint: "Verified done or closed" },
];
export const LANE_IDS = LANES.map((l) => l.id);
/** Lanes whose every card is the owner's to act on. */
export const OWNER_LANES = ["needs_you", "review"];
// Default focus (phone tabs): the owner's own work first, then anything else that is non-empty — never a silent empty tab.
const FOCUS_ORDER = ["needs_you", "review", "working", "hermie", "ready", "done"];
export const POLL_MS = 60_000;
export const BOARD_STALE_MS = 5 * 60_000;
export const APPROVAL_BOUNDARY = "Approval records permission only. It does not start work, change the website or publish anything.";

const RECORD_RE = /^rec[A-Za-z0-9]{14}$/;
const VERSION_RE = /^[0-9a-f]{16}$/;

const decisionKey = (d) => String(d ?? "").trim().toLowerCase();

function card(approval, lane, kind, fields) {
  return { id: approval.id, title: approval.title || "Untitled card", lane, kind, recovery: null, blocker: null, unknown: false,
    notesAck: false, stale: false, staleDisposition: null, blockReason: null, question: null, questionFull: false,
    taskId: null, linked: [], supervisor: null, approval, ...fields };
}

const hasNotes = (approval) => Boolean((approval.fonzNotes || "").trim());
// Monitor precedence: these classes supersede a settled disposition whose linked-state digest changed (classify()).
const LIVE_PRECEDENCE = ["linked_active", "linked_queued", "linked_queued_after_failure", "duplicate_active", "worker_not_verified"];
export const QUESTION_MAX = 200;

function primaryTask(rec) {
  if (!rec) return null;
  if (rec.attention_task) return rec.attention_task;
  if (rec.disposition?.task) return rec.disposition.task;
  const linked = rec.linked ?? [];
  return linked.length ? [...linked].sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0) || (a.task_id < b.task_id ? -1 : 1)).at(-1).task_id : null;
}

/**
 * The request shown on the card comes only from existing card facts; nothing is invented. The feed has no separate
 * next-action/input field, so this is the FIRST non-empty line of Proposed Change, bounded. `full` is false when the card
 * holds more (a long spec): only a `full` request is a precise recorded question the owner can be asked; anything else
 * is Hermie's to clarify, with the whole original request kept in Details.
 */
export function inputQuestion(approval) {
  const lines = String(approval.proposedChange || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const first = lines[0];
  const text = first.length > QUESTION_MAX ? `${first.slice(0, QUESTION_MAX - 1).trimEnd()}\u2026` : first;
  return { text, full: lines.length === 1 && first.length <= QUESTION_MAX };
}

/** Exact native blocker (bridge-validated, bounded, redacted) for the task needing attention, or null. */
function blockerOf(rec, taskId) {
  const t = (rec.linked ?? []).find((x) => x.task_id === taskId) ?? null;
  const b = t?.blocker;
  if (!b || typeof b.reason !== "string" || !b.reason) return null;
  return { reason: b.reason, kind: b.kind ?? null, source: b.reason_source, owner: b.kind === "needs_input" ? "owner" : "hermie" };
}

function heldByDecision(approval) {
  const d = decisionKey(approval.decision);
  if (!d || d === "pending") return card(approval, "needs_you", "decide", { label: "Assignment decision", recovery: "owner",
    next: "Decide the original request: approve (permission only), needs changes, or reject. Not a finished draft." });
  if (d === "needs changes") return card(approval, "hermie", "revise", { label: "Milo revising", recovery: "hermie",
    next: "Milo/Hermie revise the card from your notes; it comes back for your decision." });
  if (d === "rejected") return card(approval, "done", "closed_rejected", { label: "Rejected — closed", next: "Closed. Nothing was executed." });
  return card(approval, "hermie", "decision_unrecognised", { label: "Decision label unrecognised", recovery: "hermie",
    blocker: `recorded decision "${approval.decision}" is not approve, needs changes or reject`,
    next: "Hermie checks the recorded decision before anything runs. Not approved, not started." });
}

/**
 * A finished draft is the owner's only when Hermie's current draft_done acceptance names the exact linked native task and
 * that task is done with both existing output markers (has_result AND has_attachments; both are plain booleans in the
 * feed, so neither is treated as optional). Returns the exact reason it is not, or null.
 */
function draftAcceptanceGap(rec, current) {
  if (!current) return "no current Hermie draft acceptance for this card version";
  const tid = rec.disposition.task;
  if (!tid) return "Hermie's draft acceptance names no linked task";
  const t = (rec.linked ?? []).find((x) => x.task_id === tid);
  if (!t) return `accepted task ${tid} is not linked to this card`;
  if (t.status !== "done") return `accepted task ${tid} is ${t.status}, not done`;
  if (t.has_attachments !== true) return `accepted task ${tid} has no attached output`;
  if (t.has_result !== true) return `accepted task ${tid} has no recorded result`;
  return null;
}

const unknownCard = (approval, why, extra = {}) => card(approval, "hermie", "unknown", { label: "Unknown state", recovery: "hermie", unknown: true,
  blocker: why, next: `Hermie: restore the supervisor read (${why}). Not ready, not running.`, ...extra });

/** Lane for one approved card with a supervisor record at the SAME version. Mirrors approved_queue_monitor classes. */
function fromClass(approval, rec, ctx = {}) {
  const base = { taskId: primaryTask(rec), linked: rec.linked ?? [], supervisor: rec };
  const cls = rec.class ?? "unknown";
  const outcome = (rec.linked ?? []).find((t) => t.task_id === rec.attention_task)?.last_outcome ?? (rec.linked ?? []).at(-1)?.last_outcome ?? "none";
  if (cls === "consumed") return card(approval, "done", "verified_done", { ...base, label: "Verified done", next: "Accepted by Hermie after review. See the linked task for the result." });
  if (cls.startsWith("held:")) return { ...heldByDecision(approval), ...base };
  if (cls.startsWith("disposition_stale:")) {
    return card(approval, "hermie", "reconcile", { ...base, label: "Needs reconciliation", recovery: "hermie", stale: true,
      blocker: `card changed after Hermie's "${cls.split(":")[1]}" decision`, next: "Hermie reconciles the changed card before anything continues. Not settled." });
  }
  // Owner-facing classes are only the owner's while Hermie's own disposition of that kind is current for this exact card
  // version and linked-task digest (the monitor's authority). Anything less is Hermie's to verify, never owner homework.
  const d = rec.disposition;
  const currentDisposition = (kind) => Boolean(d && d.kind === kind && d.version === approval.version && d.version_current === true && d.observed_matches === true);
  switch (cls) {
    case "linked_active": {
      const t = (rec.linked ?? []).find((x) => x.status === "running" && x.liveness === "live");
      if (!t) return unknownCard(approval, "running class without a verified live linked run", base);
      // Raw monitor class stays linked_active; presentation follows the run's native phase (current-run claim from review
      // = independent reviewer, whatever the assignee). An unknown phase is shown as running work, never as the author.
      const phase = t.phase?.phase ?? "unknown";
      if (phase === "review") {
        return card(approval, "hermie", "hermie_reviewing", { ...base, taskId: t.task_id, runPhase: t.phase, label: "Hermie reviewing", recovery: "hermie",
          next: "Independent reviewer is running (verified live). Milo is not working on it; nothing is published." });
      }
      return phase === "implementation"
        ? card(approval, "working", "working", { ...base, taskId: t.task_id, runPhase: t.phase, label: "Working (verified live)", next: "Worker is running. Follow the linked task." })
        : card(approval, "working", "working_phase_unknown", { ...base, taskId: t.task_id, runPhase: t.phase ?? null, label: "Running — phase unknown",
            next: "A verified live run is active; whether it is the author or a reviewer is not recorded. Follow the linked task." });
    }
    case "worker_not_verified": {
      const t = (rec.linked ?? []).find((x) => x.status === "running");
      const reviewer = t?.phase?.phase === "review";
      return card(approval, "hermie", "worker_unverified", { ...base, taskId: t?.task_id ?? base.taskId, runPhase: t?.phase ?? null,
        label: reviewer ? "Reviewer not verified" : "Worker not verified", recovery: "hermie",
        blocker: `task says running; ${reviewer ? "reviewer" : "worker"} liveness ${t?.liveness ?? "unknown"}`,
        next: reviewer ? "Hermie checks the reviewer run. Not counted as review in progress." : "Hermie checks the worker. Not counted as working." });
    }
    case "duplicate_active":
      return card(approval, "hermie", "duplicate", { ...base, label: "Duplicate tasks", recovery: "hermie", blocker: "more than one open linked task", next: "Hermie resolves the duplicate tasks." });
    case "linked_queued":
      return card(approval, "ready", "queued", { ...base, label: "Queued", next: "Linked task queued; no worker running yet." });
    case "linked_queued_after_failure": {
      const why = blockerOf(rec, base.taskId);
      return card(approval, "ready", "queued_retry", { ...base, label: "Queued after failure", blockReason: why,
        blocker: why ? `last run ${outcome}: ${why.reason}` : `last run: ${outcome}`, next: "Queued again after a failed run; not running yet." });
    }
    case "linked_blocked_needs_parent_review": {
      const why = blockerOf(rec, base.taskId);
      // Hermie always reviews a block first (monitor: parent_review). A native needs_input block says the worker wants an
      // owner fact; it stays Hermie's until Hermie checks it against the card/notes and records the exact question.
      return card(approval, "hermie", "blocked", { ...base, label: why?.owner === "owner" ? "Blocked — may need your input" : "Blocked — Hermie recovery",
        recovery: "hermie", blockReason: why,
        blocker: why ? `Blocked: ${why.reason}` : `linked task blocked (last run: ${outcome}); no reason recorded on the task`,
        next: why?.owner === "owner"
          ? "Worker asked for owner input. Hermie confirms it against the card and your notes, then asks you only if it is missing."
          : "Hermie recovers the block (retry, fix or re-scope). No input from you is needed yet." });
    }
    case "linked_review_needs_parent_review":
      return card(approval, "hermie", "hermie_review", { ...base, label: "Hermie review", recovery: "hermie", next: "Output in review by Hermie. Not published." });
    case "linked_done_needs_parent_review":
      return card(approval, "hermie", "hermie_review", { ...base, label: "Worker finished — Hermie review", recovery: "hermie", next: "Hermie reviews the output. Not Done or published until accepted." });
    case "linked_archived_needs_parent_review":
      return card(approval, "hermie", "archived", { ...base, label: "Task archived", recovery: "hermie", blocker: "linked task archived without completion", next: "Hermie decides the next step." });
    case "draft_done_accepted": {
      const why = draftAcceptanceGap(rec, currentDisposition("draft_done"));
      if (why) {
        return card(approval, "hermie", "acceptance_unverified", { ...base, label: "Acceptance not verified", recovery: "hermie",
          blocker: why, next: "Hermie re-checks the draft acceptance before it reaches you. Not published." });
      }
      return ownerDraftOrHermie(approval, rec, base, ctx.outputs);
    }
    case "needs_input":
    case "request_only": {
      const q = inputQuestion(approval);
      // Only a complete, bounded, single-line recorded request is a precise question; a first line of a spec is not.
      const qf = q?.full ? { question: q.text, questionFull: true } : {};
      if (!currentDisposition(cls)) {
        return card(approval, "hermie", cls, { ...base, ...qf, label: "Request not verified", recovery: "hermie",
          blocker: `no current Hermie "${cls}" decision for this card version`, next: "Hermie confirms what is needed before asking you. Not settled." });
      }
      if (hasNotes(approval)) {
        // Saved notes exist: Hermie must read them before asking again. The request stays visible.
        return card(approval, "hermie", cls, { ...base, ...qf, notesAck: true, label: "Your notes saved — Hermie reviewing", recovery: "hermie",
          next: "Saved notes present. Hermie reads them before asking you to repeat anything. No re-approval needed." });
      }
      if (q?.full) {
        return card(approval, "needs_you", cls, { ...base, ...qf, label: cls === "request_only" ? "Request for you" : "Input needed", recovery: "owner",
          next: "Answer in notes. Approval is already recorded — no re-approval needed." });
      }
      return q
        ? card(approval, "hermie", cls, { ...base, label: "Hermie clarifying the request", recovery: "hermie", blocker: "the recorded request is not one exact question",
            next: "Hermie turns the recorded request into one exact question before asking you. Full original request in Details." })
        : card(approval, "hermie", cls, { ...base, label: "Input unclear", recovery: "hermie", blocker: "the card does not state the needed input",
            next: "Hermie adds the exact question to the card." });
    }
    case "parked":
      return card(approval, "done", "parked", { ...base, label: "Parked", next: "Reviewed; no work now." });
    case "excluded:done_label_without_linked_task":
      return card(approval, "hermie", "label_only", { ...base, label: "Done label unproven", recovery: "hermie", blocker: "status says done but no linked task proves it",
        next: "Hermie verifies or corrects the label. Not counted as Done." });
    case "opportunity":
      return card(approval, "ready", "approved_not_started", { ...base, label: "Approved — not started", next: "Permission recorded; no linked task yet." });
    default:
      return unknownCard(approval, `unrecognised supervisor class "${cls}"`, base);
  }
}

// ---- Exact output-review consumption --------------------------------------------------------------------------------
// Hermie's current draft_done acceptance only makes a card a review CANDIDATE (an outputTarget). Whether a finished draft
// is actually waiting for the owner is the output-review authority (GET /api/control/output-reviews/:recordId, strictly
// re-checked by checkOutputReview), read per candidate and bound to the exact card id, card version and accepted task.
// Missing, loading, failed, mismatched, decided or unconfirmed reads are all Hermie's — never owner homework.

export const OUTPUT_READ_CONCURRENCY = 4;
/** Binding of one output read: an answer for another card version or accepted task never counts for this one. */
export const outputKey = (t) => `${t.id}|${t.version}|${t.task}`;

/**
 * Pure merge of one output read (page). Only the newest read for the card's CURRENT binding may land: an older
 * generation or a read for a since-changed version/task returns `outputs` unchanged.
 */
export function settleOutputRead(outputs, id, entry, latestGen, currentKey) {
  if (!entry || entry.gen !== latestGen || entry.key !== currentKey) return outputs;
  return { ...outputs, [id]: entry };
}

function ownerDraftOrHermie(approval, rec, base, outputs) {
  const tid = rec.disposition.task;
  const target = { id: approval.id, version: approval.version, task: tid };
  const at = { ...base, taskId: tid, outputTarget: target };
  const hermie = (kind, label, blocker, next, extra = {}) => card(approval, "hermie", kind, { ...at, label, recovery: "hermie", blocker, next, ...extra });
  const e = (outputs instanceof Map ? outputs.get(approval.id) : outputs?.[approval.id]) ?? null;
  if (!e || e.key !== outputKey(target) || e.state === "loading") {
    return hermie("output_checking", "Checking the draft", e && e.key !== outputKey(target) ? "the last draft read was for another card version or task" : "current draft and decision not read yet",
      "Hermie reads the exact current draft and any decision on it before it reaches you. Not yours yet.");
  }
  const r = e.review;
  if (e.state !== "ok" || !r || r.record_id !== approval.id) {
    return hermie("output_unreadable", "Draft review unreadable", `draft review unreadable: ${e.code ?? "unknown"}`, "Hermie restores the draft read. Not counted as waiting for you.");
  }
  if (e.pending) {
    return hermie("output_unconfirmed", "Your decision not confirmed", "a draft decision was sent but its outcome is not confirmed",
      "Open the card: Retry sends the same request. Not counted as waiting for you until it is confirmed.");
  }
  if (r.state === "blocked") return hermie("output_blocked", "Draft blocked", `draft review blocked: ${r.blocked?.code ?? "unknown"}`, "Hermie fixes the registered output before it reaches you.");
  const cur = r.current;
  if (r.state !== "ok" || !cur) return hermie("output_missing", "No registered draft", "no registered output for the accepted task", "Hermie registers the finished draft before it reaches you.");
  const ver = { outputVersion: cur.version_label };
  // The current version must be this card's accepted work: the accepted task itself, or a linked, done revision of it,
  // parent-reviewed against this card (and this card version, when the review records one).
  const own = cur.task_id === tid || (cur.is_revision && (rec.linked ?? []).some((t) => t.task_id === cur.task_id && t.status === "done"));
  const src = cur.review;
  if (!own || (src?.source_id != null && src.source_id !== approval.id) || (src?.source_version != null && src.source_version !== approval.version)) {
    return hermie("output_mismatch", "Draft does not match card", `current draft ${cur.version_label} is not bound to this card version and its accepted task`,
      "Hermie reconciles the draft with the card. Not yours yet.", ver);
  }
  const d = cur.decision;
  if (d && d.version_digest !== cur.version_digest) {
    return hermie("output_mismatch", "Draft does not match card", `recorded decision is not for current draft ${cur.version_label}`, "Hermie reconciles the decision record. Not yours yet.", ver);
  }
  if (d?.decision === "approve") {
    return hermie("output_approved", "Wording accepted — release not authorized", null, `You approved the wording of ${cur.version_label}. Release is not authorized; Hermie handles the next step. Nothing published.`, ver);
  }
  if (d?.decision === "reject") return hermie("output_rejected", "Draft rejected — Hermie next step", null, `You rejected ${cur.version_label}. Hermie decides the next step; nothing was published.`, ver);
  // A requested revision is shown with its real recorded state label; it is never inferred to be running.
  if (d?.decision === "revise") {
    return hermie("output_revision", r.revision?.label || "Revision requested — handoff not confirmed", null, `You asked for a revision of ${cur.version_label}. Hermie follows it up; nothing was published.`, ver);
  }
  if (r.revision && r.revision.state !== "produced") {
    return hermie("output_revision", r.revision.label, null, "A requested revision is not finished. Hermie follows it up; nothing was published.", ver);
  }
  if (!cur.reviewable || !cur.primary || r.controls.decide_unavailable || !r.controls.approve || !r.controls.reject) {
    return hermie("output_not_decidable", "Draft not decidable", `draft ${cur.version_label} not decidable: ${cur.not_reviewable ?? r.controls.decide_unavailable ?? "decision controls unavailable"}`,
      "Hermie completes the parent review of every file before it reaches you.", ver);
  }
  if (!r.next_step.owner_needed) return hermie("output_not_owner", "Hermie next step", null, r.next_step.text, ver);
  return card(approval, "review", "owner_review", { ...at, taskId: cur.task_id, ...ver, label: "Draft ready for you", recovery: "owner",
    next: "Internal draft accepted by Hermie — your review. Acceptance is not publication; the website has not changed." });
}

/**
 * One card -> lane. `ctx` = { board, boardError, records: Map(id -> record), signals: Map(id -> entry),
 * outputs: Map|object(id -> { key, gen, state: "loading"|"ok"|"error", review (checkOutputReview), code, pending }) }.
 */
export function classifyCard(approval, ctx) {
  const rec = ctx.records?.get(approval.id) ?? null;
  const approved = decisionKey(approval.decision) === "approved";
  if (!approved) {
    const held = heldByDecision(approval);
    return rec ? { ...held, linked: rec.linked ?? [], taskId: primaryTask(rec), supervisor: rec } : held;
  }
  if (!ctx.board) return unknownCard(approval, `supervisor state unreadable: ${ctx.boardError ?? "unknown"}`);
  if (ctx.board.native?.state !== "ok") return unknownCard(approval, `native board unreadable: ${ctx.board.native?.code ?? "unknown"}`);
  if (ctx.board.dispositions?.state !== "ok") return unknownCard(approval, `dispositions invalid: ${ctx.board.dispositions?.code ?? "unknown"}`);
  if (ctx.board.snapshot?.state !== "ok") return unknownCard(approval, `supervisor snapshot ${ctx.board.snapshot?.state ?? "unknown"}: ${ctx.board.snapshot?.code ?? "none"}`);
  if (!rec) {
    return card(approval, "hermie", "not_read", { label: "Not read by Hermie", recovery: "hermie", stale: true, unknown: true,
      blocker: "card is not in the supervisor snapshot", next: "Hermie runs a fresh read of this card. Not ready yet." });
  }
  if (typeof approval.version !== "string" || !VERSION_RE.test(approval.version)) {
    return unknownCard(approval, "card version unavailable", { supervisor: rec, linked: rec.linked ?? [], taskId: primaryTask(rec) });
  }
  if (approval.version !== rec.version) {
    const sig = ctx.signals?.get(approval.id);
    const base = { supervisor: rec, linked: rec.linked ?? [], taskId: primaryTask(rec), stale: true, recovery: "hermie" };
    const fresh = sig ? ` Fresh read ${sig.state === "needs_fresh_read" ? "requested" : sig.state.replace(/_/g, " ")}.` : "";
    if (["request_only", "needs_input"].includes(rec.disposition?.kind) && (approval.fonzNotes || "").trim()) {
      return card(approval, "hermie", "notes_saved", { ...base, notesAck: true, label: "Your notes saved", blocker: "Hermie has not read this version yet",
        next: `Your notes are saved. Hermie re-reads the card next — no re-approval needed.${fresh}` });
    }
    return card(approval, "hermie", "source_drift", { ...base, label: "Changed since read", blocker: "card changed after the supervisor's last read",
      next: `Hermie re-reads the card before acting. Not settled.${fresh}` });
  }
  return withDispositionFreshness(approval, rec, ctx);
}

/**
 * A settled (non-dispatched) disposition is only valid while its source version AND linked-task digest are unchanged.
 * The monitor's classify() then falls through to the raw linked/opportunity class, which must NOT read as fresh work,
 * a new owner request or Done. Precedence is kept exactly: consumed/held, then actual verified live/queued/duplicate/
 * unverified work supersede the stale disposition (flagged); everything else is explicit stale reconciliation.
 */
function withDispositionFreshness(approval, rec, ctx) {
  const d = rec.disposition;
  const cls = rec.class ?? "unknown";
  if (!d || d.kind === "dispatched" || cls === "consumed" || cls.startsWith("held:") || cls.startsWith("disposition_stale:")) return fromClass(approval, rec, ctx);
  if (d.observed_matches === null) return unknownCard(approval, `"${d.kind}" disposition without a linked-state digest`, { supervisor: rec, linked: rec.linked ?? [], taskId: primaryTask(rec) });
  if (d.version_current && d.observed_matches) return fromClass(approval, rec, ctx);
  const why = d.version_current ? "linked task state changed" : "card version changed";
  if (LIVE_PRECEDENCE.includes(cls)) {
    const c = fromClass(approval, rec, ctx);
    return { ...c, staleDisposition: { kind: d.kind, why, superseded: true } };
  }
  return card(approval, "hermie", "reconcile", { supervisor: rec, linked: rec.linked ?? [], taskId: primaryTask(rec), label: "Needs reconciliation",
    recovery: "hermie", stale: true, staleDisposition: { kind: d.kind, why, superseded: false },
    blocker: `${why} after Hermie's "${d.kind}" decision`,
    next: "Hermie re-reviews before anything continues. Not settled — not new work, not Done." });
}

/**
 * Whole board. Every unique feed card appears in exactly one lane; duplicates and cross-source mismatches are explicit
 * anomalies. Returns { lanes, counts, anomalies, approvedPermission, total, state }.
 */
export function buildMiloBoard({ approvals, board = null, boardError = null, truncated = false, outputs = null }) {
  const anomalies = [];
  const seen = new Map();
  for (const a of Array.isArray(approvals) ? approvals : []) {
    if (!a || typeof a.id !== "string" || !RECORD_RE.test(a.id)) { anomalies.push({ kind: "malformed_card", detail: "A feed card without a valid record id was skipped." }); continue; }
    if (seen.has(a.id)) { anomalies.push({ kind: "duplicate_card", id: a.id, detail: `Card ${a.id} appeared more than once in the feed; shown once.` }); continue; }
    seen.set(a.id, a);
  }
  if (truncated) anomalies.push({ kind: "feed_truncated", detail: "The card feed hit its page limit; some cards may be missing." });
  const records = new Map((board?.records ?? []).map((r) => [r.record_id, r]));
  const signals = new Map((board?.signals?.entries ?? []).map((s) => [s.record_id, s]));
  if (board) {
    for (const id of records.keys()) if (!seen.has(id)) anomalies.push({ kind: "snapshot_only", id, detail: `Supervisor knows ${id} but the current feed does not.` });
    for (const o of board.orphan_links ?? []) anomalies.push({ kind: "orphan_link", id: o.record_id, detail: `Task(s) ${o.task_ids.join(", ")} link to ${o.record_id}, which is not in the supervisor snapshot.` });
    if (board.records_truncated) anomalies.push({ kind: "board_truncated", detail: "The supervisor board hit its record limit." });
  }
  const ctx = { board, boardError, records, signals, outputs };
  const lanes = Object.fromEntries(LANE_IDS.map((id) => [id, []]));
  for (const a of seen.values()) {
    const c = classifyCard(a, ctx);
    // Owner lanes hold only owner-actionable cards; anything else (or an unknown lane) is Hermie's.
    const lane = LANE_IDS.includes(c.lane) && (!OWNER_LANES.includes(c.lane) || c.recovery === "owner") ? c.lane : "hermie";
    lanes[lane].push(lane === c.lane ? c : { ...c, lane });
    if (decisionKey(a.decision) !== "approved" && (c.linked ?? []).some((t) => t.status === "running")) {
      anomalies.push({ kind: "running_without_approval", id: a.id, detail: `A linked task is running for ${a.id}, which is not approved.` });
    }
  }
  const counts = Object.fromEntries(LANE_IDS.map((id) => [id, lanes[id].length]));
  const needsOwner = lanes.needs_you.filter((c) => c.recovery === "owner").length;
  return {
    lanes, counts, anomalies, total: seen.size,
    // Candidates whose exact output review must be read (no read for cards without a parent-accepted linked draft).
    outputTargets: Object.values(lanes).flat().filter((c) => c.outputTarget).map((c) => c.outputTarget),
    // Kept for compatibility; with explicit ownership every Needs You card is the owner's (hermie is always 0 here).
    needsYouSplit: { owner: needsOwner, hermie: lanes.needs_you.length - needsOwner },
    // What is actually yours vs Hermie's — never mixed into one number.
    owner: { review: counts.review, needs_you: counts.needs_you, total: counts.review + counts.needs_you },
    hermie: counts.hermie,
    unknown: Object.values(lanes).flat().filter((c) => c.unknown).length,
    approvedPermission: [...seen.values()].filter((a) => decisionKey(a.decision) === "approved").length,
    state: board ? "ok" : "supervisor_unreadable",
  };
}

/** Lane to focus first (phone tabs): the owner's Needs You / Your Review, else the first non-empty lane. */
export function defaultLane(counts) {
  return FOCUS_ORDER.find((id) => (counts?.[id] ?? 0) > 0) ?? "needs_you";
}

/** Board fetched long ago (failed refreshes keep the last data visible) is stale. */
export function boardIsStale(fetchedAtMs, nowMs, limit = BOARD_STALE_MS) {
  return !Number.isFinite(fetchedAtMs) || nowMs - fetchedAtMs > limit;
}

// ---- Owner decisions (unchanged PATCH contract) --------------------------------------------------------------------

/**
 * Exact decision op for one card. The serialized body is fixed at creation; a retry resends the SAME bytes for the same
 * id/action (the server re-reads the record, so a repeated approve is "already recorded", never a second approval).
 * Returns { ok:true, op } | { ok:false, code:"confirm_clear" } when saving empty notes would erase saved notes.
 */
export function decisionOp(approval, action, notesDraft, { confirmClear = false } = {}) {
  const note = typeof notesDraft === "string" ? notesDraft : "";
  let clearNotes = false;
  if (action === "notes" && !note && (approval.fonzNotes || "")) {
    if (!confirmClear) return { ok: false, code: "confirm_clear" };
    clearNotes = true;
  }
  return { ok: true, op: { id: approval.id, action, baseVersion: approval.version ?? null, body: JSON.stringify({ id: approval.id, action, notes: note, clearNotes }) } };
}

/** Failed saves worth retrying with the identical op: network loss, timeout, throttling, server errors. */
export function isRetryable(status) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function effectMessage(effect, action) {
  if (effect === "permission_recorded") return "Approval recorded as permission only. Nothing was started or published.";
  if (effect === "approval_already_recorded") return "Approval was already recorded; nothing changed.";
  if (effect === "decision_already_recorded") return "That decision was already recorded; nothing changed.";
  if (effect === "decision_recorded") return "Decision recorded.";
  if (effect === "fields_saved") return action === "notes" ? "Notes saved. Hermie reads them at the next fresh read." : "Saved.";
  return "Nothing changed.";
}
