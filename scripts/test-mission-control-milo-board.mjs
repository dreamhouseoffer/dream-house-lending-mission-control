// Contract tests for the Milo Growth Board lane derivation. All cards, ids, versions and supervisor states are SYNTHETIC.
import test from "node:test";
import assert from "node:assert/strict";
import { LANE_IDS, LANES, QUESTION_MAX, boardIsStale, buildMiloBoard, classifyCard, decisionOp, effectMessage, inputQuestion, isRetryable } from "../src/lib/mission-control/milo-board.mjs";
import { MILO_BOARD_MAX_LINKED, MILO_BOARD_MAX_REASON, MILO_BOARD_MAX_RECORDS, checkMiloBoard } from "../src/lib/mission-control/milo-board-client.mjs";

const id = (n) => `recSYN${String(n).padStart(11, "0")}`;
const V = (n) => n.toString(16).padStart(16, "0");
const approval = (n, o = {}) => ({ id: id(n), title: `Synthetic card ${n}`, decision: "Approved", status: "In Progress", proposedChange: "", fonzNotes: "", version: V(n), ...o });
const task = (tid, o = {}) => ({ task_id: tid, assignee: "milo", blocker: null, status: "done", run: "last_completed", liveness: null, last_outcome: "completed", completed_at: 1, has_result: true, has_attachments: false, has_failure: false, ...o });
const rec = (n, cls, o = {}) => ({ record_id: id(n), version: V(n), decision: "approved", status: "in_progress", linked_digest: "none", linked_truncated: false, class: cls, read_at: "2026-10-19T10:00:00Z", read_source: "snapshot", attention_task: null, disposition: null, linked: [], ...o });
const board = (records, o = {}) => ({ schema: "mission-control.milo-board.v1", authority: "read_only", publication: "never_published_by_reader", supervisor_action: "quiet", supervisor_action_record: null, records_truncated: false, fetched_at: "2026-10-19T10:01:00Z", snapshot: { state: "ok", code: null, read_at: "2026-10-19T10:00:00Z" },
  native: { state: "ok", code: null }, dispositions: { state: "ok", code: null }, signals: { state: "ok", code: null, entries: [] }, records, orphan_links: [], ...o });
const one = (a, r, b = board(r ? [r] : [])) => classifyCard(a, { board: b, records: new Map(b.records.map((x) => [x.record_id, x])), signals: new Map(b.signals.entries.map((s) => [s.record_id, s])) });

test("five fixed lanes in order", () => {
  assert.deepEqual(LANE_IDS, ["ready", "working", "review", "needs_you", "done"]);
  assert.deepEqual(LANES.map((l) => l.label), ["Ready", "Working", "Review", "Needs You", "Done"]);
});

