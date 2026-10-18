// Contract tests for the fail-closed approval CEREMONY adapter (challenge issue, challenge decision, logout
// revocation). Every PIN, secret, origin, approval, credential and transport here is a SYNTHETIC fixture; no real
// credential, env file or bridge is read or contacted, and no WebAuthn ceremony is performed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSessionToken, readSessionConfig, verifySessionBinding } from '../src/lib/auth/session.mjs';
import { readBridgeConfig } from '../src/lib/mission-control/bridge-client.mjs';
import {
  CEREMONY_OPS,
  LEGACY_DECISION_OP,
  ceremonyAvailability,
  checkCeremonyCapability,
  handleChallengeDecision,
  handleChallengeIssue,
  revokeSessionOnLogout,
} from '../src/lib/mission-control/approval-ceremony.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const PIN = '7350';
const SECRET = 'synthetic-session-secret-ceremony-0123456789';
const BRIDGE_SECRET = 'synthetic-bridge-secret-ceremony-0123456789';
const ORIGIN = 'https://mc.test.invalid';
const HOST = 'mc.test.invalid';
const NOW = Date.parse('2026-10-17T12:00:00Z');
const env = {
  MISSION_CONTROL_PIN: PIN, MISSION_CONTROL_SESSION_SECRET: SECRET, MISSION_CONTROL_CANONICAL_ORIGIN: ORIGIN,
  MISSION_CONTROL_APPROVAL_CEREMONY: 'challenge_only_v1',
};
const cfg = readSessionConfig({ pin: PIN, secret: SECRET });
const bridgeConfig = readBridgeConfig({ url: 'http://127.0.0.1:1', secret: BRIDGE_SECRET });
const SAME = new Headers({ origin: ORIGIN, 'sec-fetch-site': 'same-origin' });
const SHA = 'b'.repeat(64);
const AP = 'ap_0123456789abcdef01234567';
const OCH = 'och_' + 'A'.repeat(32);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const CAPS = {
  ops: ['GET /v0/capabilities', 'GET /v0/approvals', 'GET /v0/approvals/:id', ...Object.values(CEREMONY_OPS)],
  read_only: false,
  approval_ceremony: {
    mode: 'challenge_only', version: 1, legacy_decision: 'disabled', session_revocation: 'durable',
    owner_enrollment: { kind: 'webauthn_pinned', credentials: 1, rp_id: HOST },
    issue_rate_limit: { window_seconds: 60, max_per_session: 5 },
  },
};

function approval(o = {}) {
  return {
    approval_id: AP, task_id: 't_abc123', state: 'awaiting_approval', status: 'pending',
    artifact: { id: 'art_demo', version: 2, sha256: SHA, latest_version: 2, is_latest: true },
    action: 'publish_demo', destination: 'synthetic://sink', max_cost_cents: 0,
    not_before: '2026-10-17T11:00:00.000Z', expires_at: '2026-10-17T13:00:00.000Z',
    requested_by: 'agent-demo', approver: null, approver_assurance: null, owner_verified: false,
    decided_at: null, decision_note: null, invalidated_reason: null, created_at: '2026-10-17T11:00:00.000Z',
    row_version: 3, executed: false, ...o,
  };
}
const expected = (o = {}) => ({
  approval_id: AP, row_version: 3, task_id: 't_abc123', requested_by: 'agent-demo',
  artifact: { id: 'art_demo', version: 2, sha256: SHA }, action: 'publish_demo', destination: 'synthetic://sink',
  max_cost_cents: 0, not_before: '2026-10-17T11:00:00.000Z', expires_at: '2026-10-17T13:00:00.000Z', ...o,
});

function payloadFor(sessionSha256, o = {}) {
  const x = expected();
  return Buffer.from(JSON.stringify({
    v: 'mcoa1', purpose: 'mc-bridge:approval-decision', rp_id: HOST, approval_id: AP, row_version: 3, task_id: x.task_id,
    requested_by: x.requested_by, artifact_id: 'art_demo', artifact_version: 2, artifact_sha256: SHA,
    action: x.action, destination: x.destination, max_cost_cents: 0, not_before: x.not_before, expires_at: x.expires_at,
    decision: 'approve', note_sha256: null, human: 'owner', session_sha256: sessionSha256, credential_id: 'cred_demo',
    iat: NOW / 1000, exp: NOW / 1000 + 120, nonce: 'n'.repeat(32), ...o,
  }));
}

