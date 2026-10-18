// Contract tests for the approvals owner guard and the READ-ONLY approvals adapter. Every PIN, secret, origin,
// approval and transport here is a SYNTHETIC fixture; no real credential, env file or bridge is read or contacted.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSessionToken, readSessionConfig, verifySessionBinding, verifySessionToken } from '../src/lib/auth/session.mjs';
import { readBridgeConfig } from '../src/lib/mission-control/bridge-client.mjs';
import {
  DECISION_UNAVAILABLE_REASON,
  FRESH_AUTH_SECONDS,
  checkApprovalList,
  decisionAvailability,
  guardApprovalRequest,
  handleApprovalRead,
  readCanonicalOrigin,
} from '../src/lib/mission-control/approvals-client.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const PIN = '7350';
const SECRET = 'synthetic-session-secret-approvals-0123456789';
const BRIDGE_SECRET = 'synthetic-bridge-secret-approvals-0123456789';
const ORIGIN = 'https://mc.test.invalid';
const NOW = Date.parse('2026-10-17T12:00:00Z');
const env = { MISSION_CONTROL_PIN: PIN, MISSION_CONTROL_SESSION_SECRET: SECRET, MISSION_CONTROL_CANONICAL_ORIGIN: ORIGIN };
const cfg = readSessionConfig({ pin: PIN, secret: SECRET });
const bridgeConfig = readBridgeConfig({ url: 'http://127.0.0.1:1', secret: BRIDGE_SECRET });
const H = (h = {}) => new Headers(h);
const SAME = { origin: ORIGIN, 'sec-fetch-site': 'same-origin' };
const token = (at = NOW, ttlSeconds) => createSessionToken(cfg, { now: at, ...(ttlSeconds ? { ttlSeconds } : {}) });
const b64u = (b) => Buffer.from(b).toString('base64url');
const SHA = 'a'.repeat(64);
const AP = 'ap_0123456789abcdef01234567';

function approval(o = {}) {
  return {
    approval_id: AP, task_id: 't_abc123', state: 'awaiting_approval', status: 'pending',
    artifact: { id: 'art_demo', version: 1, sha256: SHA, latest_version: 1, is_latest: true },
    action: 'publish_demo', destination: 'synthetic://sink', max_cost_cents: 0,
    not_before: '2026-10-17T11:00:00.000Z', expires_at: '2026-10-17T13:00:00.000Z',
    requested_by: 'agent-demo', approver: null, approver_assurance: null, owner_verified: false,
    decided_at: null, decision_note: null, invalidated_reason: null, created_at: '2026-10-17T11:00:00.000Z',
    row_version: 1, executed: false, external_execution: 'not_connected', ...o,
  };
}

/** Records every bridge call; answers with a fixed (status, json) and verifies the HMAC like the bridge would. */
function recorder(status, json, contentType = 'application/json') {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    const h = req.headers;
    const bodyHash = createHash('sha256').update(req.body || Buffer.alloc(0)).digest('hex');
    const expected = createHmac('sha256', Buffer.from(BRIDGE_SECRET))
      .update(['mc-bridge-v1', req.method, req.target, h['x-mc-timestamp'], h['x-mc-nonce'], bodyHash].join('\n')).digest('hex');
    assert.equal(h['x-mc-signature'], expected);
    return { status, contentType, body: Buffer.from(typeof json === 'string' ? json : JSON.stringify(json)) };
  };
  return { calls, transport };
}

const read = async (o) => handleApprovalRead({ env, headers: H(SAME), bridgeConfig, now: NOW, kind: 'list', ...o });

// ---------- session binding ----------

test('session binding is derived server-side from verified claims and never exposes the nonce or the token', async () => {
  const t = await token();
  const v = await verifySessionBinding(cfg, t, { now: NOW });
  assert.equal(v.ok, true);
  assert.match(v.sessionSha256, /^[0-9a-f]{64}$/);
  const claims = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
  const expected = createHash('sha256').update(`mc-approval-session:v1\0${claims.nonce}\0${claims.iat}`).digest('hex');
  assert.equal(v.sessionSha256, expected);
  assert.deepEqual(Object.keys(v.claims).sort(), ['exp', 'iat', 'sub']);
  assert.ok(!JSON.stringify(v).includes(claims.nonce));
  assert.notEqual(v.sessionSha256, t);
  // Two sessions never share a binding; the plain verifier's shape is unchanged.
  assert.notEqual((await verifySessionBinding(cfg, await token(), { now: NOW })).sessionSha256, v.sessionSha256);
  assert.deepEqual(Object.keys((await verifySessionToken(cfg, t, { now: NOW })).claims).sort(), ['exp', 'iat', 'sub']);
});

