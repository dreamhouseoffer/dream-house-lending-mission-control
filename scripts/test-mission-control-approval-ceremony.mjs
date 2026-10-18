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

// ---------- Gate6: browser owner-challenge panel logic (SYNTHETIC; no real authenticator) ----------

const ui = await import('../src/lib/mission-control/owner-challenge-ui.mjs');
const { checkApproval } = await import('../src/lib/mission-control/approvals-client.mjs');
const CRED = Buffer.alloc(32, 7).toString('base64url');
const AVAIL = { available: true, rpId: HOST, origin: ORIGIN };
const LOC = { origin: ORIGIN, hostname: HOST };
const BROWSER = { secureContext: true, publicKeyCredential: true, credentialsGet: true };
const viewed = (o = {}) => checkApproval(approval(o));

/** A SYNTHETIC stand-in for navigator.credentials.get(): records options, answers a fixed-shape credential. */
function fakeCredential({ challengeSha256, origin = ORIGIN, rawId = Buffer.from(CRED, 'base64url'), type = 'public-key' }) {
  const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: Buffer.from(challengeSha256, 'hex').toString('base64url'), origin, crossOrigin: false }));
  return { type, rawId: ab(rawId), response: { clientDataJSON: ab(cd), authenticatorData: ab(Buffer.alloc(37, 1)), signature: ab(Buffer.alloc(70, 2)) } };
}

test('panel b64u: canonical unpadded round trip; padding, non-alphabet and non-canonical text refused', () => {
  for (const n of [0, 1, 2, 3, 31, 32, 33, 70000]) {
    const b = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37) & 255));
    const e = ui.b64uEncode(new Uint8Array(b));
    assert.equal(e, b.toString('base64url'));
    assert.deepEqual(Buffer.from(ui.b64uDecode(e)), b);
  }
  assert.equal(ui.b64uEncode(new Uint8Array([1, 2]).buffer), 'AQI');
  for (const bad of ['AQI=', 'AQ+I', 'AQ/I', 'A', 'AR', 'AQJ', ' AQI', null, 7]) assert.equal(ui.b64uDecode(bad), null, String(bad));
  assert.equal(ui.b64uEncode('not bytes'), null);
});

test('panel gate: disabled unless server availability, canonical origin, matching rp_id and WebAuthn support all hold', () => {
  const g = (o = {}) => ui.panelGate({ server: AVAIL, location: LOC, browser: BROWSER, ...o });
  assert.deepEqual(g(), { enabled: true, rpId: HOST, origin: ORIGIN });
  assert.equal(ui.panelGate().reason, 'ceremony_not_enabled');
  assert.equal(g({ server: { available: false, reason: 'ceremony_not_enabled' } }).reason, 'ceremony_not_enabled');
  assert.equal(g({ server: { available: false, reason: 'legacy_decision_still_advertised' } }).reason, 'legacy_decision_still_advertised');
  assert.match(g({ server: { available: false, reason: 'bridge_offline' } }).message, /could not be reached/);
  assert.equal(g({ server: { available: true, rpId: 'other.invalid', origin: ORIGIN } }).reason, 'owner_rp_id_mismatch');
  assert.equal(g({ server: { available: true, rpId: HOST, origin: 'http://mc.test.invalid' } }).reason, 'origin_invalid');
  assert.equal(g({ server: { available: true, rpId: HOST, origin: `${ORIGIN}/x` } }).reason, 'origin_invalid');
  assert.equal(g({ server: { available: true, origin: ORIGIN } }).reason, 'ceremony_not_advertised');
  assert.equal(g({ location: { origin: 'https://preview.test.invalid', hostname: 'preview.test.invalid' } }).reason, 'canonical_origin_mismatch');
  assert.equal(g({ location: { origin: ORIGIN, hostname: 'evil.invalid' } }).reason, 'rp_id_mismatch');
  for (const k of Object.keys(BROWSER)) assert.equal(g({ browser: { ...BROWSER, [k]: false } }).reason, 'webauthn_unsupported', k);
  for (const r of ['ceremony_not_enabled', 'canonical_origin_mismatch', 'rp_id_mismatch', 'webauthn_unsupported']) assert.ok(ui.GATE_COPY[r]);
});