/** Routes bridge calls by "METHOD path", verifies the HMAC like the bridge, and records everything. */
function bridge(routes) {
  const calls = [];
  const transport = async (req) => {
    calls.push({ ...req, json: req.body ? JSON.parse(req.body.toString()) : undefined });
    const h = req.headers;
    const bodyHash = createHash('sha256').update(req.body || Buffer.alloc(0)).digest('hex');
    const sig = createHmac('sha256', Buffer.from(BRIDGE_SECRET))
      .update(['mc-bridge-v1', req.method, req.target, h['x-mc-timestamp'], h['x-mc-nonce'], bodyHash].join('\n')).digest('hex');
    assert.equal(h['x-mc-signature'], sig);
    const r = routes[`${req.method} ${req.target}`];
    if (!r) return { status: 404, contentType: 'application/json', body: Buffer.from('{"error":"not_found"}') };
    const [status, json] = typeof r === 'function' ? r(calls.at(-1)) : r;
    return { status, contentType: 'application/json', body: Buffer.from(JSON.stringify(json)) };
  };
  return { calls, transport };
}

const token = (at = NOW) => createSessionToken(cfg, { now: at });
const binding = async (t) => (await verifySessionBinding(cfg, t, { now: NOW })).sessionSha256;
const issueBody = (o = {}) => JSON.stringify({ expected: expected(), decision: 'approve', note: null, ...o });
const issue = async (o = {}) => handleChallengeIssue({ env, headers: SAME, approvalId: AP, bridgeConfig, now: NOW, bodyText: issueBody(), ...o });

function happyBridge(sessionOverride) {
  return bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`GET /v0/approvals/${AP}`]: [200, { approval: approval(), observed_at: '2026-10-17T12:00:00Z' }],
    [`POST /v0/approvals/${AP}/owner-challenges`]: (call) => {
      const p = payloadFor(sessionOverride ?? call.json.session_sha256);
      return [200, { challenge: { challenge_id: OCH, challenge_sha256: sha256(p), payload_b64u: p.toString('base64url'), approval_id: AP, row_version: 3, owner_assurance: false } }];
    },
  });
}

// ---------- capability gate ----------

test('capability gate: only the exact reviewed challenge-only advertisement opens the ceremony', () => {
  assert.deepEqual(checkCeremonyCapability(CAPS, { canonicalHost: HOST }), { available: true, rpId: HOST });
  const without = (mut) => { const c = structuredClone(CAPS); mut(c); return checkCeremonyCapability(c, { canonicalHost: HOST }).reason; };
  assert.equal(checkCeremonyCapability(null, { canonicalHost: HOST }).reason, 'capabilities_malformed');
  assert.equal(without((c) => c.ops.push(LEGACY_DECISION_OP)), 'legacy_decision_still_advertised');
  assert.equal(without((c) => { c.ops = c.ops.filter((o) => o !== CEREMONY_OPS.revoke); }), 'ceremony_ops_missing');
  assert.equal(without((c) => { delete c.approval_ceremony; }), 'ceremony_not_advertised');
  assert.equal(without((c) => { c.approval_ceremony.mode = 'challenge_or_legacy'; }), 'ceremony_mode_unsupported');
  assert.equal(without((c) => { c.approval_ceremony.legacy_decision = 'enabled'; }), 'legacy_decision_not_disabled');
  assert.equal(without((c) => { c.approval_ceremony.session_revocation = 'memory'; }), 'session_revocation_not_durable');
  assert.equal(without((c) => { c.approval_ceremony.owner_enrollment.credentials = 0; }), 'owner_enrollment_missing');
  assert.equal(without((c) => { c.approval_ceremony.owner_enrollment.kind = 'pin'; }), 'owner_enrollment_missing');
  assert.equal(without((c) => { c.approval_ceremony.owner_enrollment.rp_id = 'evil.invalid'; }), 'owner_rp_id_mismatch');
  assert.equal(without((c) => { delete c.approval_ceremony.issue_rate_limit; }), 'issue_rate_limit_missing');
});

