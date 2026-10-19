// Result files (registered artifacts), source-card truth and the team office model. Bridge answers here are
// SYNTHETIC fixtures injected through the transport; they are not evidence about the live bridge.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_ID_RE,
  artifactsSupported,
  checkArtifactList,
  checkRecordLinks,
  contentDisposition,
  decodePreview,
  fetchArtifactBytes,
  groupArtifacts,
  previewKind,
  publicationStatus,
  canonicalReviewedFiles,
  hasCoveringReceipt,
  isDraftPackage,
  reviewStage,
} from "../src/lib/mission-control/artifacts-client.mjs";
import { joinSourceCards, sourceCardState, sourceNextAction } from "../src/lib/mission-control/source-cards.mjs";
import { activityCandidates, nativeActivity, officeRoster, HEARTBEAT_MAX_AGE_MS } from "../src/lib/mission-control/office-model.mjs";
import { tokenizeMarkdown } from "../src/lib/mission-control/safe-markdown.mjs";
import { readBridgeConfig } from "../src/lib/mission-control/bridge-client.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const NOW = Date.parse("2026-10-18T22:00:00Z");
const iso = new Date(NOW).toISOString();
const DRAFT = Buffer.from("# Draft\n\n<script>alert(1)</script> text\n");
const T = "t_11191492";

function list(overrides = {}) {
  return {
    task_id: T,
    task: { title: "Milo package", assignee: "milo", ui: { state: "completed", reason: "run 17", native_status: "done", latest_run_outcome: "completed" } },
    artifacts: [
      { id: "a20", kind: "attachment", parent_id: null, name: "page-draft.md", content_type: "text/markdown; charset=utf-8", size: DRAFT.length, sha256: sha(DRAFT), uploaded_by: "milo", registered_at: iso, readable: true, problem: null, reviewed: true },
      { id: "a17", kind: "attachment", parent_id: null, name: "training-application.md", content_type: "text/markdown; charset=utf-8", size: 249, sha256: "0".repeat(64), uploaded_by: "milo", registered_at: iso, readable: true, problem: null, reviewed: false },
      { id: "a21", kind: "attachment", parent_id: null, name: "package.zip", content_type: "application/zip", size: 900, sha256: "1".repeat(64), uploaded_by: "milo", registered_at: iso, readable: true, problem: null, reviewed: false },
      { id: "a21m2", kind: "archive_member", parent_id: "a21", name: "content-reuse.md", content_type: "text/markdown; charset=utf-8", size: 10, sha256: "2".repeat(64), uploaded_by: "milo", registered_at: iso, readable: true, problem: null, reviewed: true },
      { id: "a30", kind: "attachment", parent_id: null, name: "run.sh", content_type: null, size: 5, sha256: null, uploaded_by: "milo", registered_at: null, readable: false, problem: "unsupported_type", reviewed: false },
      { id: "a19", kind: "attachment", parent_id: null, name: "parent-review.json", content_type: "application/json; charset=utf-8", size: 300, sha256: "9".repeat(64), uploaded_by: "default", registered_at: iso, readable: true, problem: null, reviewed: false },
    ],
    review: { source_artifact_id: "a19", reviewer: "parent", reviewed_at: iso, decision: "draft ok", publication_authorized: false, website_changed: false, reviewed_digests: 4, limitations: ["draft only"] },
    unregistered_reviewed_digests: 0,
    publication: "not_published_by_bridge",
    observed_at: iso,
    ...overrides,
  };
}

const config = readBridgeConfig({ url: "http://127.0.0.1:9", secret: "s".repeat(40) });

function transportFor(responses, seen = []) {
  return async (req) => {
    seen.push(req);
    const r = responses[req.target];
    if (!r) return { status: 404, contentType: "application/json", body: Buffer.from('{"error":"not_found"}') };
    return { status: r.status ?? 200, contentType: r.contentType ?? "application/json", body: Buffer.isBuffer(r.body) ? r.body : Buffer.from(JSON.stringify(r.body)) };
  };
}

