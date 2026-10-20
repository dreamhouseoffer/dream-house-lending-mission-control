// Contract tests for the Milo Growth Board lane derivation. All cards, ids, versions and supervisor states are SYNTHETIC.
import test from "node:test";
import assert from "node:assert/strict";
import { LANE_IDS, LANES, OWNER_LANES, QUESTION_MAX, defaultLane, boardIsStale, buildMiloBoard, classifyCard, decisionOp, effectMessage, inputQuestion, isRetryable, outputKey, settleOutputRead } from "../src/lib/mission-control/milo-board.mjs";
import { checkOutputReview } from "../src/lib/mission-control/output-review-model.mjs";
import { MILO_BOARD_MAX_LINKED, MILO_BOARD_MAX_REASON, MILO_BOARD_MAX_RECORDS, checkMiloBoard } from "../src/lib/mission-control/milo-board-client.mjs";

const id = (n) => `recSYN${String(n).padStart(11, "0")}`;
const V = (n) => n.toString(16).padStart(16, "0");
const approval = (n, o = {}) => ({ id: id(n), title: `Synthetic card ${n}`, decision: "Approved", status: "In Progress", proposedChange: "", fonzNotes: "", version: V(n), ...o });
const task = (tid, o = {}) => ({ task_id: tid, assignee: "milo", blocker: null, status: "done", run: "last_completed", liveness: null, last_outcome: "completed", completed_at: 1, has_result: true, has_attachments: false, has_failure: false, ...o });
const rec = (n, cls, o = {}) => ({ record_id: id(n), version: V(n), decision: "approved", status: "in_progress", linked_digest: "none", linked_truncated: false, class: cls, read_at: "2026-10-19T10:00:00Z", read_source: "snapshot", attention_task: null, disposition: null, linked: [], ...o });
const board = (records, o = {}) => ({ schema: "mission-control.milo-board.v1", authority: "read_only", publication: "never_published_by_reader", supervisor_action: "quiet", supervisor_action_record: null, records_truncated: false, fetched_at: "2026-10-19T10:01:00Z", snapshot: { state: "ok", code: null, read_at: "2026-10-19T10:00:00Z" },
  native: { state: "ok", code: null }, dispositions: { state: "ok", code: null }, signals: { state: "ok", code: null, entries: [] }, records, orphan_links: [], ...o });
// Exact output-review authority (strict checkOutputReview), synthetic: a current, parent-reviewed, undecided v1 of the
// accepted task unless overridden. Draft text is a placeholder; only labels may reach a card.
const DG = (c) => c.repeat(64);
const rawReview = (t, cur = {}, top = {}) => ({ schema: "mission-control.output-review.v1", record_id: t.id, state: "ok", blocked: null, linked_tasks: [{ task_id: t.task, native_status: "done" }],
  current: { version_label: "v1", version_digest: DG("a"), task_id: t.task, task_title: "Synthetic draft", native_status: "done", is_revision: false, manifest_artifact_id: "a1", reviewable: true, not_reviewable: null,
    review: { reviewer: "hermie", reviewed_at: "2026-10-19T10:00:00Z", decision: "accepted", accepted: true, publication_authorized: false, covers_all_declared: true, source_id: t.id, source_version: null },
    primary: { artifact_id: "a2", name: "draft.md", sha256: DG("b"), size: 9, text: "SYNTHETIC", selection: "primary" }, units: [], unparsed_units: [], comparison: "unavailable",
    destinations: [], destinations_sha256: DG("c"), action: "approve_draft_wording_internal", files: [], decision: null, ...cur },
  previous: [], revision: null, next_step: { owner_needed: true, text: "Review the draft." }, history: [], problems: [],
  controls: { decide_unavailable: null, approve: true, reject: true, revise: true, revise_unavailable: null }, boundary: "Internal draft only.", ...top });
const receiptOf = (t, decision, o = {}) => ({ decision_id: "od_" + "1".repeat(24), decision, version_digest: DG("a"), version_label: "v1", task_id: t.task, manifest_artifact_id: "a1",
  primary_sha256: DG("b"), destinations_sha256: DG("c"), action: "approve_draft_wording_internal", notes: decision === "approve" ? null : "Synthetic owner notes here.", decided_at: "2026-10-19T11:00:00Z", ...o });
const okEntry = (t, review = checkOutputReview(rawReview(t)), o = {}) => ({ key: outputKey(t), gen: 1, state: "ok", review, pending: false, ...o });
const ctxOf = (b, outputs) => ({ board: b, records: new Map(b.records.map((x) => [x.record_id, x])), signals: new Map(b.signals.entries.map((s) => [s.record_id, s])), outputs });
// Pre-existing lane tests describe supervisor facts only; a review candidate is given its own exact valid undecided read.
const one = (a, r, b = board(r ? [r] : [])) => {
  const c = classifyCard(a, ctxOf(b, null));
  return c.outputTarget ? classifyCard(a, ctxOf(b, new Map([[a.id, okEntry(c.outputTarget)]]))) : c;
};

test("six fixed lanes in order: existing ids kept, Hermie added, owner lanes first", () => {
  assert.deepEqual(LANE_IDS, ["needs_you", "review", "ready", "working", "hermie", "done"]);
  assert.deepEqual(LANES.map((l) => l.label), ["Needs You", "Your Review", "Ready", "Working", "Hermie", "Done"]);
  assert.deepEqual(LANE_IDS.slice(0, 2), ["needs_you", "review"], "owner lanes lead so they are never scrolled off");
  assert.equal(LANES.find((l) => l.id === "hermie").hint, "Checks, recovery and preparation — not your homework");
  assert.match(LANES.find((l) => l.id === "review").hint, /not published/);
  assert.deepEqual(OWNER_LANES, ["needs_you", "review"]);
  for (const l of LANES) assert.doesNotMatch(l.hint, /your input,? or Hermie|input or recovery/i, `${l.id} hint mixes owner and Hermie`);
});

test("every lane: scenario table", () => {
  const live = task("t_aaaa0001", { status: "running", run: "run_live", liveness: "live", completed_at: 0, phase: { phase: "implementation", evidence: "current_claim" } });
  const cases = [
    [approval(1), rec(1, "opportunity"), "ready", "approved_not_started"],
    [approval(2), rec(2, "linked_queued", { linked: [task("t_aaaa0002", { status: "todo" })] }), "ready", "queued"],
    [approval(3), rec(3, "linked_active", { linked: [live] }), "working", "working"],
    [approval(4), rec(4, "linked_done_needs_parent_review", { attention_task: "t_aaaa0004", linked: [task("t_aaaa0004")] }), "hermie", "hermie_review"],
    [approval(5), rec(5, "draft_done_accepted", { disposition: { kind: "draft_done", version: V(5), task: "t_aaaa0005", version_current: true, observed_matches: true }, linked: [task("t_aaaa0005", { has_attachments: true })] }), "review", "owner_review"],
    [approval(6, { proposedChange: "Send the synthetic proof screenshot." }), rec(6, "request_only", { disposition: { kind: "request_only", version: V(6), task: null, version_current: true, observed_matches: true } }), "needs_you", "request_only"],
    [approval(7), rec(7, "consumed", { linked: [task("t_aaaa0007")] }), "done", "verified_done"],
    [approval(8, { decision: "Pending" }), null, "needs_you", "decide"],
    [approval(9, { decision: "Rejected" }), null, "done", "closed_rejected"],
    [approval(10), rec(10, "parked", { disposition: { kind: "parked", version: V(10), task: null, version_current: true, observed_matches: true } }), "done", "parked"],
    [approval(11), rec(11, "linked_blocked_needs_parent_review", { attention_task: "t_aaaa0011", linked: [task("t_aaaa0011", { status: "blocked", last_outcome: "blocked" })] }), "hermie", "blocked"],
  ];
  for (const [a, r, lane, kind] of cases) {
    const c = one(a, r);
    assert.equal(c.lane, lane, `${a.id} lane`);
    assert.equal(c.kind, kind, `${a.id} kind`);
  }
  const blocked = one(cases[10][0], cases[10][1]);
  assert.equal(blocked.recovery, "hermie");
  assert.match(blocked.blocker, /blocked \(last run: blocked\)/);
  assert.equal(blocked.taskId, "t_aaaa0011");
});

