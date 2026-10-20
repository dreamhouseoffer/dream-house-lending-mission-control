// Contract tests for the Milo output-review client. All records, tasks, digests and draft text are SYNTHETIC.
import test from "node:test";
import assert from "node:assert/strict";
import {
  OUTPUT_REVIEW_ACTION, OUTPUT_REVIEW_SCHEMA, checkOutputReview, decisionBody, fetchOutputReview, isUnknownOutcome, meaningfulNotes,
  outcomeMessage, postHandoffRetry, postOutputDecision, settleDecision, validateDecisionBody,
} from "../src/lib/mission-control/output-review-client.mjs";

const REC = "recSynthFixture01";
const D = (c) => c.repeat(64);
const receipt = (o = {}) => ({ decision_id: `od_${"1".repeat(24)}`, decision: "approve", version_digest: D("a"), version_label: "v1", task_id: "t_aaaa0001",
  manifest_artifact_id: "a3", primary_sha256: D("b"), destinations_sha256: D("c"), action: OUTPUT_REVIEW_ACTION, notes: null, principal: "owner_session",
  decided_at: "2026-10-19T10:00:00.000Z", ...o });
const current = (o = {}) => ({
  version_label: "v1", version_digest: D("a"), task_id: "t_aaaa0001", task_title: "Synthetic draft", native_status: "done", is_revision: false,
  manifest_artifact_id: "a3", reviewable: true,
  review: { artifact_id: "a4", reviewer: "synthetic-parent", reviewed_at: "2026-10-19T00:00:00Z", decision: "PASS synthetic internal acceptance; long reviewer decision text is carried in full rather than dropped when it exceeds eighty characters.", accepted: true, publication_authorized: false, website_changed: false, covers_all_declared: true, source_id: REC, source_version: "abcdef0123456789", limitations: [] },
  primary: { artifact_id: "a1", name: "draft.md", sha256: D("b"), size: 10, text: "# Synthetic\n", selection: "declared_file_with_exact_units" },
  units: [{ id: "U1", title: "Hero", context: null, pairs: [{ part: null, before_label: "Before", before: "Old.", after_label: "After", after: "New." }], extra: [] }],
  unparsed_units: [], comparison: "exact_units", destinations: [{ url: "https://example.test/page", label: "Candidate URL" }], destinations_sha256: D("c"),
  action: OUTPUT_REVIEW_ACTION, files: [{ artifact_id: "a1", name: "draft.md", sha256: D("b"), size: 10, role: "shown_draft" }], decision: null, ...o });
const payload = (o = {}) => ({ schema: OUTPUT_REVIEW_SCHEMA, record_id: REC, state: "ok", linked_tasks: [{ task_id: "t_aaaa0001", native_status: "done" }],
  current: current(), previous: [], revision: null, next_step: { owner_needed: true, text: "Decide on this exact draft." }, history: [], problems: [],
  blocked: null, controls: { decide_unavailable: null, approve: true, reject: true, revise: true, revise_unavailable: null }, boundary: "Synthetic boundary.", observed_at: "2026-10-19T10:00:00.000Z", ...o });
const cfg = { configured: true, origin: "http://127.0.0.1:9", secret: Buffer.alloc(32, 1) };
const transport = (status, data, seen) => async (req) => { if (seen) seen.push(req); return { status, contentType: "application/json", body: Buffer.from(JSON.stringify(data)) }; };

test("checkOutputReview: accepts the bridge contract, rebuilds field by field, rejects drift", () => {
  const r = checkOutputReview(payload());
  assert.equal(r.current.primary.text, "# Synthetic\n");
  assert.equal(r.current.units[0].pairs[0].after, "New.");
  assert.equal("principal" in (checkOutputReview(payload({ current: current({ decision: receipt() }) })).current.decision), false);
  assert.equal(checkOutputReview(payload({ schema: "other" })), null);
  assert.equal(checkOutputReview(payload({ current: current({ version_digest: "short" }) })), null);
  assert.equal(checkOutputReview(payload({ current: current({ destinations: [{ url: "javascript:alert(1)", label: "URL" }] }) })), null);
  assert.equal(checkOutputReview(payload({ current: current({ comparison: "guessed" }) })), null);
  assert.equal(checkOutputReview(payload({ revision: { state: "queued_by_owner" } })), null);
  assert.equal(checkOutputReview(payload({ state: "none", current: null })).current, null);
  assert.equal(checkOutputReview(payload()).current.review.decision.length > 80, true, "real-length parent review decisions are accepted");
});