test('availability: no owner opt-in or no canonical origin fails closed before any bridge call', async () => {
  const b = happyBridge();
  assert.equal((await ceremonyAvailability({ env: { ...env, MISSION_CONTROL_APPROVAL_CEREMONY: undefined }, bridgeConfig, transport: b.transport, now: NOW })).reason, 'ceremony_not_enabled');
  assert.equal((await ceremonyAvailability({ env: { ...env, MISSION_CONTROL_APPROVAL_CEREMONY: 'true' }, bridgeConfig, transport: b.transport, now: NOW })).reason, 'ceremony_not_enabled');
  assert.equal((await ceremonyAvailability({ env: { ...env, MISSION_CONTROL_CANONICAL_ORIGIN: undefined }, bridgeConfig, transport: b.transport, now: NOW })).available, false);
  assert.equal(b.calls.length, 0);
});

test('unsupported backend: today\'s bridge capabilities (no ceremony block, legacy decision op) keep issue and decision 503', async () => {
  const today = { ops: ['GET /v0/approvals', 'GET /v0/approvals/:id', 'POST /v0/approvals', LEGACY_DECISION_OP], read_only: false, unsupported: {} };
  const b = bridge({ 'GET /v0/capabilities': [200, today] });
  const t = await token();
  const r = await issue({ token: t, transport: b.transport });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'ceremony_unavailable');
  assert.equal(r.body.reason, 'legacy_decision_still_advertised');
  const d = await handleChallengeDecision({ env, token: t, headers: SAME, approvalId: AP, bridgeConfig, transport: b.transport, now: NOW, bodyText: '{}' });
  assert.equal(d.status, 503);
  assert.deepEqual(b.calls.map((c) => `${c.method} ${c.target}`), ['GET /v0/capabilities', 'GET /v0/capabilities']);
  // An offline or unconfigured bridge is just as closed.
  const off = await issue({ token: t, transport: async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }); } });
  assert.equal(off.status, 503);
  assert.equal(off.body.reason, 'bridge_offline');
});

// ---------- auth / origin / session ----------

test('auth: missing, forged or stale cookie and missing session config are refused before the bridge', async () => {
  const b = happyBridge();
  assert.equal((await issue({ transport: b.transport })).status, 401);
  assert.equal((await issue({ token: 'mcs1.x.y', transport: b.transport })).status, 401);
  const old = await token(NOW - 16 * 60 * 1000);
  const stale = await issue({ token: old, transport: b.transport });
  assert.equal(stale.status, 401);
  assert.equal(stale.body.code, 'reauth_required');
  assert.equal((await issue({ token: await token(), env: { ...env, MISSION_CONTROL_SESSION_SECRET: undefined }, transport: b.transport })).status, 503);
  assert.equal(b.calls.length, 0);
});

test('origin: cross-origin, missing Origin and non same-origin fetch site are refused', async () => {
  const b = happyBridge();
  const t = await token();
  for (const [h, code] of [
    [{ 'sec-fetch-site': 'same-origin' }, 'origin_missing'],
    [{ origin: 'https://evil.invalid', 'sec-fetch-site': 'same-origin' }, 'origin_mismatch'],
    [{ origin: ORIGIN }, 'fetch_site_missing'],
    [{ origin: ORIGIN, 'sec-fetch-site': 'same-site' }, 'fetch_site_not_same_origin'],
  ]) {
    const r = await issue({ token: t, headers: new Headers(h), transport: b.transport });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, code);
  }
  assert.equal(b.calls.length, 0);
});

