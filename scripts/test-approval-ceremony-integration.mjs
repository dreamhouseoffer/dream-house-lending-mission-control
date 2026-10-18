// OPT-IN LOCAL TEST integration: real `next start` HTTP login/session -> exact-terms challenge issue -> SYNTHETIC
// test-owner WebAuthn signature -> challenge decision -> exact replay -> logout revocation refusal, against the private
// bridge's NODE_TEST_CONTEXT-only ceremony harness (createCeremonyTestBridge). Production stays disabled:
//   - createCeremonyTestBridge throws outside `node --test`; the production createBridge refuses any ceremony config.
//   - that harness deliberately advertises NO approval_ceremony block, so the app adapter fails closed against it
//     (asserted below). Only THIS harness's loopback capability shim adds a SYNTHETIC advertisement, tagged
//     `synthetic_harness_injected`, so the app's reviewed gate can be exercised end to end. No real bridge says this.
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

// Loopback capability shim between the app and the harness bridge. Everything is forwarded byte for byte (HMAC is
// over method/target/ts/nonce/body, so it is unaffected); only the Host header is set to the bridge's own, and — while
// `inject` is true — the GET /v0/capabilities answer gains the SYNTHETIC ceremony advertisement.
function capabilityShim(bridgePort, limits) {
  const state = { inject: true, calls: [] };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      state.calls.push(`${req.method} ${req.url}`);
      const up = http.request({ host: "127.0.0.1", port: bridgePort, method: req.method, path: req.url, setHost: false,
        headers: { ...req.headers, host: `127.0.0.1:${bridgePort}` } }, (r) => {
        const out = [];
        r.on("data", (c) => out.push(c));
        r.on("end", () => {
          let body = Buffer.concat(out);
          if (state.inject && req.method === "GET" && req.url === "/v0/capabilities" && r.statusCode === 200) {
            const caps = JSON.parse(body.toString("utf8"));
            caps.ops = [...caps.ops, "POST /v0/approvals/:id/owner-challenges", "POST /v0/approvals/:id/owner-challenges/:challenge_id/decision", "POST /v0/sessions/revoke"];
            caps.approval_ceremony = { synthetic_harness_injected: true, mode: "challenge_only", version: 1, legacy_decision: "disabled",
              session_revocation: "durable", owner_enrollment: { kind: "webauthn_pinned", credentials: 1, rp_id: RP_ID },
              issue_rate_limit: { window_seconds: limits.windowSeconds, max_per_session: limits.maxPerSession } };
            body = Buffer.from(JSON.stringify(caps));
          }
          const headers = { ...r.headers, "content-length": String(body.length) };
          res.writeHead(r.statusCode, headers);
          res.end(body);
        });
      });
      up.on("error", () => { res.writeHead(502); res.end(); });
      up.end(Buffer.concat(chunks));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ state, port: server.address().port, close: () => new Promise((r) => server.close(r)) })));
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

  const bridge = createCeremonyTestBridge(bridgeOpts("bridge-SYNTHETIC.db", approvalsCfg));
  const bridgePort = await bridge.listen(0);
  const shim = await capabilityShim(bridgePort, limits);
  const { bridgeRequest, readBridgeConfig } = await import(pathToFileURL(path.join(ROOT, "src/lib/mission-control/bridge-client.mjs")).href);
  const { SESSION_COOKIE } = await import(pathToFileURL(path.join(ROOT, "src/lib/auth/session.mjs")).href);
  const direct = readBridgeConfig({ url: `http://127.0.0.1:${bridgePort}`, secret: bridgeSecret });

  const pin = randomBytes(9).toString("base64url");
  const port = await new Promise((resolve) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  const selfOrigin = `http://localhost:${port}`;
  const child = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      MISSION_CONTROL_PIN: pin, MISSION_CONTROL_SESSION_SECRET: randomBytes(48).toString("base64url"),
      MISSION_CONTROL_CANONICAL_ORIGIN: CANONICAL, MISSION_CONTROL_APPROVAL_CEREMONY: "challenge_only_v1",
      MC_BRIDGE_URL: `http://127.0.0.1:${shim.port}`, MC_BRIDGE_SECRET: bridgeSecret },
    stdio: ["ignore", openSync(path.join(dir, "next-start.log"), "a"), openSync(path.join(dir, "next-start.log"), "a")],
    detached: true,
  });
  t.after(async () => {
    if (child.exitCode === null) {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      await new Promise((r) => setTimeout(r, 1000));
      try { if (child.exitCode === null) process.kill(-child.pid, "SIGKILL"); } catch {}
    }
    await shim.close();
    await bridge.close();
  });
  await waitReady(base, child);

  const call = async (method, pathname, { token, origin = CANONICAL, site = "same-origin", body, extraHeaders = {} } = {}) => {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.cookie = `${SESSION_COOKIE}=${token}`;
    if (origin) headers.origin = origin;
    if (site) headers["sec-fetch-site"] = site;
    const res = await fetch(`${base}${pathname}`, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json, location: res.headers.get("location"), setCookie: res.headers.getSetCookie?.() ?? [] };
  };
  const seq = { n: 0 };
  const seedApproval = async () => {
    seq.n += 1;
    const r = await bridgeRequest(direct, "POST", "/v0/approvals", { acceptStatus: [201], idempotencyKey: `gate3-seed-${String(seq.n).padStart(8, "0")}`,
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

  // ---- fail closed against the reviewed harness as-is (no advertisement) ----
  shim.state.inject = false;
  const notAdvertised = await call("POST", r1.issue, { token, body: issueBody });
  assert.equal(notAdvertised.status, 503);
  assert.equal(notAdvertised.json.code, "ceremony_unavailable");
  shim.state.inject = true;

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
  assert.ok(!shim.state.calls.some((c) => /^POST \/v0\/approvals\/[^/]+\/decision$/.test(c)), "legacy decision route never called");
  assert.ok(nativeCalls().every((argv) => argv[0] === "kanban" && argv[1] === "show" && argv[2] === TASK_ID), JSON.stringify(nativeCalls()));
});