test("permission is not execution; source In Progress is not activity", () => {
  const c = one(approval(1, { status: "In Progress" }), rec(1, "opportunity"));
  assert.equal(c.lane, "ready");
  assert.notEqual(c.lane, "working");
  assert.match(c.next, /no linked task/);
});

test("Working only with a linked running task whose liveness is verified", () => {
  const unverified = one(approval(1), rec(1, "worker_not_verified", { linked: [task("t_aaaa0001", { status: "running", run: "run_unverifiable", liveness: "unverifiable" })] }));
  assert.equal(unverified.lane, "hermie");
  assert.equal(unverified.recovery, "hermie");
  assert.match(unverified.blocker, /liveness unverifiable/);
  // A class that claims active but no live run in the facts is unknown, never Working.
  const bogus = one(approval(2), rec(2, "linked_active", { linked: [task("t_aaaa0002", { status: "running", run: "run_not_live", liveness: "not_live" })] }));
  assert.equal(bogus.lane, "hermie");
  assert.equal(bogus.unknown, true);
});

test("native done alone is Hermie review, accepted draft is owner Review (website unchanged), consumed is Done", () => {
  const native = one(approval(1), rec(1, "linked_done_needs_parent_review", { attention_task: "t_aaaa0001", linked: [task("t_aaaa0001")] }));
  assert.deepEqual([native.lane, native.recovery], ["hermie", "hermie"]);
  assert.match(native.next, /Not Done or published/);
  const draft = one(approval(2), rec(2, "draft_done_accepted", { linked: [task("t_aaaa0002", { has_attachments: true })], disposition: { kind: "draft_done", version: V(2), task: "t_aaaa0002", version_current: true, observed_matches: true } }));
  assert.deepEqual([draft.lane, draft.kind, draft.label, draft.recovery], ["review", "owner_review", "Draft ready for you", "owner"]);
  assert.match(draft.next, /website has not changed/);
  assert.match(draft.next, /Acceptance is not publication/);
  assert.equal(one(approval(3), rec(3, "consumed")).lane, "done");
  for (const c of [native, draft]) assert.doesNotMatch(`${c.label} ${c.next}`, /\bpublished\b(?! until)|live on the site|website (was )?changed/i);
});

test("request_only: current version -> owner question from card facts; never invented", () => {
  const disp = { kind: "request_only", version: V(1), task: null, version_current: true, observed_matches: true };
  const c = one(approval(1, { proposedChange: "Provide the synthetic license number." }), rec(1, "request_only", { disposition: disp }));
  assert.equal(c.recovery, "owner");
  assert.equal(c.question, "Provide the synthetic license number.");
  assert.match(c.next, /no re-approval needed/);
  const missing = one(approval(1), rec(1, "request_only", { disposition: disp }));
  assert.equal(missing.recovery, "hermie");
  assert.equal(missing.question, null);
  assert.match(missing.blocker, /does not state/);
});

test("request_only source version drift: saved notes acknowledged, Hermie re-reads, no reapproval", () => {
  const disp = { kind: "request_only", version: V(1), task: null, version_current: true, observed_matches: true };
  const b = board([rec(1, "request_only", { disposition: disp })], { signals: { state: "ok", code: null, entries: [{ record_id: id(1), version: V(99), state: "needs_fresh_read" }] } });
  const c = one(approval(1, { version: V(99), fonzNotes: "Synthetic answer." }), null, b);
  assert.equal(c.kind, "notes_saved");
  assert.equal(c.notesAck, true);
  assert.equal(c.recovery, "hermie");
  assert.equal(c.lane, "hermie");
  assert.match(c.next, /no re-approval needed\. Fresh read requested/);
  const drift = one(approval(2, { version: V(98) }), rec(2, "opportunity"));
  assert.equal(drift.kind, "source_drift");
  assert.equal(drift.stale, true);
  assert.notEqual(drift.lane, "ready");
});

const disp = (n, kind, o = {}) => ({ kind, version: V(n), task: kind === "draft_done" ? "t_aaaa0009" : null, version_current: true, observed_matches: true, ...o });