// ---------- owner cookie ----------

test('forged, expired, missing, malformed and wrong-key owner cookies are refused before any bridge call', async () => {
  const good = await token();
  const [head, body] = good.split('.');
  const forgedClaims = b64u(JSON.stringify({ v: 1, sub: 'owner', iat: NOW / 1000, exp: NOW / 1000 + 3600, nonce: 'x'.repeat(32) }));
  const cases = {
    session_missing: undefined,
    session_bad_signature: `${head}.${forgedClaims}.${good.split('.')[2]}`,
    session_malformed: `${head}.${body}`,
    session_expired: await token(NOW - 3 * 3600_000, 3600),
  };
  const otherKey = await createSessionToken(readSessionConfig({ pin: '9999', secret: SECRET }), { now: NOW });
  cases['session_bad_signature '] = otherKey;
  for (const [reason, tok] of Object.entries(cases)) {
    for (const mode of ['read', 'ceremony']) {
      const g = await guardApprovalRequest({ env, token: tok, headers: H(SAME), mode, now: NOW });
      assert.deepEqual(g, { ok: false, status: 401, reason: reason.trim() }, `${reason}/${mode}`);
    }
    const { calls, transport } = recorder(200, { approvals: [], observed_at: '2026-10-17T12:00:00Z' });
    const r = await read({ token: tok, transport });
    assert.equal(r.status, 401);
    assert.equal(r.body.state, 'unauthenticated');
    assert.equal(calls.length, 0);
  }
  // Unconfigured session secret fails closed rather than trusting the cookie.
  const g = await guardApprovalRequest({ env: { ...env, MISSION_CONTROL_SESSION_SECRET: 'short' }, token: good, headers: H(SAME), mode: 'read', now: NOW });
  assert.deepEqual(g, { ok: false, status: 503, reason: 'session_not_configured' });
});

// ---------- origin / fetch metadata ----------

test('ceremony guard requires exact canonical https Origin and Sec-Fetch-Site same-origin', async () => {
  const t = await token();
  const bad = [
    [{ 'sec-fetch-site': 'same-origin' }, 'origin_missing'],
    [{ origin: 'https://evil.test.invalid', 'sec-fetch-site': 'same-origin' }, 'origin_mismatch'],
    [{ origin: 'http://mc.test.invalid', 'sec-fetch-site': 'same-origin' }, 'origin_mismatch'],
    [{ origin: 'https://mc.test.invalid:8443', 'sec-fetch-site': 'same-origin' }, 'origin_mismatch'],
    [{ origin: 'https://sub.mc.test.invalid', 'sec-fetch-site': 'same-origin' }, 'origin_mismatch'],
    [{ origin: 'null', 'sec-fetch-site': 'same-origin' }, 'origin_mismatch'],
    [{ origin: ORIGIN }, 'fetch_site_missing'],
    [{ origin: ORIGIN, 'sec-fetch-site': 'cross-site' }, 'fetch_site_not_same_origin'],
    [{ origin: ORIGIN, 'sec-fetch-site': 'same-site' }, 'fetch_site_not_same_origin'],
    [{ origin: ORIGIN, 'sec-fetch-site': 'none' }, 'fetch_site_not_same_origin'],
  ];
  for (const [h, reason] of bad) {
    assert.deepEqual(await guardApprovalRequest({ env, token: t, headers: H(h), mode: 'ceremony', now: NOW }), { ok: false, status: 403, reason }, JSON.stringify(h));
  }
  // The canonical origin must itself be configured, https and exact; otherwise ceremonies fail closed.
  for (const [value, reason] of [[undefined, 'origin_not_configured'], ['http://mc.test.invalid', 'origin_invalid'], ['https://mc.test.invalid/app', 'origin_invalid'], ['https://u:p@mc.test.invalid', 'origin_invalid'], ['https://MC.test.invalid', 'origin_invalid']]) {
    const g = await guardApprovalRequest({ env: { ...env, MISSION_CONTROL_CANONICAL_ORIGIN: value }, token: t, headers: H(SAME), mode: 'ceremony', now: NOW });
    assert.deepEqual(g, { ok: false, status: 503, reason }, String(value));
  }
  assert.deepEqual(readCanonicalOrigin(`${ORIGIN}/`), { ok: true, origin: ORIGIN });
});