test('caller claims: session/human/principal/credential/rp_id keys at any depth are refused, never merged', async () => {
  const b = happyBridge();
  const t = await token();
  for (const extra of [
    { session_sha256: 'c'.repeat(64) }, { human: 'owner' }, { principal: 'owner' }, { owner_verified: true },
    { expected: { ...expected(), approver: 'owner' } }, { expected: { ...expected(), artifact: { id: 'art_demo', version: 2, sha256: SHA, rp_id: HOST } } },
    { credential: 'x' }, { idempotency_key: 'k'.repeat(20) },
  ]) {
    const r = await issue({ token: t, transport: b.transport, bodyText: issueBody(extra) });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
  const hdr = await issue({ token: t, headers: new Headers({ origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'x-mc-session-sha256': 'c'.repeat(64) }), transport: b.transport });
  assert.equal(hdr.status, 400);
  assert.equal(b.calls.length, 0);
});

// ---------- shape / tuple ----------

test('shape: exact issue body, approval id, decision and note rules', async () => {
  const b = happyBridge();
  const t = await token();
  const bad = async (bodyText, approvalId = AP) => (await issue({ token: t, transport: b.transport, bodyText, approvalId })).body.code;
  assert.equal(await bad(issueBody(), 'ap_bad'), 'invalid_approval_id');
  assert.equal(await bad('not json'), 'invalid_json');
  assert.equal(await bad('[]'), 'invalid_body');
  assert.equal(await bad('x'.repeat(17 * 1024)), 'body_too_large');
  assert.equal(await bad(JSON.stringify({ expected: expected(), decision: 'approve' })), 'invalid_shape');
  assert.equal(await bad(issueBody({ extra: 1 })), 'invalid_shape');
  assert.equal(await bad(issueBody({ expected: expected({ approval_id: 'ap_' + 'f'.repeat(24) }) })), 'approval_id_mismatch');
  assert.equal(await bad(issueBody({ expected: { ...expected(), extra: 1 } })), 'invalid_expected_terms');
  assert.equal(await bad(issueBody({ decision: 'execute' })), 'invalid_decision');
  assert.equal(await bad(issueBody({ decision: 'revise', note: ' ' })), 'revision_note_required');
  assert.equal(await bad(issueBody({ note: 'bad\u0007note' })), 'invalid_note');
});

test('tuple: a changed row_version, artifact, action, destination, cost or window is terms_changed with no issue call', async () => {
  const t = await token();
  for (const o of [{ row_version: 4 }, { artifact: { id: 'art_demo', version: 2, sha256: 'c'.repeat(64) } }, { action: 'send_email' },
    { destination: 'synthetic://other' }, { max_cost_cents: 5 }, { expires_at: '2026-10-17T14:00:00.000Z' }]) {
    const b = happyBridge();
    const r = await issue({ token: t, transport: b.transport, bodyText: issueBody({ expected: expected(o) }) });
    assert.equal(r.status, 409, JSON.stringify(o));
    assert.equal(r.body.code, 'terms_changed');
    assert.ok(!b.calls.some((c) => c.method === 'POST'));
  }
  const b = bridge({ 'GET /v0/capabilities': [200, CAPS], [`GET /v0/approvals/${AP}`]: [200, { approval: approval({ state: 'stale' }), observed_at: '2026-10-17T12:00:00Z' }] });
  assert.equal((await issue({ token: t, transport: b.transport })).body.code, 'approval_not_pending');
});

// ---------- issue happy path / payload verification / rate limit ----------

test('issue: fixed path, cookie-derived binding, server idempotency key, verified payload, no assurance claimed', async () => {
  const t = await token();
  const b = happyBridge();
  const r = await issue({ token: t, transport: b.transport });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.owner_assurance, false);
  assert.equal(r.body.challenge.challenge_id, OCH);
  assert.equal(r.body.challenge.rp_id, HOST);
  assert.equal(Buffer.from(r.body.challenge.webauthn_challenge_b64u, 'base64url').toString('hex'), r.body.challenge.challenge_sha256);
  const post = b.calls.find((c) => c.method === 'POST');
  assert.equal(post.target, `/v0/approvals/${AP}/owner-challenges`);
  assert.deepEqual(Object.keys(post.json).sort(), ['decision', 'expected', 'note', 'session_sha256']);
  assert.equal(post.json.session_sha256, await binding(t));
  assert.match(post.headers['idempotency-key'], /^och-issue-[A-Za-z0-9_-]{24}$/);
  assert.ok(!b.calls.some((c) => c.target.endsWith('/decision')));
  // Two issues use two different keys (re-issue supersedes on the bridge; nothing is replayed from the app).
  await issue({ token: t, transport: b.transport });
  const keys = b.calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
  assert.notEqual(keys[0], keys[1]);
});