test('panel eligibility: only a pending latest-version approval inside its window is decidable', () => {
  assert.deepEqual(ui.approvalEligibility(viewed(), NOW), { eligible: true });
  assert.equal(ui.approvalEligibility(viewed({ state: 'authorized_not_executed', status: 'approved' }), NOW).reason, 'approval_not_pending');
  assert.equal(ui.approvalEligibility(viewed({ state: 'stale' }), NOW).reason, 'approval_not_pending');
  assert.equal(ui.approvalEligibility(viewed({ artifact: { ...approval().artifact, is_latest: false, latest_version: 3 } }), NOW).reason, 'artifact_not_latest');
  assert.equal(ui.approvalEligibility(viewed(), Date.parse('2026-10-17T13:00:00Z')).reason, 'approval_expired');
  assert.equal(ui.approvalEligibility(viewed(), Date.parse('2026-10-17T10:00:00Z')).reason, 'approval_not_yet_open');
  assert.equal(ui.approvalEligibility(null, NOW).reason, 'approval_unreadable');
  assert.match(ui.approvalEligibility(viewed({ state: 'authorized_not_executed' }), NOW).message, /authorized, not executed/);
});

test('panel note: blank is null, revise requires a note, control characters and over-long notes refused', () => {
  assert.deepEqual(ui.normalizeNote('approve', '   '), { ok: true, note: null });
  assert.deepEqual(ui.normalizeNote('approve', 'ok'), { ok: true, note: 'ok' });
  assert.equal(ui.normalizeNote('revise', '').code, 'revision_note_required');
  assert.equal(ui.normalizeNote('approve', 'a\u0007b').code, 'invalid_note');
  assert.equal(ui.normalizeNote('approve', 'x'.repeat(ui.MAX_NOTE + 1)).code, 'invalid_note');
  assert.equal(ui.normalizeNote('execute', null).code, 'invalid_decision');
});

test('panel end to end (SYNTHETIC): UI issue body -> real issue handler -> browser re-check -> get() options -> serialized assertion -> real decision handler', async () => {
  const t = await token();
  const a = viewed();
  // Issue: the panel body has exactly the adapter keys and no identity claim; the real handler accepts it.
  const issueText = ui.buildIssueBody(a, 'approve', null);
  assert.deepEqual(Object.keys(JSON.parse(issueText)), ['expected', 'decision', 'note']);
  assert.ok(!/session|human|principal|credential|rp_id|owner/.test(issueText.replace(/"requested_by"/, '')), issueText);
  const b = bridge({
    'GET /v0/capabilities': [200, CAPS],
    [`GET /v0/approvals/${AP}`]: [200, { approval: approval(), observed_at: '2026-10-17T12:00:00Z' }],
    [`POST /v0/approvals/${AP}/owner-challenges`]: (call) => {
      const p = payloadFor(call.json.session_sha256, { credential_id: CRED });
      return [200, { challenge: { challenge_id: OCH, challenge_sha256: sha256(p), payload_b64u: p.toString('base64url'), approval_id: AP, row_version: 3, owner_assurance: false } }];
    },
    [`POST /v0/approvals/${AP}/owner-challenges/${OCH}/decision`]: [200, { approval: approval({ state: 'authorized_not_executed', status: 'approved', owner_verified: true, approver: 'owner' }), deduplicated: false }],
  });
  const issued = await handleChallengeIssue({ env, headers: SAME, token: t, approvalId: AP, bridgeConfig, transport: b.transport, now: NOW, bodyText: issueText });
  const ic = ui.classifyIssueResponse({ status: issued.status, data: issued.body });
  assert.equal(ic.outcome, 'issued', JSON.stringify(issued.body));

  // The browser re-derives the exact signed terms from the issued bytes before any gesture.
  const v = await ui.verifyIssuedChallenge(ic.challenge, { approval: a, decision: 'approve', note: null, rpId: HOST, now: NOW });
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.terms.destination, 'synthetic://sink');
  assert.equal(v.terms.action, 'publish_demo');
  assert.deepEqual(v.terms.artifact, { id: 'art_demo', version: 2, sha256: SHA });
  assert.equal(v.terms.decision, 'approve');
  const opts = ui.requestOptions(v, NOW);
  assert.equal(Buffer.from(opts.challenge).toString('hex'), ic.challenge.challenge_sha256);
  assert.equal(opts.rpId, HOST);
  assert.equal(opts.userVerification, 'required');
  assert.deepEqual(opts.allowCredentials.map((c) => [c.type, Buffer.from(c.id).toString('base64url')]), [['public-key', CRED]]);
  assert.equal(opts.timeout, 120_000);
  assert.ok(!('user' in opts) && !('pubKeyCredParams' in opts), 'request options only; never create()');

  // SYNTHETIC get() answer -> canonical serialization -> exact decide body -> real decision handler.
  const s = ui.serializeAssertion(fakeCredential({ challengeSha256: v.challenge.challenge_sha256 }), v.terms.credential_id);
  assert.equal(s.ok, true);
  assert.deepEqual(Object.keys(s.assertion), ['credential_id', 'client_data_json', 'authenticator_data', 'signature']);
  for (const x of Object.values(s.assertion)) assert.match(x, /^[A-Za-z0-9_-]+$/);
  const decideText = ui.buildDecideBody(v.challenge, null, s.assertion);
  assert.deepEqual(Object.keys(JSON.parse(decideText)), ['approval_id', 'challenge_id', 'challenge_sha256', 'payload_b64u', 'note', 'assertion']);
  const decided = await handleChallengeDecision({ env, headers: SAME, token: t, approvalId: AP, bridgeConfig, transport: b.transport, now: NOW, bodyText: decideText });
  const dc = ui.classifyDecideResponse({ status: decided.status, data: decided.body });
  assert.equal(dc.outcome, 'decided', JSON.stringify(decided.body));
  const copy = ui.decisionResultCopy(dc.approval);
  assert.equal(copy.title, 'Approved: authorized, not executed');
  assert.match(copy.detail, /not connected/);
  assert.ok(!b.calls.some((c) => c.target === `/v0/approvals/${AP}/decision`), 'legacy decision route never called');
  assert.deepEqual(b.calls.filter((c) => c.method === 'POST').map((c) => c.target), [`/v0/approvals/${AP}/owner-challenges`, `/v0/approvals/${AP}/owner-challenges/${OCH}/decision`]);
});

