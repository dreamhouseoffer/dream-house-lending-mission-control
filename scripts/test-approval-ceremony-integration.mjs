// OPT-IN LOCAL TEST integration: real `next start` HTTP login/session -> exact-terms challenge issue -> SYNTHETIC
// test-owner WebAuthn signature -> challenge decision -> exact replay -> logout revocation refusal, against the private
// bridge's NODE_TEST_CONTEXT-only ceremony harness (createCeremonyTestBridge). Production stays disabled:
//   - createCeremonyTestBridge throws outside `node --test`; the production createBridge refuses any ceremony config.
//   - the app talks to that harness DIRECTLY (no proxy, no injected capabilities). The harness itself advertises the
//     reviewed approval_ceremony block and the app's unmodified gate is asserted to accept it.
//   - fail closed: a second `next start` against a production createBridge (approvals on, no ceremony; it still
//     advertises the legacy decision op and no block) answers 503 ceremony_unavailable and logout revokes nothing;
//     the real harness advertisement is refused without the owner opt-in, for a different canonical host, and when
//     tampered (legacy op re-added, block removed, legacy decision enabled). Nothing fakes a positive advertisement.
//   - the signing key is an in-memory SYNTHETIC test key with a reserved .invalid rp_id. It is never enrolled, written
//     to disk or configured in a live bridge, and none of this is live-human approval proof.
// Isolation: approved scratch only, loopback ephemeral ports, fresh scratch SQLite, SYNTHETIC fake `hermes` CLI (no
// native board is touched; every HERMES_* kanban override is pinned inside scratch), destination test-sink only.
// Prints codes/statuses only — never the PIN, secrets, cookie or token. Requires an existing production build (.next).
// Usage: MC_CEREMONY_LOCAL_INTEGRATION=1 TMPDIR=~/.hermes/cache/scratch node --test scripts/test-approval-ceremony-integration.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign as cryptoSign } from "node:crypto";
import { existsSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRIDGE_SERVER = path.join(os.homedir(), ".hermes", "mission-control", "bridge", "server.js");
const APPROVED_SCRATCH = path.join(os.homedir(), ".hermes", "cache", "scratch");
const OPTED_IN = process.env.MC_CEREMONY_LOCAL_INTEGRATION === "1";
const skip = !OPTED_IN ? "opt-in: set MC_CEREMONY_LOCAL_INTEGRATION=1" : !existsSync(path.join(ROOT, ".next", "BUILD_ID")) ? "no production build (.next)" : false;

const CANONICAL = "https://mission-control.integration.invalid"; // SYNTHETIC, never resolved
const RP_ID = new URL(CANONICAL).hostname;
const TASK_ID = "t_5a0001";
const b64u = (b) => Buffer.from(b).toString("base64url");
const sha256 = (b) => createHash("sha256").update(b).digest();
const iso = (ms) => new Date(Date.now() + ms).toISOString();

// SYNTHETIC test owner authenticator: in-memory ES256 key, never persisted, never an owner credential.
function syntheticAuthenticator() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const id = b64u(randomBytes(16));
  let counter = 0;
  const credential = { id, principal: "owner", alg: "ES256", public_key_spki: publicKey.export({ format: "der", type: "spki" }).toString("base64") };
  // Signs exactly what the app handed back: WebAuthn challenge = sha256(issued payload bytes).
  function signIssued(challenge, origin = CANONICAL) {
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: challenge.webauthn_challenge_b64u, origin, crossOrigin: false }));
    const authData = Buffer.alloc(37);
    sha256(Buffer.from(RP_ID)).copy(authData, 0);
    authData[32] = 0x05; // UP | UV
    authData.writeUInt32BE(++counter, 33);
    const signature = cryptoSign("sha256", Buffer.concat([authData, sha256(clientData)]), privateKey);
    return { credential_id: id, client_data_json: b64u(clientData), authenticator_data: b64u(authData), signature: b64u(signature) };
  }
  return { credential, signIssued };
}