test('issue: payload bound to another session, wrong hash or wrong rp_id is refused', async () => {
  const t = await token();
  assert.equal((await issue({ token: t, transport: happyBridge('d'.repeat(64)).transport })).body.code, 'challenge_payload_mismatch');
  const tampered = bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`GET /v0/approvals/${AP}`]: [200, { approval: approval(), observed_at: '2026-10-17T12:00:00Z' }],
    [`POST /v0/approvals/${AP}/owner-challenges`]: (call) => {
      const p = payloadFor(call.json.session_sha256, { rp_id: 'evil.invalid' });
      return [200, { challenge: { challenge_id: OCH, challenge_sha256: sha256(p), payload_b64u: p.toString('base64url'), approval_id: AP, row_version: 3, owner_assurance: false } }];
    },
  });
  assert.equal((await issue({ token: t, transport: tampered.transport })).body.code, 'challenge_payload_mismatch');
  const wrongHash = bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`GET /v0/approvals/${AP}`]: [200, { approval: approval(), observed_at: '2026-10-17T12:00:00Z' }],
    [`POST /v0/approvals/${AP}/owner-challenges`]: (call) => {
      const p = payloadFor(call.json.session_sha256);
      return [200, { challenge: { challenge_id: OCH, challenge_sha256: 'e'.repeat(64), payload_b64u: p.toString('base64url'), approval_id: AP, row_version: 3, owner_assurance: false } }];
    },
  });
  assert.equal((await issue({ token: t, transport: wrongHash.transport })).body.code, 'challenge_payload_mismatch');
  const claimsAssurance = bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`GET /v0/approvals/${AP}`]: [200, { approval: approval(), observed_at: '2026-10-17T12:00:00Z' }],
    [`POST /v0/approvals/${AP}/owner-challenges`]: [200, { challenge: { challenge_id: OCH, challenge_sha256: SHA, payload_b64u: 'e30', approval_id: AP, row_version: 3, owner_assurance: true } }],
  });
  assert.equal((await issue({ token: t, transport: claimsAssurance.transport })).body.code, 'schema_mismatch');
});

test('issue rate limit: bridge 429 surfaces as issue_rate_limited with a clamped retry_after', async () => {
  const t = await token();
  const b = bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`GET /v0/approvals/${AP}`]: [200, { approval: approval(), observed_at: '2026-10-17T12:00:00Z' }],
    [`POST /v0/approvals/${AP}/owner-challenges`]: [429, { error: 'issue_rate_limited', retry_after: 10 ** 9 }],
  });
  const r = await issue({ token: t, transport: b.transport });
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'issue_rate_limited');
  assert.equal(r.body.retry_after, 24 * 60 * 60);
});

// ---------- decision ----------

const clientData = (o = {}) => Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: '', origin: ORIGIN, crossOrigin: false, ...o }));
async function decideFixture(o = {}, { payload = {}, cd = {} } = {}) {
  const t = await token();
  const p = payloadFor(await binding(t), payload);
  const h = sha256(p);
  const assertion = {
    credential_id: 'cred_demo', authenticator_data: 'AAAA', signature: 'AAAA',
    client_data_json: clientData({ challenge: Buffer.from(h, 'hex').toString('base64url'), ...cd }).toString('base64url'),
  };
  const body = { approval_id: AP, challenge_id: OCH, challenge_sha256: h, payload_b64u: p.toString('base64url'), note: null, assertion, ...o };
  return { t, p, h, assertion, body, bodyText: JSON.stringify(body) };
}
const decide = async (o = {}) => handleChallengeDecision({ env, headers: SAME, approvalId: AP, bridgeConfig, now: NOW, ...o });