test("artifact list parser accepts the bridge contract and refuses paths, publication claims and dangling members", () => {
  const ok = checkArtifactList(list(), T);
  assert.ok(ok);
  assert.equal(ok.artifacts.length, 6);
  assert.equal(ok.review.publicationAuthorized, false);
  assert.ok(!JSON.stringify(ok).includes("stored_path"));
  assert.equal(checkArtifactList(list(), "t_00000000"), null, "task id must match");
  assert.equal(checkArtifactList(list({ publication: "published" }), T), null, "a publication claim is never trusted");
  const withPath = list();
  withPath.artifacts[0].name = "../etc/passwd";
  assert.equal(checkArtifactList(withPath, T), null);
  const dangling = list();
  dangling.artifacts[3].parent_id = "a99";
  assert.equal(checkArtifactList(dangling, T), null);
  const badId = list();
  badId.artifacts[0].id = "page-draft.md";
  assert.equal(checkArtifactList(badId, T), null);
  for (const id of ["a0", "../x", "a1/..", "A1", "a1m", "a12345678901"]) assert.equal(ARTIFACT_ID_RE.test(id), false, id);
  for (const id of ["a20", "a21m2", "a1m0"]) assert.equal(ARTIFACT_ID_RE.test(id), true, id);
});

test("declared draft package with a covering receipt is ready for review; the receipt only bounds that review", () => {
  const l = checkArtifactList(list(), T);
  assert.equal(isDraftPackage(T), true);
  assert.equal(reviewStage(l).stage, "ready_for_review");
  assert.equal(reviewStage(l).label, "Ready for review (draft)");
  const p = publicationStatus(l);
  assert.equal(p.state, "unknown", "a receipt never proves a release did or did not happen");
  assert.doesNotMatch(`${p.chip} ${p.label}`, /Not published|not authorized|Published\b/);
  assert.equal(p.boundary, "This review did not authorize publication");
  // An authorization flag in a read receipt is not execution or a release.
  const authorized = publicationStatus({ ...l, review: { ...l.review, publicationAuthorized: true } });
  assert.equal(authorized.state, "unknown");
  assert.match(authorized.boundary, /not a release/);
  const noReview = checkArtifactList(list({ review: null }), T);
  assert.equal(reviewStage(noReview).stage, "draft");
  assert.equal(publicationStatus(noReview).boundary, null);
  assert.equal(previewKind("text/markdown; charset=utf-8"), "markdown");
  assert.equal(previewKind("application/zip"), null);
});

test("a receipt must actually cover registered readable files before it counts", () => {
  const l = checkArtifactList(list(), T);
  assert.equal(hasCoveringReceipt(l), true);
  for (const [why, mutate] of [
    ["zero reviewed digests", (x) => ({ ...x, review: { ...x.review, reviewedDigests: 0 } })],
    ["receipt is not a registered attachment", (x) => ({ ...x, review: { ...x.review, sourceArtifactId: "a99" } })],
    ["receipt points at an archive member", (x) => ({ ...x, review: { ...x.review, sourceArtifactId: "a21m2" } })],
    ["receipt file unreadable", (x) => ({ ...x, artifacts: x.artifacts.map((a) => (a.id === "a19" ? { ...a, readable: false, problem: "unavailable" } : a)) })],
    ["no readable file carries a reviewed digest", (x) => ({ ...x, artifacts: x.artifacts.map((a) => ({ ...a, reviewed: false })) })],
  ]) {
    const m = mutate(l);
    assert.equal(hasCoveringReceipt(m), false, why);
    assert.equal(reviewStage(m).stage, "draft", why);
    assert.equal(publicationStatus(m).boundary, null, why);
  }
});