test("every lane: scenario table", () => {
  const live = task("t_aaaa0001", { status: "running", run: "run_live", liveness: "live", completed_at: 0, phase: { phase: "implementation", evidence: "current_claim" } });
  const cases = [
    [approval(1), rec(1, "opportunity"), "ready", "approved_not_started"],
    [approval(2), rec(2, "linked_queued", { linked: [task("t_aaaa0002", { status: "todo" })] }), "ready", "queued"],
    [approval(3), rec(3, "linked_active", { linked: [live] }), "working", "working"],
    [approval(4), rec(4, "linked_done_needs_parent_review", { attention_task: "t_aaaa0004", linked: [task("t_aaaa0004")] }), "review", "hermie_review"],
    [approval(5), rec(5, "draft_done_accepted", { disposition: { kind: "draft_done", version: V(5), task: "t_aaaa0005", version_current: true, observed_matches: true }, linked: [task("t_aaaa0005")] }), "review", "owner_review"],
    [approval(6, { proposedChange: "Send the synthetic proof screenshot." }), rec(6, "request_only", { disposition: { kind: "request_only", version: V(6), task: null, version_current: true, observed_matches: true } }), "needs_you", "request_only"],
    [approval(7), rec(7, "consumed", { linked: [task("t_aaaa0007")] }), "done", "verified_done"],
    [approval(8, { decision: "Pending" }), null, "needs_you", "decide"],
    [approval(9, { decision: "Rejected" }), null, "done", "closed_rejected"],
    [approval(10), rec(10, "parked", { disposition: { kind: "parked", version: V(10), task: null, version_current: true, observed_matches: true } }), "done", "parked"],
    [approval(11), rec(11, "linked_blocked_needs_parent_review", { attention_task: "t_aaaa0011", linked: [task("t_aaaa0011", { status: "blocked", last_outcome: "blocked" })] }), "needs_you", "blocked"],
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
  assert.equal(unverified.lane, "needs_you");
  assert.equal(unverified.recovery, "hermie");
  assert.match(unverified.blocker, /liveness unverifiable/);
  // A class that claims active but no live run in the facts is unknown, never Working.
  const bogus = one(approval(2), rec(2, "linked_active", { linked: [task("t_aaaa0002", { status: "running", run: "run_not_live", liveness: "not_live" })] }));
  assert.equal(bogus.lane, "needs_you");
  assert.equal(bogus.unknown, true);
});

test("native done alone is Review, accepted draft is owner Review (website unchanged), consumed is Done", () => {
  const native = one(approval(1), rec(1, "linked_done_needs_parent_review", { attention_task: "t_aaaa0001", linked: [task("t_aaaa0001")] }));
  assert.equal(native.lane, "review");
  assert.match(native.next, /Not Done or published/);
  const draft = one(approval(2), rec(2, "draft_done_accepted", { linked: [task("t_aaaa0002")] }));
  assert.equal(draft.recovery, "owner");
  assert.match(draft.next, /website has not changed/);
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
  assert.equal(c.lane, "needs_you");
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
    assert.deepEqual([c.lane, c.kind, c.recovery, c.stale], ["needs_you", "reconcile", "hermie", true], cls);
    assert.deepEqual(c.staleDisposition, { kind: "request_only", why: "linked task state changed", superseded: false });
    assert.match(c.next, /Not settled — not new work, not Done/);
    assert.match(c.blocker, /linked task state changed after Hermie's "request_only" decision/);
  }
});

test("draft_done TASK DIGEST drift: not Review/accepted any more, explicit reconciliation", () => {
  const c = one(approval(2), rec(2, "linked_done_needs_parent_review", { attention_task: "t_aaaa0009", linked: [task("t_aaaa0009")], disposition: disp(2, "draft_done", { observed_matches: false }) }));
  assert.deepEqual([c.lane, c.kind, c.recovery], ["needs_you", "reconcile", "hermie"]);
  assert.doesNotMatch(c.label, /Draft ready/);
  const fine = one(approval(2), rec(2, "draft_done_accepted", { linked: [task("t_aaaa0009")], disposition: disp(2, "draft_done") }));
  assert.deepEqual([fine.lane, fine.kind, fine.staleDisposition], ["review", "owner_review", null]);
  const parked = one(approval(3), rec(3, "opportunity", { disposition: disp(3, "parked", { observed_matches: false }) }));
  assert.deepEqual([parked.lane, parked.kind], ["needs_you", "reconcile"], "a parked card with changed tasks is not Done or Ready");
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
  assert.deepEqual([fake.lane, fake.unknown], ["needs_you", true]);
  const unverified = one(approval(1), rec(1, "worker_not_verified", { linked: [task("t_aaaa0001", { status: "running", run: "run_unverifiable", liveness: "unverifiable" })], disposition: stale }));
  assert.deepEqual([unverified.lane, unverified.recovery, unverified.staleDisposition.superseded], ["needs_you", "hermie", true]);
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
  assert.deepEqual([c.lane, c.kind, c.staleDisposition.why], ["needs_you", "reconcile", "card version changed"]);
  const mon = one(approval(1), rec(1, "disposition_stale:request_only", { disposition: disp(1, "request_only", { version: V(77), version_current: false }) }));
  assert.deepEqual([mon.lane, mon.kind], ["needs_you", "reconcile"]);
});

test("settled request with saved notes: acknowledged, Hermie reads first, request stays visible", () => {
  for (const kind of ["request_only", "needs_input"]) {
    const c = one(approval(1, { proposedChange: "Send the synthetic proof screenshot.", fonzNotes: "Synthetic: already sent." }), rec(1, kind, { disposition: disp(1, kind) }));
    assert.deepEqual([c.lane, c.kind, c.notesAck, c.recovery], ["needs_you", kind, true, "hermie"], kind);
    assert.equal(c.question, "Send the synthetic proof screenshot.");
    assert.match(c.next, /Saved notes present. Hermie reads them before asking you to repeat anything/);
    assert.match(c.label, /notes saved/i);
  }
  const blank = one(approval(1, { proposedChange: "Send it.", fonzNotes: "   " }), rec(1, "request_only", { disposition: disp(1, "request_only") }));
  assert.deepEqual([blank.notesAck, blank.recovery], [false, "owner"]);
});

test("request question: bounded first line of a long spec, never presented as the full precise input", () => {
  const spec = `Build the synthetic landing page\n${"Section details. ".repeat(80)}`;
  const q = inputQuestion({ proposedChange: spec });
  assert.deepEqual(q, { text: "Build the synthetic landing page", full: false });
  const c = one(approval(1, { proposedChange: spec }), rec(1, "needs_input", { disposition: disp(1, "needs_input") }));
  assert.equal(c.questionFull, false);
  assert.match(c.next, /full request in details/);
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
  assert.equal(c.lane, "needs_you");
  assert.equal(c.kind, "reconcile");
  assert.match(c.next, /Not settled/);
});

test("no linked task, unknown class, unreadable and missing supervisor state", () => {
  assert.equal(one(approval(1), rec(1, "opportunity")).taskId, null);
  const unk = one(approval(2), rec(2, "something_new"));
  assert.deepEqual([unk.lane, unk.unknown, unk.recovery], ["needs_you", true, "hermie"]);
  const notRead = one(approval(3), null);
  assert.deepEqual([notRead.lane, notRead.kind, notRead.unknown], ["needs_you", "not_read", true]);
  const down = classifyCard(approval(4), { board: null, boardError: "hermes_unavailable", records: new Map() });
  assert.deepEqual([down.lane, down.unknown], ["needs_you", true]);
  assert.match(down.next, /hermes_unavailable.*Not ready, not running/);
  for (const b of [board([], { native: { state: "error", code: "db_missing" } }), board([], { snapshot: { state: "missing", code: "missing", read_at: null } }), board([], { dispositions: { state: "invalid", code: "bad_shape" } })]) {
    const c = one(approval(5), null, b);
    assert.equal(c.unknown, true);
    assert.equal(c.lane, "needs_you");
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
  assert.equal(out.counts.needs_you, 2, "2 cards beyond the snapshot are not-read, not ready");
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
  assert.equal(out.counts.needs_you, 2);
  assert.deepEqual(out.needsYouSplit, { owner: 1, hermie: 1 });
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
  assert.equal(rev.lane, "review");
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
  assert.deepEqual([nv.lane, nv.label], ["needs_you", "Reviewer not verified"]);
  // disposition freshness precedence still applies first (stale settled request + live reviewer -> flagged, still Review)
  const stale = disp(6, "request_only", { observed_matches: false });
  const sv = one(approval(6), rec(6, "linked_active", { disposition: stale, linked: [run({ phase: "review", evidence: "current_claim" }, { task_id: "t_aaaa0006" })] }));
  assert.equal(sv.lane, "review");
  assert.equal(sv.staleDisposition.superseded, true);
  // source drift precedence: a changed card is held for re-read even with a live reviewer
  const drift = one(approval(7, { version: V(70) }), rec(7, "linked_active", { linked: [run({ phase: "review", evidence: "current_claim" }, { task_id: "t_aaaa0007" })] }));
  assert.deepEqual([drift.lane, drift.kind], ["needs_you", "source_drift"]);
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