test('decision: fixed challenge path only, binding from cookie, terms from issued payload, challenge-derived idempotency key, never the legacy route', async () => {
  const f = await decideFixture();
  const b = bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`POST /v0/approvals/${AP}/owner-challenges/${OCH}/decision`]: [200, { approval: approval({ state: 'authorized_not_executed', status: 'approved', owner_verified: true }), deduplicated: false }],
  });
  const r = await decide({ token: f.t, transport: b.transport, bodyText: f.bodyText });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.approval.external_execution, 'not_connected');
  assert.equal(r.body.replay, false);
  const post = b.calls.find((c) => c.method === 'POST');
  assert.equal(post.target, `/v0/approvals/${AP}/owner-challenges/${OCH}/decision`);
  assert.equal(post.headers['idempotency-key'], `och-decide-${OCH}`);
  assert.equal(post.json.session_sha256, await binding(f.t));
  // Exactly the bridge's Gate2 DECIDE_KEYS; decision and artifact pin come from the issued payload bytes.
  assert.deepEqual(Object.keys(post.json).sort(), ['artifact_sha256', 'artifact_version', 'decision', 'note', 'owner_assertion', 'session_sha256']);
  const issued = JSON.parse(f.p.toString('utf8'));
  assert.equal(post.json.decision, issued.decision);
  assert.equal(post.json.artifact_version, issued.artifact_version);
  assert.equal(post.json.artifact_sha256, issued.artifact_sha256);
  // Exactly the private verifier's raw assertion keys, with the issued payload bytes verbatim.
  assert.deepEqual(Object.keys(post.json.owner_assertion).sort(), ['authenticator_data', 'client_data_json', 'credential_id', 'payload', 'signature']);
  assert.equal(post.json.owner_assertion.payload, f.p.toString('base64url'));
  // A bridge answer without the boolean deduplicated flag is a schema mismatch, not a decision.
  const legacyShape = bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`POST /v0/approvals/${AP}/owner-challenges/${OCH}/decision`]: [200, { approval: approval({ state: 'authorized_not_executed', status: 'approved', owner_verified: true }), replay: false }],
  });
  assert.equal((await decide({ token: f.t, transport: legacyShape.transport, bodyText: f.bodyText })).body.code, 'schema_mismatch');
  assert.ok(!b.calls.some((c) => c.target === `/v0/approvals/${AP}/decision`));
});

test('decision: payload/session/note/credential/clientData pre-checks refuse before any decision call', async () => {
  const b = bridge({ 'GET /v0/capabilities': [200, CAPS] });
  const run = async (o, opts) => {
    const f = await decideFixture(o, opts);
    return (await decide({ token: f.t, transport: b.transport, bodyText: f.bodyText })).body.code;
  };
  assert.equal(await run({ challenge_sha256: 'e'.repeat(64) }), 'challenge_payload_mismatch');
  assert.equal(await run({}, { payload: { v: 1 } }), 'challenge_payload_mismatch');
  assert.equal(await run({}, { payload: { rp_id: 'evil.invalid' } }), 'challenge_payload_mismatch');
  assert.equal(await run({}, { payload: { session_sha256: 'd'.repeat(64) } }), 'challenge_session_mismatch');
  assert.equal(await run({ note: 'x' }), 'note_mismatch');
  assert.equal(await run({}, { payload: { credential_id: 'cred_other' } }), 'credential_mismatch');
  assert.equal(await run({}, { payload: { iat: NOW / 1000 - 200, exp: NOW / 1000 - 1 } }), 'challenge_expired');
  assert.equal(await run({}, { cd: { origin: 'https://evil.invalid' } }), 'client_data_mismatch');
  assert.equal(await run({}, { cd: { type: 'webauthn.create' } }), 'client_data_mismatch');
  assert.equal(await run({}, { cd: { challenge: 'AAAA' } }), 'client_data_mismatch');
  assert.equal(await run({}, { cd: { crossOrigin: true } }), 'client_data_mismatch');
  assert.ok(!b.calls.some((c) => c.method === 'POST'));
});

test('decision: shape refusals and bridge refusals pass through as codes only', async () => {
  const b = bridge({ 'GET /v0/capabilities': [200, CAPS], [`POST /v0/approvals/${AP}/owner-challenges/${OCH}/decision`]: [409, { error: 'challenge_replayed' }] });
  const f = await decideFixture();
  const code = async (o) => (await decide({ token: f.t, transport: b.transport, bodyText: JSON.stringify({ ...f.body, ...o }) })).body.code;
  assert.equal(await code({ challenge_id: 'och_short' }), 'invalid_challenge_id');
  assert.equal(await code({ challenge_sha256: 'X'.repeat(64) }), 'invalid_challenge_sha256');
  assert.equal(await code({ approval_id: 'ap_' + 'f'.repeat(24) }), 'approval_id_mismatch');
  assert.equal(await code({ payload_b64u: 'e30=' }), 'invalid_payload');
  assert.equal(await code({ note: 'bad\u0007' }), 'invalid_note');
  assert.equal(await code({ assertion: { ...f.assertion, user_handle: 'x' } }), 'invalid_assertion_shape');
  assert.equal(await code({ assertion: { ...f.assertion, signature: 'not base64url!' } }), 'invalid_assertion_shape');
  assert.equal(await code({ assertion: { ...f.assertion, signature: 'AAB' } }), 'invalid_assertion_shape');
  assert.equal(await code({ human: 'owner' }), 'client_claim_refused');
  const r = await decide({ token: f.t, transport: b.transport, bodyText: f.bodyText });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'challenge_replayed');
});

