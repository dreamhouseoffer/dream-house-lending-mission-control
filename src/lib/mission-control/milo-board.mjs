// Milo Growth Board: pure, client-safe lane derivation. Read-only: nothing here moves, dispatches or publishes a card.
// Inputs are the Airtable feed (/api/milo-approvals, with a per-card content version computed server-side) and the
// supervisor's read-only board (/api/control/milo-board: the approved-queue monitor's own class/disposition/native facts
// per exact record id). The feed version is compared with the supervisor's snapshot version HERE, so a card edited after
// the supervisor's read is never shown as settled. Linkage is by exact record id only; titles are never matched.
//
// Approval is permission, not execution. Working needs a linked native run with verified liveness. Native "done" alone is
// Review (parent/Hermie review), never Done. Accepted drafts are Review for the owner (website not changed). Unknown or
// unreadable state goes to Needs You with an explicit Hermie recovery message — never an empty lane or a false Ready.

export const LANES = [
  { id: "ready", label: "Ready", hint: "Approved or queued — not started" },
  { id: "working", label: "Working", hint: "Linked worker verified live" },
  { id: "review", label: "Review", hint: "Output waiting for review — not published" },
  { id: "needs_you", label: "Needs You", hint: "Your input, or Hermie recovery" },
  { id: "done", label: "Done", hint: "Verified done or closed" },
];
export const LANE_IDS = LANES.map((l) => l.id);
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
 * holds more (a long spec), so the UI says "first line" instead of presenting it as the precise missing input.
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
  if (!d || d === "pending") return card(approval, "needs_you", "decide", { label: "Your decision", recovery: "owner",
    next: "Decide: approve (permission only), needs changes, or reject." });
  if (d === "needs changes") return card(approval, "needs_you", "revise", { label: "Milo revising", recovery: "hermie",
    next: "Milo/Hermie revise the card from your notes; it comes back for your decision." });
  if (d === "rejected") return card(approval, "done", "closed_rejected", { label: "Rejected — closed", next: "Closed. Nothing was executed." });
  return card(approval, "needs_you", "decide", { label: `Decision "${approval.decision}"`, recovery: "owner",
    next: "Unrecognised decision label — record approve, needs changes or reject." });
}

const unknownCard = (approval, why, extra = {}) => card(approval, "needs_you", "unknown", { label: "Unknown state", recovery: "hermie", unknown: true,
  blocker: why, next: `Hermie: restore the supervisor read (${why}). Not ready, not running.`, ...extra });