test('panel re-check: tampered, mismatched or expired issued challenges never reach a gesture', async () => {
  const a = viewed();
  const mk = (payload = {}, o = {}) => {
    const p = payloadFor('c'.repeat(64), { credential_id: CRED, ...payload });
    const h = sha256(p);
    return { challenge_id: OCH, challenge_sha256: h, payload_b64u: p.toString('base64url'), webauthn_challenge_b64u: Buffer.from(h, 'hex').toString('base64url'), rp_id: HOST, approval_id: AP, row_version: 3, ...o };
  };
  const check = (c, ctx = {}) => ui.verifyIssuedChallenge(c, { approval: a, decision: 'approve', note: null, rpId: HOST, now: NOW, ...ctx });
  assert.equal((await check(mk())).ok, true);
  assert.equal((await check(mk({ destination: 'synthetic://elsewhere' }))).code, 'challenge_terms_mismatch');
  assert.equal((await check(mk({ artifact_sha256: 'c'.repeat(64) }))).code, 'challenge_terms_mismatch');
  assert.equal((await check(mk({ decision: 'reject' }))).code, 'challenge_terms_mismatch');
  assert.equal((await check(mk(), { note: 'a note the owner typed' })).code, 'challenge_terms_mismatch');
  assert.equal((await check(mk({ rp_id: 'other.invalid' }))).code, 'challenge_terms_mismatch');
  assert.equal((await check(mk(), { rpId: 'other.invalid' })).code, 'challenge_mismatch');
  assert.equal((await check(mk({}, { challenge_sha256: 'd'.repeat(64) }))).code, 'challenge_mismatch');
  assert.equal((await check(mk({}, { webauthn_challenge_b64u: 'AAAA' }))).code, 'challenge_mismatch');
  assert.equal((await check(mk({}, { row_version: 4 }))).code, 'challenge_mismatch');
  assert.equal((await check(mk({}, { challenge_id: 'och_short' }))).code, 'challenge_malformed');
  assert.equal((await check(mk({}, { payload_b64u: 'AAAA=' }))).code, 'challenge_malformed');
  assert.equal((await check(mk({ credential_id: 'cred_demo' }))).code, 'credential_id_unusable');
  assert.equal((await check(mk(), { now: NOW + 121_000 })).code, 'challenge_expired');
  // A note is bound by digest: the same note verifies.
  const noteSha = sha256(Buffer.from('keep it', 'utf8'));
  assert.equal((await check(mk({ note_sha256: noteSha }), { note: 'keep it' })).ok, true);
});