test("controls fail closed: blocked state, gate reasons and unreviewed versions disable every decision", () => {
  const blocked = checkOutputReview(payload({ state: "blocked", blocked: { code: "current_output_invalid", task_id: "t_dddd0001" },
    controls: { decide_unavailable: "current_output_invalid", approve: true, reject: true, revise: true, revise_unavailable: null } }));
  assert.deepEqual([blocked.controls.approve, blocked.controls.reject, blocked.controls.revise], [false, false, false]);
  // Even if the bridge said approve:true, a gate reason wins.
  const gated = checkOutputReview(payload({ controls: { decide_unavailable: "revision_in_progress", approve: true, reject: true, revise: true, revise_unavailable: null } }));
  assert.equal(gated.controls.approve, false);
  // blocked state without the blocked detail (or vice versa) is a contract violation.
  assert.equal(checkOutputReview(payload({ state: "blocked" })), null);
  assert.equal(checkOutputReview(payload({ blocked: { code: "current_output_invalid", task_id: null } })), null);
  const unrev = checkOutputReview(payload({ current: current({ reviewable: false, not_reviewable: "review_not_accepted" }) }));
  assert.equal(unrev.current.not_reviewable, "review_not_accepted");
  assert.equal(checkOutputReview(payload({ current: current({ reviewable: false }) })), null, "unreviewable must say why");
  const rv = checkOutputReview(payload({ revision: { state: "running_unverified", label: "Native status says running, but no open native run is recorded", native_status: "running",
    requested_against_version: D("a"), requested_against_label: "v1", source_task_id: "t_aaaa0001", revision_task_id: "t_cccc0001", attempts: 1, requested_at: "2026-10-19T10:00:00.000Z", run_id: null } }));
  assert.equal(rv.revision.state, "running_unverified");
  assert.equal(decisionBody({ ...checkOutputReview(payload()).current, primary: null }, "approve", "").ok, false);
});