/** Lane for one approved card with a supervisor record at the SAME version. Mirrors approved_queue_monitor classes. */
function fromClass(approval, rec) {
  const base = { taskId: primaryTask(rec), linked: rec.linked ?? [], supervisor: rec };
  const cls = rec.class ?? "unknown";
  const outcome = (rec.linked ?? []).find((t) => t.task_id === rec.attention_task)?.last_outcome ?? (rec.linked ?? []).at(-1)?.last_outcome ?? "none";
  if (cls === "consumed") return card(approval, "done", "verified_done", { ...base, label: "Verified done", next: "Accepted by Hermie after review. See the linked task for the result." });
  if (cls.startsWith("held:")) return { ...heldByDecision(approval), ...base };
  if (cls.startsWith("disposition_stale:")) {
    return card(approval, "needs_you", "reconcile", { ...base, label: "Needs reconciliation", recovery: "hermie", stale: true,
      blocker: `card changed after Hermie's "${cls.split(":")[1]}" decision`, next: "Hermie reconciles the changed card before anything continues. Not settled." });
  }
  switch (cls) {
    case "linked_active": {
      const t = (rec.linked ?? []).find((x) => x.status === "running" && x.liveness === "live");
      if (!t) return unknownCard(approval, "running class without a verified live linked run", base);
      // Raw monitor class stays linked_active; presentation follows the run's native phase (current-run claim from review
      // = independent reviewer, whatever the assignee). An unknown phase is shown as running work, never as the author.
      const phase = t.phase?.phase ?? "unknown";
      if (phase === "review") {
        return card(approval, "review", "hermie_reviewing", { ...base, taskId: t.task_id, runPhase: t.phase, label: "Hermie reviewing", recovery: "hermie",
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
      return card(approval, "needs_you", "worker_unverified", { ...base, taskId: t?.task_id ?? base.taskId, runPhase: t?.phase ?? null,
        label: reviewer ? "Reviewer not verified" : "Worker not verified", recovery: "hermie",
        blocker: `task says running; ${reviewer ? "reviewer" : "worker"} liveness ${t?.liveness ?? "unknown"}`,
        next: reviewer ? "Hermie checks the reviewer run. Not counted as review in progress." : "Hermie checks the worker. Not counted as working." });
    }
    case "duplicate_active":
      return card(approval, "needs_you", "duplicate", { ...base, label: "Duplicate tasks", recovery: "hermie", blocker: "more than one open linked task", next: "Hermie resolves the duplicate tasks." });
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
      // owner fact; Hermie checks it against the card/notes and asks you only if it is really missing.
      return card(approval, "needs_you", "blocked", { ...base, label: why?.owner === "owner" ? "Blocked — may need your input" : "Blocked — Hermie recovery",
        recovery: "hermie", blockReason: why,
        blocker: why ? `Blocked: ${why.reason}` : `linked task blocked (last run: ${outcome}); no reason recorded on the task`,
        next: why?.owner === "owner"
          ? "Worker asked for owner input. Hermie confirms it against the card and your notes, then asks you only if it is missing."
          : "Hermie recovers the block (retry, fix or re-scope). No input from you is needed yet." });
    }
    case "linked_review_needs_parent_review":
      return card(approval, "review", "hermie_review", { ...base, label: "Hermie review", recovery: "hermie", next: "Output in review by Hermie. Not published." });
    case "linked_done_needs_parent_review":
      return card(approval, "review", "hermie_review", { ...base, label: "Worker finished — review", recovery: "hermie", next: "Hermie reviews the output. Not Done or published until accepted." });
    case "linked_archived_needs_parent_review":
      return card(approval, "needs_you", "archived", { ...base, label: "Task archived", recovery: "hermie", blocker: "linked task archived without completion", next: "Hermie decides the next step." });
    case "draft_done_accepted":
      return card(approval, "review", "owner_review", { ...base, label: "Draft ready for you", recovery: "owner",
        next: "Internal draft accepted by Hermie — your review. The website has not changed." });
    case "needs_input":
    case "request_only": {
      const q = inputQuestion(approval);
      const qf = q ? { question: q.text, questionFull: q.full } : {};
      if (hasNotes(approval)) {
        // Saved notes exist: Hermie must read them before asking again. The request stays visible.
        return card(approval, "needs_you", cls, { ...base, ...qf, notesAck: true, label: "Your notes saved — Hermie reviewing", recovery: "hermie",
          next: "Saved notes present. Hermie reads them before asking you to repeat anything. No re-approval needed." });
      }
      return q
        ? card(approval, "needs_you", cls, { ...base, ...qf, label: cls === "request_only" ? "Request for you" : "Input needed", recovery: "owner",
            next: `Answer in notes${q.full ? "" : " (full request in details)"}. Approval is already recorded — no re-approval needed.` })
        : card(approval, "needs_you", cls, { ...base, label: "Input unclear", recovery: "hermie", blocker: "the card does not state the needed input",
            next: "Hermie adds the exact question to the card." });
    }
    case "parked":
      return card(approval, "done", "parked", { ...base, label: "Parked", next: "Reviewed; no work now." });
    case "excluded:done_label_without_linked_task":
      return card(approval, "needs_you", "label_only", { ...base, label: "Done label unproven", recovery: "hermie", blocker: "status says done but no linked task proves it",
        next: "Hermie verifies or corrects the label. Not counted as Done." });
    case "opportunity":
      return card(approval, "ready", "approved_not_started", { ...base, label: "Approved — not started", next: "Permission recorded; no linked task yet." });
    default:
      return unknownCard(approval, `unrecognised supervisor class "${cls}"`, base);
  }
}

/** One card -> lane. `ctx` = { board, boardError, records: Map(id -> record), signals: Map(id -> entry) }. */
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
    return card(approval, "needs_you", "not_read", { label: "Not read by Hermie", recovery: "hermie", stale: true, unknown: true,
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
      return card(approval, "needs_you", "notes_saved", { ...base, notesAck: true, label: "Your notes saved", blocker: "Hermie has not read this version yet",
        next: `Your notes are saved. Hermie re-reads the card next — no re-approval needed.${fresh}` });
    }
    return card(approval, "needs_you", "source_drift", { ...base, label: "Changed since read", blocker: "card changed after the supervisor's last read",
      next: `Hermie re-reads the card before acting. Not settled.${fresh}` });
  }
  return withDispositionFreshness(approval, rec);
}

/**
 * A settled (non-dispatched) disposition is only valid while its source version AND linked-task digest are unchanged.
 * The monitor's classify() then falls through to the raw linked/opportunity class, which must NOT read as fresh work,
 * a new owner request or Done. Precedence is kept exactly: consumed/held, then actual verified live/queued/duplicate/
 * unverified work supersede the stale disposition (flagged); everything else is explicit stale reconciliation.
 */
function withDispositionFreshness(approval, rec) {
  const d = rec.disposition;
  const cls = rec.class ?? "unknown";
  if (!d || d.kind === "dispatched" || cls === "consumed" || cls.startsWith("held:") || cls.startsWith("disposition_stale:")) return fromClass(approval, rec);
  if (d.observed_matches === null) return unknownCard(approval, `"${d.kind}" disposition without a linked-state digest`, { supervisor: rec, linked: rec.linked ?? [], taskId: primaryTask(rec) });
  if (d.version_current && d.observed_matches) return fromClass(approval, rec);
  const why = d.version_current ? "linked task state changed" : "card version changed";
  if (LIVE_PRECEDENCE.includes(cls)) {
    const c = fromClass(approval, rec);
    return { ...c, staleDisposition: { kind: d.kind, why, superseded: true } };
  }
  return card(approval, "needs_you", "reconcile", { supervisor: rec, linked: rec.linked ?? [], taskId: primaryTask(rec), label: "Needs reconciliation",
    recovery: "hermie", stale: true, staleDisposition: { kind: d.kind, why, superseded: false },
    blocker: `${why} after Hermie's "${d.kind}" decision`,
    next: "Hermie re-reviews before anything continues. Not settled — not new work, not Done." });
}

/**
 * Whole board. Every unique feed card appears in exactly one lane; duplicates and cross-source mismatches are explicit
 * anomalies. Returns { lanes, counts, anomalies, approvedPermission, total, state }.
 */
export function buildMiloBoard({ approvals, board = null, boardError = null, truncated = false }) {
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
  const ctx = { board, boardError, records, signals };
  const lanes = Object.fromEntries(LANE_IDS.map((id) => [id, []]));
  for (const a of seen.values()) {
    const c = classifyCard(a, ctx);
    lanes[LANE_IDS.includes(c.lane) ? c.lane : "needs_you"].push(c);
    if (decisionKey(a.decision) !== "approved" && (c.linked ?? []).some((t) => t.status === "running")) {
      anomalies.push({ kind: "running_without_approval", id: a.id, detail: `A linked task is running for ${a.id}, which is not approved.` });
    }
  }
  const counts = Object.fromEntries(LANE_IDS.map((id) => [id, lanes[id].length]));
  const needsOwner = lanes.needs_you.filter((c) => c.recovery === "owner").length;
  return {
    lanes, counts, anomalies, total: seen.size,
    needsYouSplit: { owner: needsOwner, hermie: lanes.needs_you.length - needsOwner },
    unknown: Object.values(lanes).flat().filter((c) => c.unknown).length,
    approvedPermission: [...seen.values()].filter((a) => decisionKey(a.decision) === "approved").length,
    state: board ? "ok" : "supervisor_unreadable",
  };
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