// SYNTHETIC fake `hermes` CLI: answers `kanban show` for the one scratch task only; anything else exits non-zero.
function writeFakeCli(dir, statePath) {
  const file = path.join(dir, "fake-hermes-SYNTHETIC");
  writeFileSync(file, `#!${process.execPath}
'use strict';
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(statePath + ".argv")}, JSON.stringify(a) + '\\n');
const db = JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, 'utf8'));
if (a[1] !== 'show') process.exit(3);
const t = db.tasks.find((x) => x.id === a[2]);
if (!t) { process.stderr.write('no such task\\n'); process.exit(1); }
process.stdout.write(JSON.stringify({ task: t, latest_summary: null, events: [], runs: [] }));
`, { mode: 0o700 });
  return file;
}

// Passive observer on a bridge's own http.Server: records method + path of every request it receives. It never
// touches the request or the response.
function recordRequests(bridge) {
  const calls = [];
  bridge.server.on("request", (req) => calls.push(`${req.method} ${req.url}`));
  return calls;
}

// `next start` on a loopback ephemeral port, pointed straight at `bridgeUrl`, with its own PIN/session secret.
async function startNext(dir, tag, bridgeUrl, bridgeSecret) {
  const pin = randomBytes(9).toString("base64url");
  const port = await new Promise((resolve) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const log = openSync(path.join(dir, `next-start-${tag}.log`), "a");
  const child = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      MISSION_CONTROL_PIN: pin, MISSION_CONTROL_SESSION_SECRET: randomBytes(48).toString("base64url"),
      MISSION_CONTROL_CANONICAL_ORIGIN: CANONICAL, MISSION_CONTROL_APPROVAL_CEREMONY: "challenge_only_v1",
      MC_BRIDGE_URL: bridgeUrl, MC_BRIDGE_SECRET: bridgeSecret },
    stdio: ["ignore", log, log],
    detached: true,
  });
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((r) => child.once("exit", r));
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    try { if (child.exitCode === null) process.kill(-child.pid, "SIGKILL"); } catch {}
  };
  return { pin, child, stop, base: `http://127.0.0.1:${port}`, selfOrigin: `http://localhost:${port}` };
}