test('reads refuse explicit cross-site fetch metadata but allow same-origin and top-level navigation', async () => {
  const t = await token();
  for (const site of ['cross-site', 'same-site']) {
    const { calls, transport } = recorder(200, { approvals: [], observed_at: '2026-10-17T12:00:00Z' });
    const r = await read({ token: t, headers: H({ 'sec-fetch-site': site }), transport });
    assert.equal(r.status, 403);
    assert.equal(calls.length, 0);
  }
  for (const h of [{ 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none' }, {}]) {
    assert.equal((await guardApprovalRequest({ env, token: t, headers: H(h), mode: 'read', now: NOW })).ok, true);
  }
});

// ---------- fresh auth / client binding ----------

test('fresh-auth window: a session older than 15 minutes is refused for the future decision guard', async () => {
  const fresh = await token(NOW - (FRESH_AUTH_SECONDS - 5) * 1000);
  const stale = await token(NOW - (FRESH_AUTH_SECONDS + 5) * 1000);
  assert.equal(FRESH_AUTH_SECONDS, 900);
  assert.equal((await guardApprovalRequest({ env, token: fresh, headers: H(SAME), mode: 'ceremony', requireFreshAuth: true, now: NOW })).ok, true);
  assert.deepEqual(await guardApprovalRequest({ env, token: stale, headers: H(SAME), mode: 'ceremony', requireFreshAuth: true, now: NOW }), { ok: false, status: 401, reason: 'reauth_required' });
  // Stale is fine for a plain read; freshness gates only the decision ceremony.
  assert.equal((await guardApprovalRequest({ env, token: stale, headers: H(SAME), mode: 'read', now: NOW })).ok, true);
});

test('a client-supplied session binding (body, query or header) is refused, never merged', async () => {
  const t = await token();
  const v = await verifySessionBinding(cfg, t, { now: NOW });
  const attempts = [
    { body: { session_sha256: v.sessionSha256 } },
    { body: { decision: 'approve', session_hash: 'f'.repeat(64) } },
    { query: new URLSearchParams({ session_sha256: 'f'.repeat(64) }) },
    { headers: H({ ...SAME, 'x-mc-session-sha256': v.sessionSha256 }) },
  ];
  for (const a of attempts) {
    assert.deepEqual(await guardApprovalRequest({ env, token: t, headers: H(SAME), mode: 'ceremony', now: NOW, ...a }), { ok: false, status: 400, reason: 'client_session_binding_refused' });
  }
  const { calls, transport } = recorder(200, { approvals: [], observed_at: '2026-10-17T12:00:00Z' });
  const r = await read({ token: t, query: new URLSearchParams({ session_sha256: v.sessionSha256 }), transport });
  assert.deepEqual([r.status, r.body.code], [400, 'client_session_binding_refused']);
  assert.equal(calls.length, 0);
});

test('accepted exact owner ceremony guard returns only the server-derived binding', async () => {
  const t = await token(NOW - 60_000);
  const g = await guardApprovalRequest({ env, token: t, headers: H(SAME), mode: 'ceremony', requireFreshAuth: true, body: { decision: 'approve' }, now: NOW });
  assert.equal(g.ok, true);
  assert.equal(g.session.sessionSha256, (await verifySessionBinding(cfg, t, { now: NOW })).sessionSha256);
  assert.equal(g.session.authAgeSeconds, 60);
  assert.deepEqual(Object.keys(g.session).sort(), ['authAgeSeconds', 'exp', 'iat', 'sessionSha256']);
});

// ---------- read adapter ----------

test('list and detail issue exactly one signed GET to the fixed private endpoints and keep decisions unavailable', async () => {
  const t = await token();
  const list = recorder(200, { approvals: [approval()], observed_at: '2026-10-17T12:00:00Z' });
  const r1 = await read({ token: t, transport: list.transport });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.approvals[0].approval_id, AP);
  assert.deepEqual(list.calls.map((c) => [c.method, c.target, c.body]), [['GET', '/v0/approvals', undefined]]);

  const filtered = recorder(200, { approvals: [], observed_at: '2026-10-17T12:00:00Z' });
  await read({ token: t, query: new URLSearchParams({ task_id: 't_abc123' }), transport: filtered.transport });
  assert.equal(filtered.calls[0].target, '/v0/approvals?task_id=t_abc123');

  const detail = recorder(200, { approval: approval({ artifact: { ...approval().artifact, content: 'synthetic body' } }), observed_at: '2026-10-17T12:00:00Z' });
  const r2 = await read({ token: t, kind: 'detail', id: AP, transport: detail.transport });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.approval.artifact.content, 'synthetic body');
  assert.deepEqual(detail.calls.map((c) => [c.method, c.target]), [['GET', `/v0/approvals/${AP}`]]);

  for (const r of [r1, r2]) assert.deepEqual(r.body.decision, { available: false, reason: DECISION_UNAVAILABLE_REASON });
  // Even a bridge that advertises the decision op cannot enable it here.
  assert.deepEqual(decisionAvailability({ ops: ['POST /v0/approvals/:id/decision'], readOnly: false }), { available: false, reason: DECISION_UNAVAILABLE_REASON });
  assert.match(DECISION_UNAVAILABLE_REASON, /enrollment/);
  assert.match(DECISION_UNAVAILABLE_REASON, /single-use pending challenges/);
});