test('issue: expired or over-long issued window and non-canonical payload key order are refused', async () => {
  const t = await token();
  const mk = (bytes) => bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`GET /v0/approvals/${AP}`]: [200, { approval: approval(), observed_at: '2026-10-17T12:00:00Z' }],
    [`POST /v0/approvals/${AP}/owner-challenges`]: (call) => {
      const p = bytes(call.json.session_sha256);
      return [200, { challenge: { challenge_id: OCH, challenge_sha256: sha256(p), payload_b64u: p.toString('base64url'), approval_id: AP, row_version: 3, owner_assurance: false } }];
    },
  });
  for (const bytes of [
    (s) => payloadFor(s, { iat: NOW / 1000 - 300, exp: NOW / 1000 - 1 }),
    (s) => payloadFor(s, { exp: NOW / 1000 + 301 }),
    (s) => { const o = JSON.parse(payloadFor(s)); const { v, ...rest } = o; return Buffer.from(JSON.stringify({ ...rest, v })); },
    (s) => Buffer.from(JSON.stringify(JSON.parse(payloadFor(s)), null, 1)),
  ]) {
    assert.equal((await issue({ token: t, transport: mk(bytes).transport })).body.code, 'challenge_payload_mismatch');
  }
});

// ---------- logout revocation ----------

test('logout revocation: unsupported without the ceremony, durable revoke of the cookie binding when available', async () => {
  const t = await token();
  const none = bridge({});
  assert.equal(await revokeSessionOnLogout({ env: { ...env, MISSION_CONTROL_APPROVAL_CEREMONY: undefined }, token: t, bridgeConfig, transport: none.transport, now: NOW }), 'unsupported');
  assert.equal(none.calls.length, 0);
  assert.equal(await revokeSessionOnLogout({ env, token: undefined, bridgeConfig, transport: none.transport, now: NOW }), 'no_session');
  const b = bridge({ 'GET /v0/capabilities': [200, CAPS], 'POST /v0/sessions/revoke': [200, { revoked: true }] });
  assert.equal(await revokeSessionOnLogout({ env, token: t, bridgeConfig, transport: b.transport, now: NOW }), 'revoked');
  const post = b.calls.find((c) => c.method === 'POST');
  assert.deepEqual(post.json, { session_sha256: await binding(t), reason: 'app_logout' });
  const down = bridge({ 'GET /v0/capabilities': [200, CAPS], 'POST /v0/sessions/revoke': [503, { error: 'x' }] });
  assert.equal(await revokeSessionOnLogout({ env, token: t, bridgeConfig, transport: down.transport, now: NOW }), 'failed');
});

// ---------- static boundary ----------

test('static: adapter never names the legacy decision path as a target, routes stay thin and no UI calls them', async () => {
  const lib = await src('src/lib/mission-control/approval-ceremony.mjs');
  assert.ok(!/\/v0\/approvals\/\$\{[^}]+\}\/decision/.test(lib));
  assert.ok(!/console\./.test(lib));
  for (const p of ['src/app/api/control/approvals/[id]/challenge/route.ts', 'src/app/api/control/approvals/[id]/decision/route.ts']) {
    const r = await src(p);
    assert.match(r, /runtime = "nodejs"/);
    assert.ok(!/export async function GET/.test(r));
  }
  const logout = await src('src/app/api/auth/logout/route.ts');
  assert.match(logout, /isSameOriginRequest/);
  assert.match(logout, /maxAge: 0/);
  for (const p of ['src/app/approvals/page.tsx']) assert.ok(!/\/challenge|\/decision/.test(await src(p)), p);
});