test("generic completed release with files and no parent review: Result files, publication unknown, never Draft/Not published", () => {
  const R = "t_d6ca0e80";
  const release = checkArtifactList(list({
    task_id: R,
    task: { title: "Publish FHA 2026 Kern corrections release", assignee: "default", ui: { state: "completed", reason: "", native_status: "done", latest_run_outcome: "completed" } },
    artifacts: [
      { id: "a7", kind: "attachment", parent_id: null, name: "release-proposal.json", content_type: "application/json; charset=utf-8", size: 3574, sha256: "4".repeat(64), uploaded_by: "default", registered_at: iso, readable: true, problem: null, reviewed: false },
      { id: "a14", kind: "attachment", parent_id: null, name: "release-verification.json", content_type: "application/json; charset=utf-8", size: 3388, sha256: "5".repeat(64), uploaded_by: "default", registered_at: iso, readable: true, problem: null, reviewed: false },
      { id: "a15", kind: "attachment", parent_id: null, name: "provider-deployment-successful.png", content_type: null, size: 345971, sha256: null, uploaded_by: "default", registered_at: null, readable: false, problem: "unsupported_type", reviewed: false },
    ],
    review: null,
  }), R);
  assert.ok(release);
  assert.equal(isDraftPackage(R), false);
  const stage = reviewStage(release);
  assert.equal(stage.stage, "result_files");
  assert.equal(stage.label, "Result files");
  const p = publicationStatus(release);
  assert.equal(p.state, "unknown");
  assert.equal(p.boundary, null);
  const shown = `${stage.label} ${p.chip} ${p.label}`;
  assert.doesNotMatch(shown, /Draft|Not published|not authorized|Ready for review/, "the title or a missing receipt never decides publication");
  // A non-package receipt (e.g. a release's own parent-review.json) still does not turn it into a draft or an authorization verdict.
  const withReceipt = { ...release, artifacts: [...release.artifacts, { ...release.artifacts[0], id: "a1", name: "parent-review.json", sha256: "6".repeat(64) }],
    review: { sourceArtifactId: "a1", reviewer: null, reviewedAt: null, decision: null, publicationAuthorized: false, websiteChanged: null, reviewedDigests: 0, limitations: [] } };
  assert.equal(reviewStage(withReceipt).stage, "result_files");
  assert.equal(publicationStatus(withReceipt).boundary, null);
});

test("reviewed files are deduplicated by digest, preferring the standalone attachment; copies stay in the registry", () => {
  const A = "a".repeat(64), P = "b".repeat(64), C = "c".repeat(64), V = "d".repeat(64);
  const f = (id, kind, parent, name, digest, reviewed = true) => ({ id, kind, parentId: parent, name, contentType: "text/markdown; charset=utf-8", size: 10, sha256: digest, uploadedBy: "milo", registeredAt: iso, readable: true, problem: null, reviewed });
  // Mirrors t_11191492: zip members registered after (and also before) their standalone copies.
  const arts = [
    f("a17", "attachment", null, "training-application.md", "0".repeat(64), false),
    f("a18", "attachment", null, "training-application (1).md", A),
    f("a21", "attachment", null, "package.zip", "1".repeat(64), false),
    f("a21m0", "archive_member", "a21", "training-application.md", A),
    f("a21m1", "archive_member", "a21", "page-draft.md", P),
    f("a21m2", "archive_member", "a21", "content-reuse.md", C),
    f("a21m3", "archive_member", "a21", "verification-and-handoff.md", V),
    f("a20", "attachment", null, "page-draft.md", P),
  ];
  const { canonical, duplicates } = canonicalReviewedFiles(arts);
  assert.deepEqual(canonical.map((a) => a.id), ["a18", "a21m2", "a21m3", "a20"]);
  assert.deepEqual(duplicates.map((a) => [a.id, a.duplicateOf]), [["a21m0", "a18"], ["a21m1", "a20"]]);
  const g = groupArtifacts(arts);
  assert.equal(g.reviewed.length, 4);
  assert.equal(g.duplicates.length, 2);
  const l = checkArtifactList(list(), T);
  const g2 = groupArtifacts(l.artifacts);
  assert.deepEqual(g2.reviewed.map((a) => a.id), ["a20", "a21m2"]);
  assert.deepEqual(g2.other.map((a) => a.id), ["a17", "a21", "a19"]);
  assert.deepEqual(g2.unavailable.map((a) => a.id), ["a30"]);
});