test("request_only TASK DIGEST drift: stale reconciliation, never fresh opportunity, owner input or Done", () => {
  for (const cls of ["opportunity", "linked_done_needs_parent_review", "linked_review_needs_parent_review", "linked_archived_needs_parent_review", "excluded:done_label_without_linked_task"]) {
    const linked = cls === "opportunity" || cls.startsWith("excluded") ? [] : [task("t_aaaa0001", { status: cls.includes("archived") ? "archived" : cls.includes("review_needs") ? "review" : "done" })];
    const c = one(approval(1, { proposedChange: "Send the synthetic proof." }), rec(1, cls, { attention_task: linked[0]?.task_id ?? null, linked, disposition: disp(1, "request_only", { observed_matches: false }) }));
    assert.deepEqual([c.lane, c.kind, c.recovery, c.stale], ["hermie", "reconcile", "hermie", true], cls);
    assert.deepEqual(c.staleDisposition, { kind: "request_only", why: "linked task state changed", superseded: false });
    assert.match(c.next, /Not settled — not new work, not Done/);
    assert.match(c.blocker, /linked task state changed after Hermie's "request_only" decision/);
  }
});

test("draft_done TASK DIGEST drift: not Review/accepted any more, explicit reconciliation", () => {
  const c = one(approval(2), rec(2, "linked_done_needs_parent_review", { attention_task: "t_aaaa0009", linked: [task("t_aaaa0009")], disposition: disp(2, "draft_done", { observed_matches: false }) }));
  assert.deepEqual([c.lane, c.kind, c.recovery], ["hermie", "reconcile", "hermie"]);
  assert.doesNotMatch(c.label, /Draft ready/);
  const fine = one(approval(2), rec(2, "draft_done_accepted", { linked: [task("t_aaaa0009", { has_attachments: true })], disposition: disp(2, "draft_done") }));
  assert.deepEqual([fine.lane, fine.kind, fine.staleDisposition], ["review", "owner_review", null]);
  const parked = one(approval(3), rec(3, "opportunity", { disposition: disp(3, "parked", { observed_matches: false }) }));
  assert.deepEqual([parked.lane, parked.kind], ["hermie", "reconcile"], "a parked card with changed tasks is not Done or Ready");
});

test("actual live/queued work keeps monitor precedence over a stale settled disposition (flagged)", () => {
  const stale = disp(1, "request_only", { observed_matches: false });
  const live = one(approval(1), rec(1, "linked_active", { linked: [task("t_aaaa0001", { status: "running", run: "run_live", liveness: "live", phase: { phase: "implementation", evidence: "current_claim" } })], disposition: stale }));
  assert.deepEqual([live.lane, live.kind], ["working", "working"]);
  assert.deepEqual(live.staleDisposition, { kind: "request_only", why: "linked task state changed", superseded: true });
  const queued = one(approval(1), rec(1, "linked_queued", { linked: [task("t_aaaa0001", { status: "todo" })], disposition: stale }));
  assert.deepEqual([queued.lane, queued.staleDisposition.superseded], ["ready", true]);
  const retry = one(approval(1), rec(1, "linked_queued_after_failure", { linked: [task("t_aaaa0001", { status: "todo", last_outcome: "crashed" })], disposition: stale }));
  assert.equal(retry.lane, "ready");
  // "active" claimed but no verified live run is still unknown, never Working, even with precedence.
  const fake = one(approval(1), rec(1, "linked_active", { linked: [task("t_aaaa0001", { status: "running", run: "run_not_live", liveness: "not_live" })], disposition: stale }));
  assert.deepEqual([fake.lane, fake.unknown], ["hermie", true]);
  const unverified = one(approval(1), rec(1, "worker_not_verified", { linked: [task("t_aaaa0001", { status: "running", run: "run_unverifiable", liveness: "unverifiable" })], disposition: stale }));
  assert.deepEqual([unverified.lane, unverified.recovery, unverified.staleDisposition.superseded], ["hermie", "hermie", true]);
  // consumed outranks any disposition.
  assert.equal(one(approval(1), rec(1, "consumed", { disposition: stale })).lane, "done");
  // dispatched dispositions never carry a digest and are not "settled".
  const dispatched = one(approval(1), rec(1, "linked_queued", { linked: [task("t_aaaa0001", { status: "todo" })], disposition: { kind: "dispatched", version: V(1), task: "t_aaaa0001", version_current: true, observed_matches: null } }));
  assert.deepEqual([dispatched.lane, dispatched.staleDisposition], ["ready", null]);
  // a settled disposition without a digest is malformed -> unknown, not settled.
  assert.equal(one(approval(1), rec(1, "request_only", { disposition: disp(1, "request_only", { observed_matches: null }) })).unknown, true);
});

test("stale source version on the disposition is reconciliation even if the class disagrees", () => {
  const c = one(approval(1), rec(1, "request_only", { disposition: disp(1, "request_only", { version: V(77), version_current: false }) }));
  assert.deepEqual([c.lane, c.kind, c.staleDisposition.why], ["hermie", "reconcile", "card version changed"]);
  const mon = one(approval(1), rec(1, "disposition_stale:request_only", { disposition: disp(1, "request_only", { version: V(77), version_current: false }) }));
  assert.deepEqual([mon.lane, mon.kind], ["hermie", "reconcile"]);
});

test("settled request with saved notes: acknowledged, Hermie reads first, request stays visible", () => {
  for (const kind of ["request_only", "needs_input"]) {
    const c = one(approval(1, { proposedChange: "Send the synthetic proof screenshot.", fonzNotes: "Synthetic: already sent." }), rec(1, kind, { disposition: disp(1, kind) }));
    assert.deepEqual([c.lane, c.kind, c.notesAck, c.recovery], ["hermie", kind, true, "hermie"], kind);
    assert.equal(c.question, "Send the synthetic proof screenshot.");
    assert.match(c.next, /Saved notes present. Hermie reads them before asking you to repeat anything/);
    assert.match(c.label, /notes saved/i);
  }
  const blank = one(approval(1, { proposedChange: "Send it.", fonzNotes: "   " }), rec(1, "request_only", { disposition: disp(1, "request_only") }));
  assert.deepEqual([blank.lane, blank.notesAck, blank.recovery], ["needs_you", false, "owner"]);
});

test("request question: bounded first line of a long spec is never presented as the precise input — Hermie clarifies", () => {
  const spec = `Build the synthetic landing page\n${"Section details. ".repeat(80)}`;
  const q = inputQuestion({ proposedChange: spec });
  assert.deepEqual(q, { text: "Build the synthetic landing page", full: false });
  const c = one(approval(1, { proposedChange: spec }), rec(1, "needs_input", { disposition: disp(1, "needs_input") }));
  assert.deepEqual([c.lane, c.recovery, c.question, c.questionFull], ["hermie", "hermie", null, false]);
  assert.match(c.next, /one exact question.*Full original request in Details/);
  assert.equal(c.approval.proposedChange, spec, "the entire original request is kept for Details");
  const long = inputQuestion({ proposedChange: "x".repeat(500) });
  assert.equal(long.text.length, QUESTION_MAX);
  assert.equal(long.full, false);
  assert.deepEqual(inputQuestion({ proposedChange: "\n  Exact question?  \n" }), { text: "Exact question?", full: true });
  assert.equal(inputQuestion({ proposedChange: " \n " }), null);
});

test("blocked worker: exact bounded native reason and recovery owner", () => {
  const blk = (b) => rec(11, "linked_blocked_needs_parent_review", { attention_task: "t_aaaa0011", linked: [task("t_aaaa0011", { status: "blocked", last_outcome: "blocked", blocker: b })] });
  const owner = one(approval(11), blk({ kind: "needs_input", reason: "Need the synthetic WHOOP consent. token [redacted]", reason_source: "blocked_event" }));
  assert.equal(owner.blocker, "Blocked: Need the synthetic WHOOP consent. token [redacted]");
  assert.deepEqual(owner.blockReason, { reason: "Need the synthetic WHOOP consent. token [redacted]", kind: "needs_input", source: "blocked_event", owner: "owner" });
  assert.equal(owner.recovery, "hermie", "Hermie reviews every block first");
  assert.match(owner.label, /may need your input/);
  assert.match(owner.next, /asks you only if it is missing/);
  const hermie = one(approval(11), blk({ kind: "capability", reason: "capability: [path] missing", reason_source: "failure_excerpt" }));
  assert.equal(hermie.blockReason.owner, "hermie");
  assert.match(hermie.label, /Hermie recovery/);
  assert.match(hermie.next, /No input from you is needed yet/);
  const none = one(approval(11), blk(null));
  assert.match(none.blocker, /no reason recorded on the task/);
  const retry = one(approval(12), rec(12, "linked_queued_after_failure", { linked: [task("t_aaaa0012", { status: "todo", last_outcome: "crashed", blocker: { kind: null, reason: "worker crashed: out of memory", reason_source: "failure_excerpt" } })] }));
  assert.equal(retry.blocker, "last run crashed: worker crashed: out of memory");
  // Unsafe reason text never reaches the board: the client check refuses the whole payload.
  for (const reason of ["see /Users/x/secret.json", "https://host/x", "bell\u0007", "r".repeat(MILO_BOARD_MAX_REASON + 1)]) {
    assert.equal(checkMiloBoard(board([blk({ kind: "capability", reason, reason_source: "blocked_event" })])), null, reason);
  }
  assert.ok(checkMiloBoard(board([blk({ kind: "capability", reason: "r".repeat(MILO_BOARD_MAX_REASON), reason_source: "blocked_event" })])));
});

test("stale disposition is explicit reconciliation, not settled", () => {
  const c = one(approval(1), rec(1, "disposition_stale:draft_done", { disposition: { kind: "draft_done", version: V(50), task: "t_aaaa0001", version_current: false, observed_matches: true } }));
  assert.equal(c.lane, "hermie");
  assert.equal(c.kind, "reconcile");
  assert.match(c.next, /Not settled/);
});

test("no linked task, unknown class, unreadable and missing supervisor state", () => {
  assert.equal(one(approval(1), rec(1, "opportunity")).taskId, null);
  const unk = one(approval(2), rec(2, "something_new"));
  assert.deepEqual([unk.lane, unk.unknown, unk.recovery], ["hermie", true, "hermie"]);
  const notRead = one(approval(3), null);
  assert.deepEqual([notRead.lane, notRead.kind, notRead.unknown], ["hermie", "not_read", true]);
  const down = classifyCard(approval(4), { board: null, boardError: "hermes_unavailable", records: new Map() });
  assert.deepEqual([down.lane, down.unknown], ["hermie", true]);
  assert.match(down.next, /hermes_unavailable.*Not ready, not running/);
  for (const b of [board([], { native: { state: "error", code: "db_missing" } }), board([], { snapshot: { state: "missing", code: "missing", read_at: null } }), board([], { dispositions: { state: "invalid", code: "bad_shape" } })]) {
    const c = one(approval(5), null, b);
    assert.equal(c.unknown, true);
    assert.equal(c.lane, "hermie");
  }
  assert.equal(one(approval(6, { version: undefined }), rec(6, "opportunity")).unknown, true);
});

test("exact partitions, dedupe with anomaly, dynamic additional cards, no title matching", () => {
  const cards = Array.from({ length: 14 }, (_, i) => approval(i + 1, { title: "Same title" }));
  const records = cards.slice(0, 12).map((a, i) => rec(i + 1, ["opportunity", "consumed", "linked_queued"][i % 3]));
  records.push(rec(40, "opportunity"));
  const out = buildMiloBoard({ approvals: [...cards, cards[0]], board: board(records, { orphan_links: [{ record_id: id(41), task_ids: ["t_aaaa0041"] }] }) });
  const ids = Object.values(out.lanes).flat().map((c) => c.id);
  assert.equal(ids.length, 14);
  assert.equal(new Set(ids).size, 14);
  assert.deepEqual(new Set(ids), new Set(cards.map((c) => c.id)));
  assert.equal(Object.values(out.counts).reduce((a, b) => a + b, 0), 14);
  assert.deepEqual(out.anomalies.map((a) => a.kind).sort(), ["duplicate_card", "orphan_link", "snapshot_only"]);
  assert.equal(out.counts.hermie, 2, "2 cards beyond the snapshot are not-read, not ready");
  assert.equal(out.counts.needs_you, 0, "not-read cards are never owner homework");
  assert.equal(out.approvedPermission, 14);
  const bad = buildMiloBoard({ approvals: [{ id: "not-a-record" }, approval(1)], board: board([rec(1, "opportunity")]), truncated: true });
  assert.equal(bad.total, 1);
  assert.deepEqual(bad.anomalies.map((a) => a.kind), ["malformed_card", "feed_truncated"]);
});

test("supervisor unreadable: never empty, never falsely ready", () => {
  const out = buildMiloBoard({ approvals: [approval(1), approval(2, { decision: "Pending" }), approval(3, { decision: "Rejected" })], board: null, boardError: "offline" });
  assert.equal(out.state, "supervisor_unreadable");
  assert.equal(out.counts.ready, 0);
  assert.equal(out.counts.working, 0);
  assert.equal(out.unknown, 1);
  assert.equal(out.counts.needs_you, 1, "only the pending assignment decision is yours");
  assert.equal(out.counts.hermie, 1, "the unreadable approved card is Hermie recovery");
  assert.deepEqual(out.needsYouSplit, { owner: 1, hermie: 0 });
  assert.deepEqual(out.owner, { review: 0, needs_you: 1, total: 1 });
  assert.equal(out.hermie, 1);
});

test("running task for a non-approved card is an explicit anomaly", () => {
  const b = board([rec(1, "held:decision_pending", { linked: [task("t_aaaa0001", { status: "running", run: "run_live", liveness: "live" })] })]);
  const out = buildMiloBoard({ approvals: [approval(1, { decision: "Pending" })], board: b });
  assert.equal(out.lanes.needs_you[0].kind, "decide");
  assert.equal(out.anomalies[0].kind, "running_without_approval");
});

test("decision op: exact identity, serialized payload, retry resends identical bytes", () => {
  const a = approval(1, { fonzNotes: "saved" });
  const r = decisionOp(a, "approve", "draft");
  assert.equal(r.ok, true);
  assert.deepEqual(r.op, { id: id(1), action: "approve", baseVersion: V(1), body: JSON.stringify({ id: id(1), action: "approve", notes: "draft", clearNotes: false }) });
  const retry = { ...r.op };
  assert.equal(retry.body, r.op.body, "retry reuses the stored body");
  assert.deepEqual(decisionOp(a, "notes", ""), { ok: false, code: "confirm_clear" });
  const cleared = decisionOp(a, "notes", "", { confirmClear: true });
  assert.equal(JSON.parse(cleared.op.body).clearNotes, true);
  assert.equal(JSON.parse(decisionOp(approval(2), "notes", "").op.body).clearNotes, false);
  for (const s of [0, 408, 429, 500, 502, 503]) assert.equal(isRetryable(s), true, String(s));
  for (const s of [400, 401, 403, 404, 409]) assert.equal(isRetryable(s), false, String(s));
  assert.match(effectMessage("fields_saved", "notes"), /Notes saved/);
  assert.match(effectMessage("permission_recorded", "approve"), /permission only.*Nothing was started or published/);
});

test("staleness and client schema check", () => {
  assert.equal(boardIsStale(NaN, 1), true);
  assert.equal(boardIsStale(0, 4 * 60_000), false);
  assert.equal(boardIsStale(0, 6 * 60_000), true);
  assert.ok(checkMiloBoard(board([rec(1, "opportunity")])));
  assert.equal(checkMiloBoard({ ...board([]), schema: "x" }), null);
  assert.equal(checkMiloBoard({ ...board([]), records: [{ record_id: id(1) }] }), null);
});

test("client schema check: malformed shapes are explicit failures, never raw passthrough", () => {
  const good = board([rec(1, "linked_active", { linked: [task("t_aaaa0001", { status: "running", run: "run_live", liveness: "live" })], disposition: disp(1, "request_only", { observed_matches: false }) })]);
  const out = checkMiloBoard({ ...good, extra: "LEAK", records: [{ ...good.records[0], title: "LEAK" }] });
  assert.ok(out);
  assert.doesNotMatch(JSON.stringify(out), /LEAK/, "unknown keys are dropped, not passed through");
  const mut = (f) => { const b = structuredClone(good); f(b); return b; };
  const cases = {
    "class object": (b) => { b.records[0].class = { x: 1 }; },
    "class null": (b) => { b.records[0].class = null; },
    "linked null": (b) => { b.records[0].linked = null; },
    "linked item null": (b) => { b.records[0].linked = [null]; },
    "linked status object": (b) => { b.records[0].linked[0].status = {}; },
    "liveness bogus": (b) => { b.records[0].linked[0].liveness = "yes"; },
    "has_result string": (b) => { b.records[0].linked[0].has_result = "true"; },
    "dup linked": (b) => { b.records[0].linked.push(b.records[0].linked[0]); },
    "disposition array": (b) => { b.records[0].disposition = []; },
    "disposition kind": (b) => { b.records[0].disposition.kind = "approved"; },
    "observed_matches string": (b) => { b.records[0].disposition.observed_matches = "false"; },
    "bad version": (b) => { b.records[0].version = "zz"; },
    "bad record id": (b) => { b.records[0].record_id = "../x"; },
    "dup record": (b) => { b.records.push(b.records[0]); },
    "orphan task_ids null": (b) => { b.orphan_links = [{ record_id: id(9), task_ids: null }]; },
    "orphan bad task": (b) => { b.orphan_links = [{ record_id: id(9), task_ids: ["; rm"] }]; },
    "signals entries missing": (b) => { delete b.signals.entries; },
    "signal state": (b) => { b.signals.entries = [{ record_id: id(1), version: V(1), state: "whatever" }]; },
    "native state": (b) => { b.native.state = "fine"; },
    "snapshot null": (b) => { b.snapshot = null; },
    "publication claim": (b) => { b.publication = "published"; },
    "fetched_at": (b) => { b.fetched_at = 5; },
    "attention task": (b) => { b.records[0].attention_task = "nope"; },
  };
  for (const [why, f] of Object.entries(cases)) assert.equal(checkMiloBoard(mut(f)), null, why);
  // Max boundaries: exactly at the bound passes, one over fails.
  const recs = (n) => Array.from({ length: n }, (_, i) => rec(i + 1, "opportunity"));
  assert.ok(checkMiloBoard(board(recs(MILO_BOARD_MAX_RECORDS))));
  assert.equal(checkMiloBoard(board(recs(MILO_BOARD_MAX_RECORDS + 1))), null);
  const links = (n) => Array.from({ length: n }, (_, i) => task(`t_${(0xaa0000 + i).toString(16)}`));
  assert.ok(checkMiloBoard(board([rec(1, "duplicate_active", { linked: links(MILO_BOARD_MAX_LINKED) })])));
  assert.equal(checkMiloBoard(board([rec(1, "duplicate_active", { linked: links(MILO_BOARD_MAX_LINKED + 1) })])), null);
  // The checked board drives the real lane builder without crashing.
  const lanes = buildMiloBoard({ approvals: [approval(1)], board: out });
  assert.equal(lanes.lanes.working.length, 1);
});

test("reviewer phase: current-run claim from review is Hermie Review, not Milo Working (raw class preserved)", () => {
  const run = (phase, o = {}) => task("t_aaaa0001", { assignee: "default", status: "running", run: "run_live", liveness: "live", last_outcome: "review_requested", phase, ...o });
  // live reviewer, default assignee, claim source_status review (null metadata is irrelevant to the reader)
  const rev = one(approval(1), rec(1, "linked_active", { linked: [run({ phase: "review", evidence: "current_claim" })] }));
  assert.equal(rev.lane, "hermie");
  assert.equal(rev.kind, "hermie_reviewing");
  assert.equal(rev.label, "Hermie reviewing");
  assert.equal(rev.recovery, "hermie");
  assert.doesNotMatch(rev.label + rev.next, /Milo working|Working \(verified/);
  assert.equal(rev.supervisor.class, "linked_active", "monitor raw class is untouched");
  // normal implementation -> Working
  const impl = one(approval(2), rec(2, "linked_active", { linked: [run({ phase: "implementation", evidence: "current_claim" }, { task_id: "t_aaaa0002" })] }));
  assert.deepEqual([impl.lane, impl.kind], ["working", "working"]);
  // rework after changes_requested (reader: implementation from the current claim / prior outcome) -> normal author Working
  const rework = one(approval(3), rec(3, "linked_active", { linked: [run({ phase: "implementation", evidence: "prior_outcome" }, { task_id: "t_aaaa0003", last_outcome: "changes_requested" })] }));
  assert.deepEqual([rework.lane, rework.kind], ["working", "working"]);
  // unknown phase: running, but never claimed to be the author
  const unk = one(approval(4), rec(4, "linked_active", { linked: [run({ phase: "unknown", evidence: "none" }, { task_id: "t_aaaa0004" })] }));
  assert.deepEqual([unk.lane, unk.kind], ["working", "working_phase_unknown"]);
  assert.match(unk.next, /author or a reviewer is not recorded/);
  // reviewer whose liveness is not verified: not Review, not Working
  const nv = one(approval(5), rec(5, "worker_not_verified", { linked: [run({ phase: "review", evidence: "current_claim" }, { task_id: "t_aaaa0005", run: "run_not_live", liveness: "not_live" })] }));
  assert.deepEqual([nv.lane, nv.label], ["hermie", "Reviewer not verified"]);
  // disposition freshness precedence still applies first (stale settled request + live reviewer -> flagged, still Review)
  const stale = disp(6, "request_only", { observed_matches: false });
  const sv = one(approval(6), rec(6, "linked_active", { disposition: stale, linked: [run({ phase: "review", evidence: "current_claim" }, { task_id: "t_aaaa0006" })] }));
  assert.equal(sv.lane, "hermie");
  assert.equal(sv.staleDisposition.superseded, true);
  // source drift precedence: a changed card is held for re-read even with a live reviewer
  const drift = one(approval(7, { version: V(70) }), rec(7, "linked_active", { linked: [run({ phase: "review", evidence: "current_claim" }, { task_id: "t_aaaa0007" })] }));
  assert.deepEqual([drift.lane, drift.kind], ["hermie", "source_drift"]);
});

test("client schema check: runner phase bounded, running-only, missing = explicit unknown", () => {
  const b = (phase, status = "running") => board([rec(1, "linked_active", { linked: [task("t_aaaa0001", { status, run: "run_live", liveness: status === "running" ? "live" : null, phase })] })]);
  assert.deepEqual(checkMiloBoard(b({ phase: "review", evidence: "current_claim", x: "LEAK" })).records[0].linked[0].phase, { phase: "review", evidence: "current_claim" });
  assert.deepEqual(checkMiloBoard(b(undefined)).records[0].linked[0].phase, { phase: "unknown", evidence: "none" });
  assert.equal(checkMiloBoard(b(null, "done")).records[0].linked[0].phase, null);
  for (const [p, st] of [[{ phase: "reviewing", evidence: "current_claim" }, "running"], [{ phase: "review", evidence: "title" }, "running"],
    [{ phase: "unknown", evidence: "current_claim" }, "running"], [{ phase: "review", evidence: "none" }, "running"], ["review", "running"],
    [{ phase: "review", evidence: "current_claim" }, "done"]]) assert.equal(checkMiloBoard(b(p, st)), null, JSON.stringify([p, st]));
});

// ---- Explicit ownership: Your Review / Needs You are owner-only; everything Hermie owns is the Hermie lane -------------

const live = (tid, phase, o = {}) => task(tid, { status: "running", run: "run_live", liveness: "live", completed_at: 0, phase, ...o });
const ownerInvariant = (c, why) => {
  if (OWNER_LANES.includes(c.lane)) assert.equal(c.recovery, "owner", `${why}: owner lane card must be the owner's`);
  if (c.lane === "hermie") assert.equal(c.recovery, "hermie", `${why}: Hermie lane card must be Hermie's`);
  assert.ok(c.next && c.next.length > 10, `${why}: concise next action present`);
};

test("ownership matrix: every class lands in exactly one owner-truthful lane", () => {
  const blockedRec = (n, b) => rec(n, "linked_blocked_needs_parent_review", { attention_task: `t_bbbb${String(n).padStart(4, "0")}`, linked: [task(`t_bbbb${String(n).padStart(4, "0")}`, { status: "blocked", last_outcome: "blocked", blocker: b })] });
  const rows = [
    ["opportunity", approval(1), rec(1, "opportunity"), "ready", "approved_not_started"],
    ["queued", approval(2), rec(2, "linked_queued", { linked: [task("t_bbbb0002", { status: "todo" })] }), "ready", "queued"],
    ["queued after failure", approval(3), rec(3, "linked_queued_after_failure", { linked: [task("t_bbbb0003", { status: "todo", last_outcome: "crashed" })] }), "ready", "queued_retry"],
    ["author live", approval(4), rec(4, "linked_active", { linked: [live("t_bbbb0004", { phase: "implementation", evidence: "current_claim" })] }), "working", "working"],
    ["phase unknown live", approval(5), rec(5, "linked_active", { linked: [live("t_bbbb0005", { phase: "unknown", evidence: "none" })] }), "working", "working_phase_unknown"],
    ["reviewer live", approval(6), rec(6, "linked_active", { linked: [live("t_bbbb0006", { phase: "review", evidence: "current_claim" })] }), "hermie", "hermie_reviewing"],
    ["worker unverified", approval(7), rec(7, "worker_not_verified", { linked: [task("t_bbbb0007", { status: "running", run: "run_unverifiable", liveness: "unverifiable" })] }), "hermie", "worker_unverified"],
    ["reviewer unverified", approval(8), rec(8, "worker_not_verified", { linked: [task("t_bbbb0008", { status: "running", run: "run_not_live", liveness: "not_live", phase: { phase: "review", evidence: "current_claim" } })] }), "hermie", "worker_unverified"],
    ["duplicate", approval(9), rec(9, "duplicate_active", { linked: [task("t_bbbb0009", { status: "running" }), task("t_bbbb0010", { status: "todo" })] }), "hermie", "duplicate"],
    ["native raw done", approval(10), rec(10, "linked_done_needs_parent_review", { attention_task: "t_bbbb0011", linked: [task("t_bbbb0011")] }), "hermie", "hermie_review"],
    ["native raw review", approval(11), rec(11, "linked_review_needs_parent_review", { attention_task: "t_bbbb0012", linked: [task("t_bbbb0012", { status: "review" })] }), "hermie", "hermie_review"],
    ["archived", approval(12), rec(12, "linked_archived_needs_parent_review", { linked: [task("t_bbbb0013", { status: "archived" })] }), "hermie", "archived"],
    ["blocked capability", approval(13), blockedRec(13, { kind: "capability", reason: "capability missing", reason_source: "failure_excerpt" }), "hermie", "blocked"],
    ["blocked native needs_input", approval(14), blockedRec(14, { kind: "needs_input", reason: "Need the synthetic consent.", reason_source: "blocked_event" }), "hermie", "blocked"],
    ["label only", approval(15, { status: "Done" }), rec(15, "excluded:done_label_without_linked_task"), "hermie", "label_only"],
    ["monitor stale disposition", approval(16), rec(16, "disposition_stale:request_only", { disposition: disp(16, "request_only", { version: V(99), version_current: false }) }), "hermie", "reconcile"],
    ["unknown class", approval(17), rec(17, "brand_new_class"), "hermie", "unknown"],
    ["accepted draft current", approval(18), rec(18, "draft_done_accepted", { linked: [task("t_aaaa0009", { has_attachments: true })], disposition: disp(18, "draft_done") }), "review", "owner_review"],
    ["exact request current", approval(19, { proposedChange: "Send the synthetic proof screenshot." }), rec(19, "request_only", { disposition: disp(19, "request_only") }), "needs_you", "request_only"],
    ["exact input current", approval(20, { proposedChange: "What is the synthetic license number?" }), rec(20, "needs_input", { disposition: disp(20, "needs_input") }), "needs_you", "needs_input"],
    ["pending assignment", approval(21, { decision: "Pending" }), null, "needs_you", "decide"],
    ["needs changes rework", approval(22, { decision: "Needs Changes" }), null, "hermie", "revise"],
    ["unrecognised decision", approval(23, { decision: "Maybe later" }), null, "hermie", "decision_unrecognised"],
    ["rejected", approval(24, { decision: "Rejected" }), null, "done", "closed_rejected"],
    ["consumed", approval(25), rec(25, "consumed", { linked: [task("t_bbbb0025")] }), "done", "verified_done"],
    ["parked", approval(26), rec(26, "parked", { disposition: disp(26, "parked") }), "done", "parked"],
  ];
  for (const [why, a, r, lane, kind] of rows) {
    const c = one(a, r);
    assert.deepEqual([c.lane, c.kind], [lane, kind], why);
    ownerInvariant(c, why);
  }
  const nativeInput = one(rows[13][1], rows[13][2]);
  assert.equal(nativeInput.blockReason.owner, "owner", "native needs_input reason is kept exactly");
  assert.match(nativeInput.next, /Hermie confirms/, "but stays Hermie pending verification");
  // Membership + counts over the same set.
  const recs = rows.map((x) => x[2]).filter(Boolean);
  // The one review candidate gets its own exact valid undecided read (same facts as the row's task).
  const targets = buildMiloBoard({ approvals: rows.map((x) => x[1]), board: board(recs) }).outputTargets;
  assert.equal(targets.length, 1);
  const out = buildMiloBoard({ approvals: rows.map((x) => x[1]), board: board(recs), outputs: Object.fromEntries(targets.map((t) => [t.id, okEntry(t)])) });
  const all = Object.values(out.lanes).flat();
  assert.equal(all.length, rows.length);
  assert.equal(new Set(all.map((c) => c.id)).size, rows.length);
  for (const [lid, cards] of Object.entries(out.lanes)) for (const c of cards) { assert.equal(c.lane, lid); ownerInvariant(c, `board ${c.id}`); }
  const expect = rows.reduce((m, x) => ({ ...m, [x[3]]: (m[x[3]] ?? 0) + 1 }), {});
  assert.deepEqual(out.counts, Object.fromEntries(LANE_IDS.map((l) => [l, expect[l] ?? 0])));
  assert.deepEqual(out.owner, { review: 1, needs_you: 3, total: 4 });
  assert.equal(out.hermie, 14);
  assert.deepEqual(out.needsYouSplit, { owner: 3, hermie: 0 });
  assert.equal(Object.values(out.counts).reduce((x, y) => x + y, 0), out.total);
});

test("Your Review is only a current, verified Hermie-accepted draft; anything less is Hermie", () => {
  const a = approval(1);
  const base = { linked: [task("t_aaaa0009", { has_attachments: true })] };
  const ok = one(a, rec(1, "draft_done_accepted", { ...base, disposition: disp(1, "draft_done") }));
  assert.deepEqual([ok.lane, ok.label, ok.recovery], ["review", "Draft ready for you", "owner"]);
  assert.doesNotMatch(`${ok.label} ${ok.next}`, /\bpublished\b(?! until)|live on the site|website (was )?changed/i);
  const cases = {
    "no disposition": rec(1, "draft_done_accepted", base),
    "other kind": rec(1, "draft_done_accepted", { ...base, disposition: disp(1, "request_only") }),
    "dispatched": rec(1, "draft_done_accepted", { ...base, disposition: { kind: "dispatched", version: V(1), task: "t_aaaa0009", version_current: true, observed_matches: null } }),
  };
  for (const [why, r] of Object.entries(cases)) {
    const c = one(a, r);
    assert.deepEqual([c.lane, c.kind, c.recovery], ["hermie", "acceptance_unverified", "hermie"], why);
    assert.doesNotMatch(c.label, /Draft ready/, why);
  }
  // Version/digest drift of the acceptance never reaches Your Review.
  assert.equal(one(a, rec(1, "draft_done_accepted", { ...base, disposition: disp(1, "draft_done", { observed_matches: false }) })).lane, "hermie");
  assert.equal(one(a, rec(1, "draft_done_accepted", { ...base, disposition: disp(1, "draft_done", { version: V(77), version_current: false }) })).lane, "hermie");
  assert.equal(one(approval(1, { version: V(55) }), rec(1, "draft_done_accepted", { ...base, disposition: disp(1, "draft_done") })).lane, "hermie", "card changed since read");
  // Hermie's own review states are never Your Review.
  for (const cls of ["linked_done_needs_parent_review", "linked_review_needs_parent_review"]) assert.notEqual(one(a, rec(1, cls, { attention_task: "t_aaaa0009", ...base })).lane, "review", cls);
  assert.equal(ok.taskId, "t_aaaa0009", "Your Review card points at the accepted task");
});

test("Your Review needs the accepted task itself: linked, done, with attached output and a result — else exact Hermie reason", () => {
  const a = approval(1);
  const out = { has_attachments: true, has_result: true };
  const cases = {
    "missing task": [[], disp(1, "draft_done", { task: null }), "Hermie's draft acceptance names no linked task"],
    "no linked task at all": [[], disp(1, "draft_done"), "accepted task t_aaaa0009 is not linked to this card"],
    "wrong task": [[task("t_aaaa0008", out)], disp(1, "draft_done"), "accepted task t_aaaa0009 is not linked to this card"],
    "not done": [[task("t_aaaa0009", { ...out, status: "running" })], disp(1, "draft_done"), "accepted task t_aaaa0009 is running, not done"],
    "no attachments": [[task("t_aaaa0009", { ...out, has_attachments: false })], disp(1, "draft_done"), "accepted task t_aaaa0009 has no attached output"],
    "no result": [[task("t_aaaa0009", { ...out, has_result: false })], disp(1, "draft_done"), "accepted task t_aaaa0009 has no recorded result"],
  };
  for (const [why, [linked, d, blocker]] of Object.entries(cases)) {
    const c = one(a, rec(1, "draft_done_accepted", { linked, disposition: d }));
    assert.deepEqual([c.lane, c.kind, c.recovery, c.blocker], ["hermie", "acceptance_unverified", "hermie", blocker], why);
    assert.doesNotMatch(c.label, /Draft ready/, why);
  }
  // A different done task with output does not stand in for the accepted one; the exact one does.
  const right = one(a, rec(1, "draft_done_accepted", { linked: [task("t_aaaa0008", out), task("t_aaaa0009", out)], disposition: disp(1, "draft_done") }));
  assert.deepEqual([right.lane, right.kind, right.taskId], ["review", "owner_review", "t_aaaa0009"]);
});

test("initial assignment decisions: only pending/unset is owner Needs You, labelled as an assignment decision", () => {
  for (const decision of ["Pending", "", null, undefined, "  pending "]) {
    const c = one(approval(1, { decision }), null);
    assert.deepEqual([c.lane, c.kind, c.label, c.recovery], ["needs_you", "decide", "Assignment decision", "owner"], String(decision));
    assert.match(c.next, /original request.*Not a finished draft/);
  }
  const nc = one(approval(2, { decision: "Needs changes" }), rec(2, "held:decision_needs_changes"));
  assert.deepEqual([nc.lane, nc.kind, nc.recovery], ["hermie", "revise", "hermie"]);
  const rj = one(approval(3, { decision: "Rejected" }), rec(3, "held:decision_rejected"));
  assert.deepEqual([rj.lane, rj.kind], ["done", "closed_rejected"]);
  for (const decision of ["Maybe", "Approved?", "Hold"]) {
    const u = one(approval(4, { decision }), rec(4, "held:decision_other"));
    assert.deepEqual([u.lane, u.kind, u.recovery], ["hermie", "decision_unrecognised", "hermie"], decision);
    assert.ok(u.blocker.includes(`"${decision}"`), "the exact recorded label is shown");
    assert.match(u.next, /Not approved, not started/);
  }
});

test("requests: owner only with a current disposition AND one exact bounded single-line request AND no saved notes", () => {
  for (const kind of ["request_only", "needs_input"]) {
    const exact = "Send the synthetic proof screenshot.";
    const ok = one(approval(1, { proposedChange: exact }), rec(1, kind, { disposition: disp(1, kind) }));
    assert.deepEqual([ok.lane, ok.recovery, ok.question, ok.questionFull], ["needs_you", "owner", exact, true], kind);
    // No disposition / other-kind disposition: Hermie verifies (the request stays visible, exact).
    for (const [why, d] of [["none", null], ["other kind", disp(1, kind === "request_only" ? "needs_input" : "request_only")]]) {
      const c = one(approval(1, { proposedChange: exact }), rec(1, kind, { disposition: d }));
      assert.deepEqual([c.lane, c.recovery, c.label], ["hermie", "hermie", "Request not verified"], `${kind} ${why}`);
    }
    // Multiline (even short) and over-long single line: never an owner question; no invented first-line question.
    for (const pc of ["Line one?\nLine two.", "x".repeat(QUESTION_MAX + 1)]) {
      const c = one(approval(1, { proposedChange: pc }), rec(1, kind, { disposition: disp(1, kind) }));
      assert.deepEqual([c.lane, c.recovery, c.question, c.label], ["hermie", "hermie", null, "Hermie clarifying the request"], `${kind} ${pc.slice(0, 12)}`);
      assert.equal(c.approval.proposedChange, pc);
    }
    // Exactly at the bound is still exact.
    assert.equal(one(approval(1, { proposedChange: "y".repeat(QUESTION_MAX) }), rec(1, kind, { disposition: disp(1, kind) })).lane, "needs_you");
    // Missing input stays Hermie.
    const none = one(approval(1, { proposedChange: "  " }), rec(1, kind, { disposition: disp(1, kind) }));
    assert.deepEqual([none.lane, none.label], ["hermie", "Input unclear"]);
    // Saved notes, same version: Hermie reads them first.
    const notes = one(approval(1, { proposedChange: exact, fonzNotes: "Synthetic answer." }), rec(1, kind, { disposition: disp(1, kind) }));
    assert.deepEqual([notes.lane, notes.notesAck, notes.recovery, notes.question], ["hermie", true, "hermie", exact]);
    // Saved notes, stale version: notes acknowledged, Hermie re-reads.
    const stale = one(approval(1, { proposedChange: exact, fonzNotes: "Synthetic answer.", version: V(90) }), rec(1, kind, { disposition: disp(1, kind) }));
    assert.deepEqual([stale.lane, stale.kind, stale.notesAck, stale.stale], ["hermie", "notes_saved", true, true]);
    // Stale version, no notes: source drift.
    const drift = one(approval(1, { proposedChange: exact, version: V(90) }), rec(1, kind, { disposition: disp(1, kind) }));
    assert.deepEqual([drift.lane, drift.kind, drift.notesAck], ["hermie", "source_drift", false]);
  }
});

test("default focus prefers the owner's Needs You, then Your Review, then any non-empty lane", () => {
  const z = Object.fromEntries(LANE_IDS.map((l) => [l, 0]));
  assert.equal(defaultLane({ ...z, needs_you: 1, review: 2, hermie: 5 }), "needs_you");
  assert.equal(defaultLane({ ...z, review: 2, hermie: 5 }), "review");
  assert.equal(defaultLane({ ...z, hermie: 5, ready: 1 }), "hermie");
  assert.equal(defaultLane({ ...z, working: 1, hermie: 5 }), "working");
  assert.equal(defaultLane({ ...z, done: 3 }), "done", "never silently an empty tab while work exists");
  assert.equal(defaultLane(z), "needs_you");
  assert.equal(defaultLane(null), "needs_you");
});

// ---- Exact output-review consumption (t_7c437eb9 decision/list integration) --------------------------------------------
const acc = (n, o = {}) => rec(n, "draft_done_accepted", { linked: [task("t_aaaa0009", { has_attachments: true })], disposition: disp(n, "draft_done"), ...o });
const tgt = (n) => ({ id: id(n), version: V(n), task: "t_aaaa0009" });
const withOut = (a, r, entry) => classifyCard(a, ctxOf(board([r]), entry === undefined ? null : new Map([[a.id, entry]])));
const ownerCount = (a, r, entry) => buildMiloBoard({ approvals: [a], board: board([r]), outputs: entry ? { [a.id]: entry } : null }).owner.review;

test("output reads: only parent-accepted linked drafts are targets; nothing else is read", () => {
  const b = board([acc(1), rec(2, "linked_done_needs_parent_review", { linked: [task("t_aaaa0002")] }), rec(3, "opportunity"), acc(4, { disposition: disp(4, "draft_done", { task: null }) })]);
  const built = buildMiloBoard({ approvals: [approval(1), approval(2), approval(3), approval(4), approval(5, { decision: "" })], board: b });
  assert.deepEqual(built.outputTargets, [tgt(1)]);
  assert.equal(outputKey(tgt(1)), `${id(1)}|${V(1)}|t_aaaa0009`);
});

test("output read missing, loading or failed: Hermie, never owner Review", () => {
  const a = approval(1), r = acc(1);
  for (const [entry, kind] of [[undefined, "output_checking"], [{ key: outputKey(tgt(1)), gen: 1, state: "loading" }, "output_checking"],
    [{ key: outputKey(tgt(1)), gen: 1, state: "error", code: "unreachable" }, "output_unreadable"]]) {
    const c = withOut(a, r, entry);
    assert.equal(c.lane, "hermie"); assert.equal(c.kind, kind); assert.equal(c.recovery, "hermie");
    assert.equal(ownerCount(a, r, entry), 0);
  }
  assert.match(withOut(a, r, { key: outputKey(tgt(1)), gen: 1, state: "error", code: "unreachable" }).blocker, /unreachable/);
});

test("output read bound to exact record, card version and accepted task", () => {
  const a = approval(1), r = acc(1);
  const t = tgt(1);
  assert.equal(withOut(a, r, okEntry({ ...t, version: V(99) })).kind, "output_checking", "read for an older card version");
  assert.equal(withOut(a, r, okEntry({ ...t, task: "t_aaaa0008" })).kind, "output_checking", "read for another task");
  assert.equal(withOut(a, r, okEntry(t, checkOutputReview(rawReview({ ...t, id: id(2) })))).kind, "output_unreadable", "other record's review");
  assert.equal(withOut(a, r, okEntry(t, checkOutputReview(rawReview(t, { review: { ...rawReview(t).current.review, source_id: id(2) } })))).kind, "output_mismatch");
  assert.equal(withOut(a, r, okEntry(t, checkOutputReview(rawReview(t, { review: { ...rawReview(t).current.review, source_version: V(98) } })))).kind, "output_mismatch");
  assert.equal(withOut(a, r, okEntry(t, checkOutputReview(rawReview(t, { review: { ...rawReview(t).current.review, source_version: V(1) } })))).lane, "review", "matching source version");
  assert.equal(withOut(a, r, okEntry(t, checkOutputReview(rawReview(t, { task_id: "t_aaaa0007" })))).kind, "output_mismatch", "current draft of an unrelated task");
});

test("real API shape: server-checked review re-checked by the page keeps Your Review and its bindings", () => {
  const a = approval(1), r = acc(1), t = tgt(1);
  // Server check (output-review.ts) -> route JSON -> page re-check (page.tsx), as in the browser.
  const routed = (raw) => checkOutputReview(JSON.parse(JSON.stringify(checkOutputReview(raw))));
  const exact = routed(rawReview(t, { review: { ...rawReview(t).current.review, source_version: V(1) } }));
  assert.notEqual(exact, null);
  assert.equal(withOut(a, r, okEntry(t, exact)).lane, "review");
  assert.equal(ownerCount(a, r, okEntry(t, exact)), 1);
  assert.equal(withOut(a, r, okEntry(t, routed(rawReview(t, { review: { ...rawReview(t).current.review, source_version: V(98) } })))).kind, "output_mismatch", "version binding kept");
  assert.equal(withOut(a, r, okEntry(t, routed(rawReview(t, { task_id: "t_aaaa0007" })))).kind, "output_mismatch", "task binding kept");
  assert.equal(routed(rawReview(t, {}, { schema: "mission-control.output-review.v0" })), null, "malformed schema still fails");
});

test("valid current undecided parent-reviewed draft waiting for the owner is Your Review — labels only, no draft bytes", () => {
  const a = approval(1), r = acc(1);
  const c = withOut(a, r, okEntry(tgt(1)));
  assert.equal(c.lane, "review"); assert.equal(c.kind, "owner_review"); assert.equal(c.outputVersion, "v1"); assert.equal(c.label, "Draft ready for you");
  assert.equal(ownerCount(a, r, okEntry(tgt(1))), 1);
  assert.ok(![c.label, c.next, c.blocker ?? ""].join(" ").includes("SYNTHETIC"));
});

test("not decidable, not owner's next step, blocked, none, unresolved revision, unconfirmed decision: Hermie", () => {
  const a = approval(1), r = acc(1), t = tgt(1);
  const cases = {
    output_not_decidable: [rawReview(t, { reviewable: false, not_reviewable: "not_parent_reviewed" }), rawReview(t, { primary: null }), rawReview(t, {}, { controls: { decide_unavailable: "busy", approve: true, reject: true, revise: true, revise_unavailable: null } })],
    output_not_owner: [rawReview(t, {}, { next_step: { owner_needed: false, text: "Hermie re-checks the files." } })],
    output_blocked: [rawReview(t, {}, { state: "blocked", blocked: { code: "current_output_invalid", task_id: t.task } })],
    output_missing: [rawReview(t, {}, { state: "none", current: null })],
    output_revision: [rawReview(t, {}, { revision: { state: "queued", label: "Revision queued — t_aaaa000a", native_status: "todo", requested_against_version: DG("a"), requested_against_label: "v1", source_task_id: t.task, revision_task_id: "t_aaaa000a", attempts: 1, requested_at: "2026-10-19T11:00:00Z", run_id: null } })],
  };
  for (const [kind, raws] of Object.entries(cases)) for (const raw of raws) {
    const review = checkOutputReview(raw);
    assert.ok(review, kind);
    const c = withOut(a, r, okEntry(t, review));
    assert.equal(c.kind, kind); assert.equal(c.lane, "hermie"); assert.equal(ownerCount(a, r, okEntry(t, review)), 0);
  }
  const p = withOut(a, r, okEntry(t, undefined, { pending: true }));
  assert.equal(p.kind, "output_unconfirmed"); assert.equal(p.lane, "hermie");
  assert.equal(ownerCount(a, r, okEntry(t, undefined, { pending: true })), 0);
});

test("exact current decision: approve/reject/revise leave Your Review with truthful Hermie labels", () => {
  const a = approval(1), r = acc(1), t = tgt(1);
  const decided = (decision, top = {}) => okEntry(t, checkOutputReview(rawReview(t, { decision: receiptOf(t, decision) }, { next_step: { owner_needed: false, text: "Hermie next." }, ...top })));
  const ap = withOut(a, r, decided("approve"));
  assert.equal(ap.lane, "hermie"); assert.equal(ap.label, "Wording accepted — release not authorized"); assert.match(ap.next, /not authorized/);
  const rj = withOut(a, r, decided("reject"));
  assert.equal(rj.lane, "hermie"); assert.equal(rj.label, "Draft rejected — Hermie next step");
  const rvq = withOut(a, r, decided("revise", { revision: { state: "queued", label: "Revision queued — t_aaaa000a", native_status: "todo", requested_against_version: DG("a"), requested_against_label: "v1", source_task_id: t.task, revision_task_id: "t_aaaa000a", attempts: 1, requested_at: "2026-10-19T11:00:00Z", run_id: null } }));
  assert.equal(rvq.lane, "hermie"); assert.equal(rvq.label, "Revision queued — t_aaaa000a");
  const rvu = withOut(a, r, decided("revise"));
  assert.equal(rvu.label, "Revision requested — handoff not confirmed");
  for (const c of [ap, rj, rvq, rvu]) { assert.notEqual(c.lane, "working"); assert.doesNotMatch(c.label, /running|working/i); }
  for (const d of ["approve", "reject", "revise"]) assert.equal(ownerCount(a, r, decided(d)), 0, d);
  // Even with owner_needed left true, an exact current decision is never owner homework.
  assert.equal(withOut(a, r, okEntry(t, checkOutputReview(rawReview(t, { decision: receiptOf(t, "reject") })))).lane, "hermie");
  // A decision receipt for another version digest is not trusted as the current state.
  assert.equal(withOut(a, r, okEntry(t, checkOutputReview(rawReview(t, { decision: receiptOf(t, "approve", { version_digest: DG("d") }) })))).kind, "output_mismatch");
});

test("newer parent-reviewed undecided v2 returns to Your Review; an older read cannot restore the old state", () => {
  const a = approval(1), t = tgt(1);
  const r = acc(1, { linked: [task("t_aaaa0009", { has_attachments: true }), task("t_aaaa000a", { has_attachments: true, completed_at: 2 })] });
  const v1Revised = okEntry(t, checkOutputReview(rawReview(t, { decision: receiptOf(t, "revise") }, { next_step: { owner_needed: false, text: "Revision queued." } })), { gen: 1 });
  const v2 = okEntry(t, checkOutputReview(rawReview(t, { version_label: "v2", version_digest: DG("e"), task_id: "t_aaaa000a", is_revision: true }, {
    previous: [{ version_label: "v1", version_digest: DG("a"), task_id: t.task, is_revision: false, primary_sha256: DG("b"), decision: receiptOf(t, "revise") }],
    revision: { state: "produced", label: "Revision produced v2", native_status: "done", requested_against_version: DG("a"), requested_against_label: "v1", source_task_id: t.task, revision_task_id: "t_aaaa000a", attempts: 1, requested_at: "2026-10-19T11:00:00Z", run_id: null } })), { gen: 2 });
  assert.equal(withOut(a, r, v1Revised).lane, "hermie");
  const c2 = withOut(a, r, v2);
  assert.equal(c2.lane, "review"); assert.equal(c2.outputVersion, "v2"); assert.equal(c2.taskId, "t_aaaa000a");
  // v2 of a task that is NOT linked done to this card is not this card's accepted work.
  assert.equal(withOut(a, acc(1), v2).kind, "output_mismatch");
  // Generation + binding: an older answer arriving after a newer one changes nothing; a read for a changed binding is dropped.
  let outputs = {};
  outputs = settleOutputRead(outputs, a.id, v2, 2, outputKey(t));
  assert.equal(settleOutputRead(outputs, a.id, v1Revised, 2, outputKey(t)), outputs, "stale generation dropped");
  assert.equal(settleOutputRead(outputs, a.id, { ...v2, gen: 3 }, 3, outputKey({ ...t, version: V(5) })), outputs, "changed binding dropped");
  assert.equal(buildMiloBoard({ approvals: [a], board: board([r]), outputs }).owner.review, 1);
  // ...and the reverse order: the newest (decided) read wins over an older undecided one arriving late.
  let later = settleOutputRead({}, a.id, { ...v1Revised, gen: 4 }, 4, outputKey(t));
  later = settleOutputRead(later, a.id, { ...v2, gen: 3 }, 4, outputKey(t));
  assert.equal(buildMiloBoard({ approvals: [a], board: board([r]), outputs: later }).owner.review, 0);
});