test("decisionBody binds the shown version; revise needs meaningful notes; unreviewed refused", () => {
  const cur = checkOutputReview(payload()).current;
  const a = decisionBody(cur, "approve", "");
  assert.deepEqual(a.body, { decision: "approve", task_id: "t_aaaa0001", version_digest: D("a"), manifest_artifact_id: "a3", primary_sha256: D("b"), destinations_sha256: D("c"), action: OUTPUT_REVIEW_ACTION, notes: "" });
  assert.equal(decisionBody(cur, "revise", "fix").code, "revision_notes_required");
  assert.equal(decisionBody(cur, "revise", "Shorten the hero sentence please.").ok, true);
  assert.equal(decisionBody({ ...cur, reviewable: false }, "approve", "").code, "not_parent_reviewed");
  assert.equal(decisionBody(cur, "publish", "").code, "invalid_input");
  assert.equal(meaningfulNotes("aaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(validateDecisionBody({ ...a.body, extra: 1 }), null);
  assert.equal(validateDecisionBody({ ...a.body, action: "publish" }), null);
  assert.deepEqual(validateDecisionBody(a.body), a.body);
});

test("roundtrip: server-checked review, as the GET route's JSON, re-checks in the page unchanged; drift still fails", async () => {
  // Exactly what page.tsx receives: fetchOutputReview (server) -> NextResponse.json({ ok, review }) -> res.json().
  const viaRoute = async (raw) => {
    const read = await fetchOutputReview(cfg, REC, { transport: transport(200, raw) });
    return read.ok ? JSON.parse(JSON.stringify({ ok: true, review: read.review })) : null;
  };
  // The live bridge (bridge/lib/output-reviews.js) sends no observed_at, so the first check normalizes it to null.
  for (const raw of [payload(), payload({ observed_at: undefined }), payload({ current: current({ decision: receipt() }), next_step: { owner_needed: false, text: "Hermie next." } }),
    payload({ state: "none", current: null }), payload({ state: "blocked", blocked: { code: "current_output_invalid", task_id: "t_dddd0001" } })]) {
    const data = await viaRoute(raw);
    const again = checkOutputReview(data.review);
    assert.notEqual(again, null, `page re-check of a ${raw.state} review`);
    assert.equal(again.schema, OUTPUT_REVIEW_SCHEMA);
    assert.deepEqual(again, data.review, "re-check is idempotent: no field gained, lost or changed");
    assert.equal(again.record_id, REC);
  }
  const data = await viaRoute(payload());
  assert.equal(data.review.current.review.source_version, "abcdef0123456789", "source version binding survives the roundtrip");
  assert.equal(data.review.current.task_id, "t_aaaa0001");
  assert.equal(checkOutputReview({ ...data.review, schema: "mission-control.output-review.v0" }), null, "wrong schema on the routed review");
  assert.equal(checkOutputReview({ ...data.review, schema: undefined }), null, "missing schema on the routed review");
  assert.equal(checkOutputReview({ ...data.review, current: { ...data.review.current, version_digest: "short" } }), null);
  assert.equal(checkOutputReview({ ...data.review, observed_at: "yesterday" }), null, "malformed observed_at still fails");
  assert.equal((await fetchOutputReview(cfg, REC, { transport: transport(200, payload({ schema: "other" })) })).code, "schema_mismatch");
});

test("signed calls: read, decision outcomes, unknown retry semantics, handoff retry (synthetic transport)", async () => {
  const seen = [];
  const read = await fetchOutputReview(cfg, REC, { transport: transport(200, payload(), seen) });
  assert.equal(read.ok, true);
  assert.equal(seen[0].target, `/v0/output-reviews/${REC}`);
  assert.equal((await fetchOutputReview(cfg, REC, { transport: transport(200, payload({ record_id: "recOtherFixture02" })) })).code, "schema_mismatch");
  const body = decisionBody(read.review.current, "approve", "").body;
  const key = "orv_synthetic_000000000001";
  const sent = [];
  const ok = await postOutputDecision(cfg, REC, body, key, { transport: transport(201, { replayed: false, receipt: receipt(), revision: null, next_step: { owner_needed: false, text: "Nothing was published." } }, sent) });
  assert.equal(ok.outcome, "saved");
  assert.equal(sent[0].headers["idempotency-key"], key);
  assert.equal(sent[0].target, `/v0/output-reviews/${REC}/decision`);
  assert.equal((await postOutputDecision(cfg, REC, body, key, { transport: transport(200, { replayed: true, receipt: receipt(), revision: null, next_step: { owner_needed: false, text: "x" } }) })).outcome, "replayed");
  const stale = await postOutputDecision(cfg, REC, body, key, { transport: transport(409, { error: "stale_version", current_version: D("e") }) });
  assert.deepEqual([stale.outcome, stale.code], ["refused", "stale_version"]);
  assert.match(outcomeMessage(stale.code), /newer draft/);
  const dup = settleDecision(409, { error: "already_decided", receipt: receipt() });
  assert.equal(dup.receipt.decision_id, `od_${"1".repeat(24)}`);
  const lost = await postOutputDecision(cfg, REC, body, key, { transport: async () => { throw new Error("socket hang up"); } });
  assert.equal(lost.outcome, "unknown");
  assert.equal(lost.code, "network");
  assert.equal(isUnknownOutcome(lost.code), true);
  assert.equal((await postOutputDecision(cfg, REC, { ...body, action: "publish" }, key)).code, "invalid_input");
  assert.equal((await postOutputDecision(cfg, "bad", body, key)).code, "invalid_input");
  const rev = { state: "queued", label: "Revision queued for Hermie (native task not started)", native_status: "ready", requested_against_version: D("a"), requested_against_label: "v1",
    source_task_id: "t_aaaa0001", revision_task_id: "t_cccc0001", handoff: "created", attempts: 2, requested_at: "2026-10-19T10:00:00.000Z" };
  const hr = await postHandoffRetry(cfg, REC, `od_${"1".repeat(24)}`, { transport: transport(200, { receipt: receipt({ decision: "revise" }), revision: rev }) });
  assert.equal(hr.revision.state, "queued");
  assert.equal((await postHandoffRetry(cfg, REC, "od_bad")).code, "invalid_input");
});