test("byte read is signed, verified against the registration, and refuses unknown/unreadable/mismatched files", async () => {
  const seen = [];
  const responses = {
    [`/v0/tasks/${T}/artifacts`]: { body: list() },
    [`/v0/tasks/${T}/artifacts/a20`]: { body: DRAFT, contentType: "text/markdown; charset=utf-8" },
  };
  const r = await fetchArtifactBytes(config, T, "a20", { transport: transportFor(responses, seen), now: () => NOW });
  assert.equal(r.ok, true);
  assert.equal(r.sha256, sha(DRAFT));
  assert.equal(r.name, "page-draft.md");
  const byteReq = seen[1];
  assert.equal(byteReq.method, "GET");
  assert.equal(byteReq.body, undefined);
  const expected = createHmac("sha256", config.secret)
    .update(["mc-bridge-v1", "GET", `/v0/tasks/${T}/artifacts/a20`, byteReq.headers["x-mc-timestamp"], byteReq.headers["x-mc-nonce"], sha(Buffer.alloc(0))].join("\n"))
    .digest("hex");
  assert.equal(byteReq.headers["x-mc-signature"], expected);

  assert.equal((await fetchArtifactBytes(config, T, "a99", { transport: transportFor(responses) })).code, "unknown_artifact");
  assert.equal((await fetchArtifactBytes(config, T, "a30", { transport: transportFor(responses) })).code, "unsupported_type");
  assert.equal((await fetchArtifactBytes(config, T, "../x", { transport: transportFor(responses) })).code, "invalid_artifact_id");
  assert.equal((await fetchArtifactBytes(config, "../t", "a20", { transport: transportFor(responses) })).code, "invalid_task_id");
  const tampered = { ...responses, [`/v0/tasks/${T}/artifacts/a20`]: { body: Buffer.from(DRAFT.toString("latin1").replace("alert", "ALERT"), "latin1"), contentType: "text/markdown" } };
  assert.equal((await fetchArtifactBytes(config, T, "a20", { transport: transportFor(tampered) })).code, "digest_mismatch");
  const short = { ...responses, [`/v0/tasks/${T}/artifacts/a20`]: { body: Buffer.from("x"), contentType: "text/markdown" } };
  assert.equal((await fetchArtifactBytes(config, T, "a20", { transport: transportFor(short) })).code, "size_mismatch");
  const retyped = { ...responses, [`/v0/tasks/${T}/artifacts/a20`]: { body: DRAFT, contentType: "text/html" } };
  assert.equal((await fetchArtifactBytes(config, T, "a20", { transport: transportFor(retyped) })).code, "type_mismatch");
  const refused = { ...responses, [`/v0/tasks/${T}/artifacts/a20`]: { status: 409, body: { error: "artifact_unavailable" } } };
  assert.equal((await fetchArtifactBytes(config, T, "a20", { transport: transportFor(refused) })).state, "unavailable");
  const oldBridge = await fetchArtifactBytes(config, T, "a20", { transport: transportFor({}) });
  assert.equal(oldBridge.ok, false);
  assert.equal(artifactsSupported({ ops: ["GET /v0/tasks"] }), false, "an older bridge is reported unsupported, not empty");
  assert.equal(artifactsSupported({ ops: ["GET /v0/tasks/:id/artifacts"] }), true);
  assert.equal((await fetchArtifactBytes({ configured: false, reason: "not_configured" }, T, "a20")).state, "not_configured");
});

test("download headers and preview decoding are safe", () => {
  assert.equal(contentDisposition('evil"\r\nX: y.md'), `attachment; filename="evil___X_ y.md"; filename*=UTF-8''evil%22%0D%0AX%3A%20y.md`);
  assert.equal(decodePreview(Buffer.from([0xff, 0xfe, 0x00])), null);
  const tokens = tokenizeMarkdown("# Title\n\n<script>alert(1)</script>\n\n- a\n- b\n\n```\n<b>x</b>\n```\n");
  assert.deepEqual(tokens.map((t) => t.type), ["heading", "paragraph", "list", "code"]);
  assert.equal(tokens[1].text, "<script>alert(1)</script>", "HTML stays literal text");
});

test("no new Mission Control view injects raw HTML", async () => {
  const files = [
    "src/components/mc/artifact-views.tsx",
    "src/app/tasks/[id]/artifacts/[artifactId]/page.tsx",
    "src/app/content/page.tsx",
    "src/components/office/office-floor.tsx",
    "src/app/office/page.tsx",
    "src/app/approvals/page.tsx",
  ];
  for (const f of files) assert.doesNotMatch(await readFile(join(ROOT, f), "utf8"), /dangerouslySetInnerHTML|innerHTML/, f);
  const pub = await readdir(join(ROOT, "public"), { recursive: true });
  assert.ok(!pub.some((p) => /page-draft|training-application|content-reuse|verification-and-handoff|parent-review/i.test(String(p))), "no drafts in public assets");
});