test('invalid ids and queries are rejected without a bridge call', async () => {
  const t = await token();
  for (const o of [
    { kind: 'detail', id: 'ap_../../v0/tasks' },
    { kind: 'detail', id: 'AP_0123456789ABCDEF01234567' },
    { kind: 'detail', id: AP, query: new URLSearchParams({ x: '1' }) },
    { query: new URLSearchParams({ task_id: 't_../x' }) },
    { query: new URLSearchParams({ status: 'pending' }) },
  ]) {
    const { calls, transport } = recorder(200, {});
    const r = await read({ token: t, transport, ...o });
    assert.equal(r.status, 400, JSON.stringify(o));
    assert.equal(calls.length, 0);
  }
});

test('bridge errors and schema mismatches fail closed with no partial data', async () => {
  const t = await token();
  const cases = [
    [recorder(503, { error: 'approvals_disabled' }), 503, 'hermes_unavailable'],
    [recorder(401, {}), 502, 'unauthorized'],
    [recorder(404, { error: 'not_found' }), 404, 'not_found'],
    [recorder(500, {}), 502, 'error'],
    [recorder(200, '<html>', 'text/html'), 502, 'bad_payload'],
    [recorder(200, '{not json'), 502, 'bad_payload'],
    [recorder(200, { approvals: [approval(), approval({ approval_id: 'bogus' })], observed_at: '2026-10-17T12:00:00Z' }), 502, 'bad_payload'],
    [recorder(200, { approvals: [approval()] }), 502, 'bad_payload'],
  ];
  for (const [rec, status, state] of cases) {
    const r = await read({ token: t, transport: rec.transport });
    assert.equal(r.status, status, state);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.state, state);
    assert.equal(r.body.approvals, undefined);
    assert.equal(r.body.decision.available, false);
  }
  const offline = await read({ token: t, transport: async () => { throw Object.assign(new Error('x'), { code: 'refused' }); } });
  assert.deepEqual([offline.status, offline.body.state], [503, 'offline']);
  const unconfigured = await read({ token: t, bridgeConfig: readBridgeConfig({}) });
  assert.deepEqual([unconfigured.status, unconfigured.body.state], [503, 'not_configured']);
  // Detail for a different id than requested is a mismatch, not data.
  const wrong = recorder(200, { approval: approval({ approval_id: 'ap_ffffffffffffffffffffffff' }), observed_at: '2026-10-17T12:00:00Z' });
  assert.equal((await read({ token: t, kind: 'detail', id: AP, transport: wrong.transport })).body.state, 'bad_payload');
});

test('payload checker never upgrades execution or unknown states', () => {
  const out = checkApprovalList({ approvals: [approval({ state: 'shipped', executed: true, external_execution: 'connected' })], observed_at: '2026-10-17T12:00:00Z' });
  assert.equal(out.approvals[0].state, 'unknown');
  assert.equal(out.approvals[0].executed, false);
  assert.equal(out.approvals[0].external_execution, 'not_connected');
});

// ---------- source-level boundary ----------

test('routes are GET-only, server-only and contain no decision/challenge dispatch', async () => {
  const files = ['src/app/api/control/approvals/route.ts', 'src/app/api/control/approvals/[id]/route.ts', 'src/lib/mission-control/approvals.ts', 'src/lib/mission-control/approvals-client.mjs'];
  for (const f of files) {
    const s = await src(f);
    assert.doesNotMatch(s, /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/, f);
    assert.doesNotMatch(s, /bridgeRequest\(|"POST"|\/decision|\/challenge/, f);
    assert.doesNotMatch(s, /NEXT_PUBLIC_|console\./, f);
    if (f.endsWith('route.ts')) {
      assert.match(s, /runtime = "nodejs"/);
      assert.match(s, /no-store/);
    }
  }
  assert.ok(!(await src('src/lib/mission-control/approvals-client.mjs')).includes('"use client"'));
});