async function waitReady(base, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited_${child.exitCode}`);
    try {
      await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error("server_not_ready");
}

test("Gate3 local ceremony integration over real Next HTTP (SYNTHETIC, production disabled)", { skip, timeout: 180_000 }, async (t) => {
  assert.ok(process.env.NODE_TEST_CONTEXT, "must run under node --test");
  assert.equal(realpathSync(process.env.TMPDIR ?? ""), realpathSync(APPROVED_SCRATCH), "TMPDIR must be the approved scratch dir");
  const dir = mkdtempSync(path.join(realpathSync(APPROVED_SCRATCH), "mc-gate3-integration-"));
  const statePath = path.join(dir, "fake-board-SYNTHETIC.json");
  writeFileSync(statePath, JSON.stringify({ tasks: [{ id: TASK_ID, title: "SYNTHETIC no-send gate3 fixture", status: "review",
    assignee: "mcb-synthetic", created_by: "mission-control", created_at: 1790000000 }] }));
  const kanbanHome = path.join(dir, "kanban-home");
  const pins = { HERMES_HOME: kanbanHome, HERMES_KANBAN_HOME: kanbanHome, HERMES_KANBAN_DB: path.join(kanbanHome, "kanban.db"),
    HERMES_KANBAN_WORKSPACES_ROOT: path.join(kanbanHome, "kanban", "workspaces"), HERMES_KANBAN_ATTACHMENTS_ROOT: path.join(kanbanHome, "kanban", "attachments") };
  const nativeCalls = () => readFileSync(`${statePath}.argv`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const bridgeSecret = randomBytes(36).toString("base64url");
  const owner = syntheticAuthenticator();
  const limits = { windowSeconds: 300, maxPerSession: 10, maxGlobal: 50 };
  const { createBridge, createCeremonyTestBridge } = createRequire(import.meta.url)(BRIDGE_SERVER);
  const bridgeOpts = (file, approvals) => ({ secret: bridgeSecret, dbPath: path.join(dir, file), hermesBin: writeFakeCli(dir, statePath),
    assignees: [], cliTimeoutMs: 5000, hermesHome: kanbanHome, hermesEnv: { ...pins }, approvals });
  const approvalsCfg = { enabled: true, humans: ["owner"], ceremony: { issueLimits: limits },
    ownerAssertion: { mode: "webauthn", rpId: RP_ID, origins: [CANONICAL], maxTtlSeconds: 120, credentials: [owner.credential] } };

  // Production entry point still refuses the ceremony outright.
  assert.throws(() => createBridge(bridgeOpts("prod.db", approvalsCfg)), /approvals\.ceremony is not available/);

  // Every owned server is stopped in reverse creation order, whatever fails.
  const owned = [];
  t.after(async () => { for (const stop of owned.reverse()) await stop(); });
  const bridge = createCeremonyTestBridge(bridgeOpts("bridge-SYNTHETIC.db", approvalsCfg));
  owned.push(() => bridge.close());
  const bridgeCalls = recordRequests(bridge);
  const bridgePort = await bridge.listen(0);
  // Production entry point with approvals on but no ceremony key: no ceremony routes and no block are exposed.
  const { ceremony: _ceremony, ...prodApprovalsCfg } = approvalsCfg;
  const prodBridge = createBridge(bridgeOpts("prod-no-ceremony-SYNTHETIC.db", prodApprovalsCfg));
  owned.push(() => prodBridge.close());
  const prodCalls = recordRequests(prodBridge);
  const prodPort = await prodBridge.listen(0);
  const { bridgeGet, bridgeRequest, readBridgeConfig } = await import(pathToFileURL(path.join(ROOT, "src/lib/mission-control/bridge-client.mjs")).href);
  const { CEREMONY_OPS, LEGACY_DECISION_OP, ceremonyAvailability, checkCeremonyCapability } =
    await import(pathToFileURL(path.join(ROOT, "src/lib/mission-control/approval-ceremony.mjs")).href);
  const { SESSION_COOKIE } = await import(pathToFileURL(path.join(ROOT, "src/lib/auth/session.mjs")).href);
  const direct = readBridgeConfig({ url: `http://127.0.0.1:${bridgePort}`, secret: bridgeSecret });
  const prodDirect = readBridgeConfig({ url: `http://127.0.0.1:${prodPort}`, secret: bridgeSecret });

  const app = await startNext(dir, "harness", `http://127.0.0.1:${bridgePort}`, bridgeSecret);
  owned.push(app.stop);
  const appProd = await startNext(dir, "prod-bridge", `http://127.0.0.1:${prodPort}`, bridgeSecret);
  owned.push(appProd.stop);
  await Promise.all([waitReady(app.base, app.child), waitReady(appProd.base, appProd.child)]);
  const { pin, selfOrigin } = app;

  const callOn = (srv) => async (method, pathname, { token, origin = CANONICAL, site = "same-origin", body, extraHeaders = {} } = {}) => {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.cookie = `${SESSION_COOKIE}=${token}`;
    if (origin) headers.origin = origin;
    if (site) headers["sec-fetch-site"] = site;
    const res = await fetch(`${srv.base}${pathname}`, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json, location: res.headers.get("location"), setCookie: res.headers.getSetCookie?.() ?? [] };
  };
  const call = callOn(app);
  const callProd = callOn(appProd);
  const seq = { n: 0 };
  const seedApproval = async (cfg = direct) => {
    seq.n += 1;
    const r = await bridgeRequest(cfg, "POST", "/v0/approvals", { acceptStatus: [201], idempotencyKey: `gate3-seed-${String(seq.n).padStart(8, "0")}`,
      body: { task_id: TASK_ID, artifact_id: `art-synthetic-${seq.n}`, content: `SYNTHETIC no-send draft ${seq.n}`, action: "publish",
        destination: "test-sink:synthetic-no-send", max_cost_cents: 0, not_before: iso(-1000), expires_at: iso(3_600_000), requested_by: "agent-synthetic" } });
    assert.ok(r.ok, JSON.stringify(r));
    return r.data.approval.approval_id;
  };
  const tupleOf = (a) => ({ approval_id: a.approval_id, row_version: a.row_version, task_id: a.task_id, requested_by: a.requested_by,
    artifact: { id: a.artifact.id, version: a.artifact.version, sha256: a.artifact.sha256 }, action: a.action,
    destination: a.destination, max_cost_cents: a.max_cost_cents, not_before: a.not_before, expires_at: a.expires_at });
  const routes = (id) => ({ view: `/api/control/approvals/${id}`, issue: `/api/control/approvals/${id}/challenge`, decide: `/api/control/approvals/${id}/decision` });
  const assertions = () => bridge.db.prepare("SELECT COUNT(*) n FROM owner_assertions").get().n;

  // ---- the harness's own advertisement is the exact reviewed block, and the app's unmodified gate accepts it ----
  const caps = await bridgeGet(direct, "/v0/capabilities");
  assert.ok(caps.ok, JSON.stringify(caps));
  assert.deepEqual(caps.data.approval_ceremony, { mode: "challenge_only", version: 1, legacy_decision: "disabled", session_revocation: "durable",
    owner_enrollment: { kind: "webauthn_pinned", credentials: 1, rp_id: RP_ID },
    issue_rate_limit: { window_seconds: limits.windowSeconds, max_per_session: limits.maxPerSession } });
  for (const op of Object.values(CEREMONY_OPS)) assert.equal(caps.data.ops.filter((o) => o === op).length, 1, op);
  assert.ok(!caps.data.ops.includes(LEGACY_DECISION_OP));
  assert.deepEqual(checkCeremonyCapability(caps.data, { canonicalHost: RP_ID }), { available: true, rpId: RP_ID });
  const ceremonyEnv = { MISSION_CONTROL_APPROVAL_CEREMONY: "challenge_only_v1", MISSION_CONTROL_CANONICAL_ORIGIN: CANONICAL };
  assert.deepEqual(await ceremonyAvailability({ env: ceremonyEnv, bridgeConfig: direct }), { available: true, rpId: RP_ID, origin: CANONICAL });

  // ---- fail closed: the same real advertisement without opt-in, for another host, or tampered; the production bridge ----
  const reasonFor = async (env, cfg = direct) => (await ceremonyAvailability({ env, bridgeConfig: cfg })).reason;
  assert.equal(await reasonFor({ MISSION_CONTROL_CANONICAL_ORIGIN: CANONICAL }), "ceremony_not_enabled");
  assert.equal(await reasonFor({ ...ceremonyEnv, MISSION_CONTROL_CANONICAL_ORIGIN: "https://other.integration.invalid" }), "owner_rp_id_mismatch");
  const tampered = (edit) => { const c = structuredClone(caps.data); edit(c); return checkCeremonyCapability(c, { canonicalHost: RP_ID }).reason; };
  assert.equal(tampered((c) => c.ops.push(LEGACY_DECISION_OP)), "legacy_decision_still_advertised");
  assert.equal(tampered((c) => { delete c.approval_ceremony; }), "ceremony_not_advertised");
  assert.equal(tampered((c) => { c.approval_ceremony.legacy_decision = "enabled"; }), "legacy_decision_not_disabled");
  assert.equal(tampered((c) => { delete c.approval_ceremony.issue_rate_limit; }), "issue_rate_limit_missing");
  const prodCaps = await bridgeGet(prodDirect, "/v0/capabilities");
  assert.ok(prodCaps.ok && !Object.hasOwn(prodCaps.data, "approval_ceremony") && prodCaps.data.ops.includes(LEGACY_DECISION_OP));
  assert.equal(await reasonFor(ceremonyEnv, prodDirect), "legacy_decision_still_advertised");

  // Same build over real HTTP against the production bridge: issue/decide refuse 503, logout revokes nothing.
  const prodLogin = await callProd("POST", "/api/auth/login", { origin: appProd.selfOrigin, body: JSON.stringify({ pin: appProd.pin }) });
  assert.equal(prodLogin.status, 200);
  const prodToken = prodLogin.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`)).slice(`${SESSION_COOKIE}=`.length).split(";")[0];
  const prodApId = await seedApproval(prodDirect);
  const prodView = await callProd("GET", routes(prodApId).view, { token: prodToken });
  assert.equal(prodView.status, 200, JSON.stringify(prodView.json));
  const prodIssue = await callProd("POST", routes(prodApId).issue, { token: prodToken,
    body: JSON.stringify({ expected: tupleOf(prodView.json.approval), decision: "approve", note: null }) });
  assert.equal(prodIssue.status, 503); assert.equal(prodIssue.json.code, "ceremony_unavailable");
  assert.equal(prodIssue.json.reason, "legacy_decision_still_advertised");
  const prodDecide = await callProd("POST", routes(prodApId).decide, { token: prodToken, body: JSON.stringify({ approval_id: prodApId,
    challenge_id: `och_${"A".repeat(32)}`, challenge_sha256: "0".repeat(64), payload_b64u: "AA", note: null, assertion: {} }) });
  assert.equal(prodDecide.status, 503); assert.equal(prodDecide.json.code, "ceremony_unavailable");
  const prodLogout = await callProd("POST", "/api/auth/logout", { token: prodToken, origin: appProd.selfOrigin });
  assert.equal(prodLogout.status, 200); assert.equal(prodLogout.json.revocation, "unsupported");
  assert.ok(!prodCalls.some((c) => /owner-challenges|\/v0\/sessions\/revoke|^POST \/v0\/approvals\/[^/]+\/decision$/.test(c)), JSON.stringify(prodCalls));
  assert.equal(prodBridge.db.prepare("SELECT status FROM approvals WHERE approval_id=?").get(prodApId).status, "pending");

  // ---- login over HTTP: the cookie is the only identity source ----
  const bad = await call("POST", "/api/auth/login", { origin: selfOrigin, body: JSON.stringify({ pin: `${pin}x` }) });
  assert.equal(bad.status, 401);
  const login = await call("POST", "/api/auth/login", { origin: selfOrigin, body: JSON.stringify({ pin }) });
  assert.equal(login.status, 200);
  const cookie = login.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(cookie, "login set the session cookie");
  const token = cookie.slice(`${SESSION_COOKIE}=`.length).split(";")[0];

  const apId = await seedApproval();
  const r1 = routes(apId);
  const view = await call("GET", r1.view, { token });
  assert.equal(view.status, 200, JSON.stringify(view.json));
  const viewed = view.json.approval;
  assert.equal(viewed.state, "awaiting_approval");
  const issueBody = JSON.stringify({ expected: tupleOf(viewed), decision: "approve", note: "SYNTHETIC gate3 approval" });

  // ---- refusals before anything is issued ----
  const unauth = await call("POST", r1.issue, { body: issueBody });
  assert.ok(unauth.status === 401 || (unauth.status >= 300 && unauth.status < 400 && /\/login/.test(unauth.location ?? "")), `unauth ${unauth.status}`);
  assert.equal((await call("POST", r1.issue, { token, origin: "https://evil.invalid", body: issueBody })).json.code, "origin_mismatch");
  assert.equal((await call("POST", r1.issue, { token, origin: selfOrigin, body: issueBody })).json.code, "origin_mismatch");
  assert.equal((await call("POST", r1.issue, { token, site: "cross-site", body: issueBody })).json.code, "fetch_site_not_same_origin");
  for (const claim of [{ human: "owner" }, { session_sha256: "0".repeat(64) }, { principal: "owner" }, { credential: owner.credential.id }]) {
    const r = await call("POST", r1.issue, { token, body: JSON.stringify({ ...JSON.parse(issueBody), ...claim }) });
    assert.equal(r.status, 400); assert.equal(r.json.code, "client_claim_refused");
  }
  const changed = JSON.parse(issueBody);
  changed.expected.artifact.sha256 = "f".repeat(64);
  const termsChanged = await call("POST", r1.issue, { token, body: JSON.stringify(changed) });
  assert.equal(termsChanged.status, 409); assert.equal(termsChanged.json.code, "terms_changed");
  assert.equal(bridge.db.prepare("SELECT COUNT(*) n FROM owner_challenges").get().n, 0, "no challenge issued by any refusal");

  // ---- exact terms -> challenge -> SYNTHETIC signature -> decision ----
  const issued = await call("POST", r1.issue, { token, body: issueBody });
  assert.equal(issued.status, 200, JSON.stringify(issued.json));
  const ch = issued.json.challenge;
  assert.equal(issued.json.owner_assurance, false);
  assert.equal(ch.rp_id, RP_ID);
  const decideBody = JSON.stringify({ approval_id: apId, challenge_id: ch.challenge_id, challenge_sha256: ch.challenge_sha256,
    payload_b64u: ch.payload_b64u, note: "SYNTHETIC gate3 approval", assertion: owner.signIssued(ch) });
  const claimed = await call("POST", r1.decide, { token, body: JSON.stringify({ ...JSON.parse(decideBody), human: "owner" }) });
  assert.equal(claimed.json.code, "client_claim_refused");
  assert.equal((await call("POST", r1.decide, { token, origin: "https://evil.invalid", body: decideBody })).json.code, "origin_mismatch");

  const decided = await call("POST", r1.decide, { token, body: decideBody });
  assert.equal(decided.status, 200, JSON.stringify(decided.json));
  assert.equal(decided.json.replay, false);
  assert.equal(decided.json.approval.status, "approved");
  assert.equal(decided.json.approval.state, "authorized_not_executed", "approval is permission, not execution");
  const row = bridge.db.prepare("SELECT approver, row_version FROM approvals WHERE approval_id=?").get(apId);
  assert.equal(row.approver, "owner", "human is the bridge's pinned principal, server-derived");
  assert.equal(assertions(), 1);

  // ---- exact original request replay (same bytes, same timing fields) ----
  const replay = await call("POST", r1.decide, { token, body: decideBody });
  assert.equal(replay.status, 200, JSON.stringify(replay.json));
  assert.equal(replay.json.replay, true);
  assert.deepEqual(replay.json.approval, decided.json.approval);
  assert.equal(assertions(), 1, "replay records nothing new");
  const altered = await call("POST", r1.decide, { token, body: JSON.stringify({ ...JSON.parse(decideBody), note: "changed" }) });
  assert.equal(altered.status, 400); assert.equal(altered.json.code, "note_mismatch");
  assert.equal(bridge.db.prepare("SELECT row_version FROM approvals WHERE approval_id=?").get(apId).row_version, row.row_version);

  // ---- logout revokes the binding; the same (still cryptographically valid) token is then refused ----
  const apId2 = await seedApproval();
  const r2 = routes(apId2);
  const viewed2 = (await call("GET", r2.view, { token })).json.approval;
  const body2 = JSON.stringify({ expected: tupleOf(viewed2), decision: "reject", note: null });
  const pending = await call("POST", r2.issue, { token, body: body2 });
  assert.equal(pending.status, 200, JSON.stringify(pending.json));
  const pc = pending.json.challenge;
  const pendingDecide = JSON.stringify({ approval_id: apId2, challenge_id: pc.challenge_id, challenge_sha256: pc.challenge_sha256,
    payload_b64u: pc.payload_b64u, note: null, assertion: owner.signIssued(pc) });

  assert.equal((await call("POST", "/api/auth/logout", { token, origin: "https://evil.invalid", site: "cross-site" })).status, 403);
  const logout = await call("POST", "/api/auth/logout", { token, origin: selfOrigin });
  assert.equal(logout.status, 200);
  assert.equal(logout.json.revocation, "revoked");
  assert.ok(logout.setCookie.some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && /max-age=0/i.test(c)));
  assert.equal(bridge.db.prepare("SELECT state FROM owner_challenges WHERE challenge_id=?").get(pc.challenge_id).state, "revoked");

  const afterIssue = await call("POST", r2.issue, { token, body: body2 });
  assert.equal(afterIssue.status, 403); assert.equal(afterIssue.json.code, "session_revoked");
  const afterDecide = await call("POST", r2.decide, { token, body: pendingDecide });
  assert.equal(afterDecide.status, 403); assert.equal(afterDecide.json.code, "session_revoked");
  const afterReplay = await call("POST", r1.decide, { token, body: decideBody });
  assert.equal(afterReplay.status, 403); assert.equal(afterReplay.json.code, "session_revoked");
  assert.equal(bridge.db.prepare("SELECT status FROM approvals WHERE approval_id=?").get(apId2).status, "pending");
  assert.equal(assertions(), 1);

  // ---- boundary: legacy decision never called, native CLI only ever read (no create/assign/send) ----
  for (const re of [/^POST \/v0\/approvals\/[^/]+\/owner-challenges$/, /^POST \/v0\/approvals\/[^/]+\/owner-challenges\/[^/]+\/decision$/, /^POST \/v0\/sessions\/revoke$/]) {
    assert.ok(bridgeCalls.some((c) => re.test(c)), `app reached the harness directly: ${re}`);
  }
  assert.ok(!bridgeCalls.some((c) => /^POST \/v0\/approvals\/[^/]+\/decision$/.test(c)), "legacy decision route never called");
  assert.ok(nativeCalls().every((argv) => argv[0] === "kanban" && argv[1] === "show" && argv[2] === TASK_ID), JSON.stringify(nativeCalls()));
});