// Real ids/labels of the 11 Milo cards from functional-office-audit/milo-approval-snapshot.json (labels only).
const ELEVEN = [
  ["rec3a7c7gWiuGKKD2", "In Progress"], ["recAUzgyM97zBejVk", "Verified / Done"], ["recHKX0GjqTVrwMeb", "In Progress"],
  ["recOTmm5pmAMXp6Kc", "In Progress"], ["recTTg4mePpxy0ysM", "In Progress"], ["recY5JJcS0xgTpSRk", "In Progress"],
  ["reccvc1T62VH7MrGC", "In Progress"], ["reciVoEyA6ZBZ7ax1", "In Progress"], ["reclnlMIt27So6fGP", "In Progress"],
  ["recpfadg1uhtMRXXs", "In Progress"], ["recsaKTBLBVAtusCX", "In Progress"],
].map(([id, status]) => ({ id, decision: "Approved", status, title: `card ${id}` }));

const linked = (id, state) => ({ taskId: id, title: "t", assignee: "milo", nativeStatus: "done", createdAt: 1, completedAt: 2, ui: { state, reason: "", native_status: null, latest_run_outcome: null }, linkage: "workspace_segment" });

test("all 11 cards keep their order and none is shown running without an open linked run", () => {
  const links = checkRecordLinks({
    links: [{ record_id: "recAUzgyM97zBejVk", tasks: ["t_d6ca0e80", "t_4dc82133"].map((id) => ({ task_id: id, title: "x", assignee: "milo", native_status: "done", created_at: 1, completed_at: 2, ui: { state: "completed_unverified" }, linkage: "workspace_segment" })) }],
    scanned_tasks: 40,
    linkage_rule: "workspace segment",
    observed_at: iso,
  });
  assert.ok(links);
  const joined = joinSourceCards(ELEVEN, { ok: true, ...links });
  assert.equal(joined.length, 11);
  assert.deepEqual(joined.map((j) => j.card.id), ELEVEN.map((c) => c.id));
  const states = joined.map((j) => j.derived.state);
  assert.equal(states.filter((s) => s === "native_run_open").length, 0);
  assert.equal(states[1], "native_done");
  assert.equal(states.filter((s) => s === "saved_status_unverified").length, 10);
  assert.match(joined[0].derived.label, /not verified running/);
  assert.match(joined[0].next, /Not running/);

  // Title-only "linkage" is impossible: links are keyed by record id only.
  const titled = joinSourceCards([{ id: "recZZZZZZZZZZZZZZ", decision: "Approved", status: "In Progress", title: "card recAUzgyM97zBejVk" }], { ok: true, ...links });
  assert.equal(titled[0].linkedTasks.length, 0);
  // Failed link read: never running, never done.
  const unknown = joinSourceCards(ELEVEN, { ok: false, state: "offline", code: "refused" });
  assert.ok(unknown.every((j) => j.derived.state === "linkage_unknown"));
  // Parity with the bridge reference rules.
  assert.equal(sourceCardState({ decision: "Approved", savedStatus: null, linkedTasks: [] }).state, "approved_awaiting_start");
  assert.equal(sourceCardState({ decision: "Approved", savedStatus: "In Progress", linkedTasks: [linked("t_aa0001", "running_unverified")] }).state, "native_run_open");
  assert.equal(sourceCardState({ decision: "Approved", savedStatus: "In Progress", linkedTasks: [linked("t_aa0001", "queued")] }).state, "native_queued");
  assert.equal(sourceCardState({ decision: "Approved", savedStatus: "In Progress", linkedTasks: [linked("t_aa0001", "blocked")] }).state, "native_blocked");
  assert.match(sourceNextAction("approved_awaiting_start", "Pending"), /decision/);
  assert.equal(checkRecordLinks({ links: [{ record_id: "notarecord", tasks: [] }], scanned_tasks: 0, linkage_rule: "x", observed_at: iso }), null);
});

const task = (id, assignee, state, extra = {}) => ({ id, title: `task ${id}`, assignee, status: "x", bucket: null, verified: false, created_at: 1792380000, ui: { state, reason: "", native_status: null, latest_run_outcome: null }, ...extra });
const OPS = {
  ok: true,
  observedAt: iso,
  profiles: [
    { id: "default", name: "default", configured: true, activity: "unverified", role: "Chief of staff" },
    { id: "milo", name: "milo", configured: true, activity: "unverified", role: null },
    { id: "gpt56-test", name: "gpt56-test", configured: true, activity: "unverified", role: null },
    { id: "mc-runner", name: "mc-runner", configured: true, activity: "unverified", role: null },
  ],
  schedules: [{ id: "j1", name: "Morning brief", schedule: "0 7 * * *", enabled: true, last_run_at: null, last_status: null, next_run_at: iso, has_error: false }],
};