test('panel assertion: only a public-key credential for the pinned id serializes', () => {
  const h = 'e'.repeat(64);
  assert.equal(ui.serializeAssertion(fakeCredential({ challengeSha256: h }), CRED).ok, true);
  assert.equal(ui.serializeAssertion(fakeCredential({ challengeSha256: h, rawId: Buffer.alloc(32, 9) }), CRED).code, 'credential_mismatch');
  assert.equal(ui.serializeAssertion(fakeCredential({ challengeSha256: h, type: 'password' }), CRED).code, 'assertion_unusable');
  assert.equal(ui.serializeAssertion(null, CRED).code, 'assertion_unusable');
  assert.equal(ui.serializeAssertion({ type: 'public-key', rawId: new ArrayBuffer(32), response: { clientDataJSON: 'x' } }, CRED).code, 'assertion_unusable');
});

test('panel outcomes: cancel/error mapping; only exact success shapes count; unconfirmed decisions retry the same body', () => {
  for (const name of ['AbortError', 'NotAllowedError']) assert.equal(ui.classifyWebAuthnError(Object.assign(new Error('x'), { name })).outcome, 'cancelled');
  assert.equal(ui.classifyWebAuthnError(Object.assign(new Error('x'), { name: 'SecurityError' })).outcome, 'blocked');
  assert.equal(ui.classifyWebAuthnError(Object.assign(new Error('x'), { name: 'NotSupportedError' })).outcome, 'unsupported');
  assert.equal(ui.classifyWebAuthnError('boom').outcome, 'error');
  for (const n of ['AbortError', 'NotAllowedError', 'SecurityError', 'TypeError']) assert.match(ui.classifyWebAuthnError(Object.assign(new Error(), { name: n })).message, /Nothing was signed or sent/);

  assert.equal(ui.classifyIssueResponse({ status: 200, data: { ok: true, state: 'challenge_issued', challenge: {}, owner_assurance: true } }).outcome, 'refused');
  assert.equal(ui.classifyIssueResponse({ status: 401, data: { code: 'reauth_required' } }).outcome, 'reauth');
  assert.deepEqual(ui.classifyIssueResponse({ status: 429, data: { code: 'issue_rate_limited', retry_after: 30 } }).retryAfter, 30);
  assert.equal(ui.classifyIssueResponse({ status: 409, data: { code: 'terms_changed' } }).outcome, 'stale');
  assert.equal(ui.classifyIssueResponse({ status: 503, data: { code: 'ceremony_unavailable' } }).outcome, 'unavailable');
  assert.equal(ui.classifyIssueResponse({ network: true }).outcome, 'error');

  const ok = { ok: true, state: 'decided', approval: viewed({ state: 'rejected' }), replay: true };
  assert.equal(ui.classifyDecideResponse({ status: 200, data: ok }).outcome, 'decided');
  assert.equal(ui.classifyDecideResponse({ status: 200, data: { ...ok, replay: undefined } }).outcome, 'unconfirmed');
  assert.equal(ui.classifyDecideResponse({ status: 502, data: { code: 'schema_mismatch' } }).outcome, 'unconfirmed');
  assert.equal(ui.classifyDecideResponse({ network: true }).outcome, 'unconfirmed');
  assert.equal(ui.classifyDecideResponse({ status: 403, data: { code: 'session_revoked' } }).outcome, 'refused');
  assert.equal(ui.classifyDecideResponse({ status: 409, data: { code: 'challenge_expired' } }).outcome, 'stale');
  assert.equal(ui.classifyDecideResponse({ status: 503, data: { code: 'ceremony_unavailable' } }).outcome, 'unavailable');

  for (const state of ['authorized_not_executed', 'rejected', 'revision_requested', 'executing', 'weird']) {
    const c = ui.decisionResultCopy({ state });
    assert.ok(!/\b(executed|sent|published|delivered)\b/i.test(c.title.replace('not executed', '')), c.title);
    assert.match(c.detail, /External execution is not connected/);
  }
});