// Native task detail (bridge GET /v0/tasks/:id over `hermes kanban show --json`); times are unix seconds like native.
const sec = (ms) => Math.floor(ms / 1000);
const detail = ({ assignee = "milo", status = "running", profile = "milo", runId = 7, observedAt = iso, hbAt = NOW, extraRuns = [], events = null, claimed = true, runStatus = "running" } = {}) => ({
  ok: true,
  observedAt,
  task: { id: "t_aa0001", status, assignee, ui: { state: "running_unverified" } },
  runs: [{ id: 3, profile, status: "done", outcome: "completed", started_at: sec(NOW) - 900, ended_at: sec(NOW) - 800 }, { id: runId, profile, status: runStatus, outcome: null, started_at: sec(NOW) - 300, ended_at: null }, ...extraRuns],
  events: events ?? [
    ...(claimed ? [{ kind: "claimed", created_at: sec(NOW) - 300, run_id: runId }] : []),
    ...(hbAt === null ? [] : [{ kind: "heartbeat", created_at: sec(hbAt), run_id: runId }]),
  ],
});

test("office roster: real profiles only, humans untracked; list-only running is never typing", () => {
  const fresh = { ok: true, observedAt: iso, tasks: [task("t_aa0001", "milo", "running_unverified"), task("t_aa0002", "default", "completed"), task("t_aa0003", "default", "waiting_approval")] };
  const r = officeRoster(OPS, fresh, NOW + 5_000);
  assert.deepEqual(r.agents.map((a) => a.name), ["Hermie", "Milo"]);
  assert.deepEqual(r.excluded.sort(), ["gpt56-test", "mc-runner"]);
  const milo = r.agents.find((a) => a.id === "milo");
  assert.equal(milo.status, "unknown", "list ui.state=running_unverified alone proves nothing");
  assert.match(milo.statusLabel, /run open, activity unverified \(task detail not read\)/);
  assert.equal(milo.evidence.heartbeatAt, null);
  const hermie = r.agents.find((a) => a.id === "default");
  assert.equal(hermie.status, "idle", "waiting approval / approved is not activity");
  assert.equal(hermie.latest.id, "t_aa0002");
  assert.deepEqual(r.humans.map((h) => [h.name, h.status]), [["Fonz", "untracked"], ["Claudia", "untracked"], ["Nathaly", "untracked"]]);
  assert.deepEqual(r.scheduled.map((s) => s.name), ["Morning brief"]);
  assert.ok(!JSON.stringify(r).includes("Atlas"));

  const stale = officeRoster(OPS, fresh, NOW + 10 * 60_000, { t_aa0001: detail() });
  assert.ok(stale.agents.every((a) => a.status === "unknown"), "a stale read shows unknown, neither typing nor idle");
  const offline = officeRoster(OPS, { ok: false, state: "offline", code: "refused" }, NOW);
  assert.ok(offline.agents.every((a) => a.status === "unknown"));
  const noOps = officeRoster({ ok: false, state: "offline", code: "refused" }, fresh, NOW);
  assert.equal(noOps.agents.length, 0);
  assert.equal(noOps.scheduled, null, "schedules unknown, not empty");
});