test('panel outcomes: a decide 503 is definite only when known pre-send; post-send timeout/reset/503/504 stay unconfirmed', async () => {
  // Ambiguous: the real decision handler hands the signed POST to the transport, which then fails (SYNTHETIC).
  const f = await decideFixture();
  const cases = [
    ['timeout', async () => { throw Object.assign(new Error('timeout'), { code: 'timeout' }); }, 'bridge_offline'],
    ['reset', async () => { throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); }, 'bridge_offline'],
    ['504', async () => ({ status: 504, contentType: 'application/json', body: Buffer.from('{}') }), 'bridge_hermes_unavailable'],
    ['503', async () => ({ status: 503, contentType: 'application/json', body: Buffer.from('{}') }), 'bridge_hermes_unavailable'],
  ];
  for (const [name, fail, code] of cases) {
    const b = bridge({ 'GET /v0/capabilities': [200, CAPS], [`POST /v0/approvals/${AP}/owner-challenges/${OCH}/decision`]: () => [200, {}] });
    const transport = async (req) => (req.method === 'POST' ? (await b.transport(req), fail()) : b.transport(req));
    const r = await decide({ token: f.t, transport, bodyText: f.bodyText });
    assert.deepEqual([r.status, r.body.code], [503, code], name);
    assert.equal(b.calls.filter((c) => c.method === 'POST').length, 1, `${name}: signed POST was sent`);
    const c = ui.classifyDecideResponse({ status: r.status, data: r.body });
    assert.equal(c.outcome, 'unconfirmed', name);
    assert.match(c.message, /Retry the same signed decision/, name);
    assert.doesNotMatch(c.message, /Nothing was approved/, name);
  }
  // An unknown 503 (new code or no body) may have applied too.
  assert.equal(ui.classifyDecideResponse({ status: 503, data: { code: 'bridge_something_new' } }).outcome, 'unconfirmed');
  assert.equal(ui.classifyDecideResponse({ status: 503, data: null }).outcome, 'unconfirmed');

  // Definite: refused before any decision POST.
  const pre = bridge({ 'GET /v0/capabilities': [200, CAPS] });
  const off = async (req) => { pre.calls.push(req); throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }); };
  const u = await decide({ token: f.t, transport: off, bodyText: f.bodyText });
  assert.deepEqual([u.status, u.body.code], [503, 'ceremony_unavailable']);
  assert.ok(!pre.calls.some((c) => c.method === 'POST'));
  assert.equal(ui.classifyDecideResponse({ status: u.status, data: u.body }).outcome, 'unavailable');
  assert.equal(ui.classifyDecideResponse({ status: 503, data: { code: 'bridge_not_configured' } }).outcome, 'unavailable');
});

test('static: panel is browser-safe, gated, calls only the reviewed routes, never enrolls or names identity claims', async () => {
  const lib = await src('src/lib/mission-control/owner-challenge-ui.mjs');
  assert.ok(!/from ["']node:|require\(|process\.env|console\./.test(lib));
  assert.ok(!/credentials\.create|publicKey:\s*\{[^}]*user/.test(lib));
  const panel = await src('src/components/mc/owner-challenge-panel.tsx');
  assert.match(panel, /^"use client";/);
  assert.ok(!/approval-ceremony|bridge-client|approvals-client|process\.env|MC_BRIDGE/.test(panel), 'no server module or secret in the client');
  assert.ok(!/credentials\.create|localStorage|sessionStorage/.test(panel));
  assert.ok(!/session_sha256|"human"|principal|owner_verified/.test(panel));
  const posts = [...panel.matchAll(/postJson\(`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(posts, ['/api/control/approvals/${approvalId}/challenge', '/api/control/approvals/${approvalId}/decision']);
  assert.match(panel, /panelGate\(/);
  assert.match(panel, /approvalEligibility\(/);
  assert.match(panel, /inflight\.current/);
  assert.match(panel, /AbortController/);
  const page = await src('src/app/approvals/[id]/page.tsx');
  assert.match(page, /ceremonyPanelAvailability\(\)/);
  assert.match(page, /hasControlAccess\(\)/);
  assert.ok(!/\/challenge|\/decision|process\.env/.test(page));
  const route = await src('src/lib/mission-control/approval-ceremony-route.ts');
  assert.match(route, /available: true, rpId: a\.rpId, origin: a\.origin/);
});