test("office activity: typing only with exact open native run + claim + recent same-run heartbeat", () => {
  const fresh = { ok: true, observedAt: iso, tasks: [task("t_aa0001", "milo", "running_unverified"), task("t_aa0009", "gpt56-test", "running_unverified")] };
  assert.deepEqual(activityCandidates(fresh, OPS.profiles), ["t_aa0001"], "test profiles are not read");
  assert.equal(activityCandidates(fresh, OPS.profiles, 0).length, 0, "bounded");

  const ok = nativeActivity(detail({ hbAt: NOW - 30_000 }), "milo", NOW);
  assert.equal(ok.verified, true);
  assert.equal(ok.runId, 7);
  assert.equal(ok.expiresAt, sec(NOW - 30_000) * 1000 + HEARTBEAT_MAX_AGE_MS);
  const r = officeRoster(OPS, fresh, NOW, { t_aa0001: detail({ hbAt: NOW - 30_000 }) });
  const milo = r.agents.find((a) => a.id === "milo");
  assert.equal(milo.status, "working");
  assert.equal(milo.evidence.runId, 7);
  assert.match(milo.evidence.source, /kanban show/);

  const cases = {
    "stale heartbeat on an open run": [detail({ hbAt: NOW - HEARTBEAT_MAX_AGE_MS - 5_000 }), /older than 120s/],
    "no heartbeat events": [detail({ hbAt: null }), /no native heartbeat/],
    "no events at all": [detail({ events: [] }), /no native claim/],
    "future heartbeat": [detail({ hbAt: NOW + 60_000 }), /future-dated/],
    "heartbeat for another run": [detail({ events: [{ kind: "claimed", created_at: sec(NOW) - 300, run_id: 7 }, { kind: "heartbeat", created_at: sec(NOW) - 5, run_id: 3 }] }), /no native heartbeat/],
    "other event kinds are not heartbeats": [detail({ events: [{ kind: "claimed", created_at: sec(NOW) - 5, run_id: 7 }, { kind: "commented", created_at: sec(NOW) - 5, run_id: 7 }] }), /no native heartbeat/],
    "run claimed by another profile": [detail({ profile: "default" }), /another profile/],
    "task assigned elsewhere": [detail({ assignee: "default" }), /assigned to another profile/],
    "native status not running": [detail({ status: "blocked" }), /not running/],
    "open run not the latest run": [detail({ extraRuns: [{ id: 9, profile: "milo", status: "done", outcome: "crashed", started_at: sec(NOW) - 60, ended_at: sec(NOW) - 30 }] }), /not the latest/],
    "two open runs": [detail({ extraRuns: [{ id: 8, profile: "milo", status: "running", outcome: null, started_at: sec(NOW) - 60, ended_at: null }] }), /more than one open run/],
    "no claim event": [detail({ claimed: false }), /no native claim/],
    "stale detail read": [detail({ observedAt: new Date(NOW - 10 * 60_000).toISOString() }), /detail read is stale/],
    "detail read failed": [{ ok: false, state: "offline", code: "refused" }, /not read/],
  };
  for (const [name, [d, why]] of Object.entries(cases)) {
    const a = nativeActivity(d, "milo", NOW);
    assert.equal(a.verified, false, name);
    assert.match(a.reason, why, name);
    const roster = officeRoster(OPS, fresh, NOW, { t_aa0001: d });
    assert.equal(roster.agents.find((x) => x.id === "milo").status, "unknown", name);
  }
  // The bridge observation time is never a heartbeat: a fresh read with no heartbeat stays unknown.
  assert.equal(nativeActivity(detail({ hbAt: null, observedAt: new Date(NOW).toISOString() }), "milo", NOW).verified, false);
  // Age expiry: the same evidence is no longer typing once it is older than the window.
  assert.equal(nativeActivity(detail({ hbAt: NOW - 30_000 }), "milo", NOW + HEARTBEAT_MAX_AGE_MS).verified, false);
});

test("office floor expires typing on the browser clock, independent of refresh and motion", async () => {
  const floor = await readFile(join(ROOT, "src/components/office/office-floor.tsx"), "utf8");
  assert.match(floor, /function effective\(a: OfficeAgent, now: number\)/);
  assert.match(floor, /now < a\.evidence\.expiresAt/);
  assert.match(floor, /setInterval\(tick, 5000\)/);
  assert.doesNotMatch(floor.slice(floor.indexOf("const tick"), floor.indexOf("const tick") + 200), /still|paused/, "truth clock is not tied to motion");
});

test("office page source has no invented roster or fake business numbers", async () => {
  const page = await readFile(join(ROOT, "src/app/office/page.tsx"), "utf8");
  const floor = await readFile(join(ROOT, "src/components/office/office-floor.tsx"), "utf8");
  for (const s of [page, floor]) {
    assert.doesNotMatch(s, /\$340K|Atlas|loans? closed|fake/i);
  }
  assert.match(floor, /prefers-reduced-motion/);
  assert.match(floor, /Pause motion/);
  assert.match(floor, /Escape/);
});
