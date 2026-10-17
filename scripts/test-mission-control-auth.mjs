// Contract tests for signed owner sessions, login throttling and the signed bridge POST. All PINs, secrets,
// addresses and transports here are SYNTHETIC fixtures; no real credential, env file or bridge is read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SESSION_COOKIE,
  UNKNOWN_CLIENT,
  clientIdentifier,
  cookieOptions,
  createSessionToken,
  hashClientKey,
  pinMatches,
  readSessionConfig,
  verifySessionToken,
} from '../src/lib/auth/session.mjs';
import { LOGIN_COPY, handleLogin } from '../src/lib/auth/login.mjs';
import {
  bridgeGet,
  bridgeRequest,
  checkAttemptResponse,
  readBridgeConfig,
  reportLoginAttempt,
} from '../src/lib/mission-control/bridge-client.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (p) => readFile(join(ROOT, p), 'utf8');
const PIN = '4821';
const SECRET = 'synthetic-session-secret-0123456789abcdef';
const BRIDGE_SECRET = 'synthetic-bridge-secret-0123456789abcdef';
const NOW = Date.parse('2026-10-16T12:00:00Z');
const cfg = readSessionConfig({ pin: PIN, secret: SECRET });
const env = { MISSION_CONTROL_PIN: PIN, MISSION_CONTROL_SESSION_SECRET: SECRET };
const headers = (h = {}) => new Headers(h);
const b64u = (buf) => Buffer.from(buf).toString('base64url');

// Independent Node (node:crypto) re-statement of the token format, used to prove Node/WebCrypto parity.
function nodeToken(pin, secret, claims) {
  const key = createHmac('sha256', Buffer.from(secret, 'utf8')).update(`mc-session-key-v1\n${pin}`).digest();
  const signed = `mcs1.${b64u(JSON.stringify(claims))}`;
  return `${signed}.${b64u(createHmac('sha256', key).update(signed).digest())}`;
}
const claims = (o = {}) => ({ v: 1, sub: 'owner', iat: NOW / 1000, exp: NOW / 1000 + 3600, nonce: 'n'.repeat(32), ...o });

// ---------- config ----------

test('session config fails closed on missing PIN or missing/short secret, without echoing values', () => {
  assert.deepEqual(readSessionConfig({ secret: SECRET }), { ok: false, reason: 'pin_missing' });
  assert.deepEqual(readSessionConfig({ pin: '  ', secret: SECRET }), { ok: false, reason: 'pin_missing' });
  assert.deepEqual(readSessionConfig({ pin: PIN }), { ok: false, reason: 'secret_missing' });
  assert.deepEqual(readSessionConfig({ pin: PIN, secret: 'short' }), { ok: false, reason: 'secret_too_short' });
  assert.equal(readSessionConfig({ pin: PIN, secret: SECRET }).ok, true);
});

test('cookie is HttpOnly, SameSite=Strict, Secure in production, expiring', () => {
  assert.deepEqual(cookieOptions({ production: true }), { httpOnly: true, sameSite: 'strict', secure: true, path: '/', maxAge: 604800 });
  assert.equal(cookieOptions({ production: false }).secure, false);
  assert.equal(cookieOptions({ production: true, maxAge: 0 }).maxAge, 0);
  assert.equal(SESSION_COOKIE, 'mission_control_auth');
});

// ---------- tokens ----------

test('issued token is opaque-signed, carries no PIN/secret and verifies with sub/iat/exp', async () => {
  const token = await createSessionToken(cfg, { now: NOW });
  assert.match(token, /^mcs1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.ok(!token.includes(PIN) && !token.includes(SECRET));
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'nonce', 'sub', 'v']);
  assert.equal(payload.exp - payload.iat, 604800);
  assert.match(payload.nonce, /^[A-Za-z0-9_-]{32}$/);
  const v = await verifySessionToken(cfg, token, { now: NOW + 1000 });
  assert.deepEqual(v, { ok: true, claims: { sub: 'owner', iat: NOW / 1000, exp: NOW / 1000 + 604800 } });
  assert.notEqual(token, await createSessionToken(cfg, { now: NOW }), 'fresh nonce per session');
});

test('expired, future, tampered, wrong-secret, wrong-PIN and legacy raw-PIN cookies are rejected', async () => {
  const token = await createSessionToken(cfg, { now: NOW, ttlSeconds: 3600 });
  assert.equal((await verifySessionToken(cfg, token, { now: NOW + 3600_000 })).reason, 'expired');
  assert.equal((await verifySessionToken(cfg, token, { now: NOW - 3600_000 })).reason, 'not_yet_valid');
  const [p, body, sig] = token.split('.');
  const flipped = sig.slice(0, -2) + (sig.at(-2) === 'A' ? 'B' : 'A') + sig.at(-1);
  assert.equal((await verifySessionToken(cfg, `${p}.${body}.${flipped}`, { now: NOW })).ok, false);
  const forged = b64u(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), exp: NOW / 1000 + 9e6 }));
  assert.equal((await verifySessionToken(cfg, `${p}.${forged}.${sig}`, { now: NOW })).reason, 'bad_signature');
  const other = readSessionConfig({ pin: PIN, secret: `${SECRET}-rotated` });
  assert.equal((await verifySessionToken(other, token, { now: NOW })).reason, 'bad_signature');
  const repinned = readSessionConfig({ pin: '9999', secret: SECRET });
  assert.equal((await verifySessionToken(repinned, token, { now: NOW })).reason, 'bad_signature');
  for (const legacy of [PIN, ` ${PIN}`, SECRET, '', undefined, null, 1234, 'mcs1..', `${token}.x`, 'x'.repeat(600)]) {
    assert.equal((await verifySessionToken(cfg, legacy, { now: NOW })).ok, false, `legacy=${String(legacy).slice(0, 20)}`);
  }
  assert.equal((await verifySessionToken(readSessionConfig({ pin: PIN }), token, { now: NOW })).reason, 'not_configured');
});

test('Node/Edge parity: node:crypto-built tokens verify under the WebCrypto verifier and malformed claims fail', async () => {
  assert.equal((await verifySessionToken(cfg, nodeToken(PIN, SECRET, claims()), { now: NOW })).ok, true);
  for (const bad of [claims({ sub: 'guest' }), claims({ v: 2 }), claims({ nonce: 'short' }), claims({ exp: NOW / 1000 + 40 * 86400 }), { ...claims(), extra: 1 }, claims({ iat: '1' })]) {
    assert.equal((await verifySessionToken(cfg, nodeToken(PIN, SECRET, bad), { now: NOW })).ok, false, JSON.stringify(bad));
  }
  const s = await src('src/lib/auth/session.mjs');
  assert.doesNotMatch(s, /from ["']node:|require\(|\bBuffer\.|process\.env|console\./, 'session module must stay Edge-safe');
  const mw = await src('src/middleware.ts');
  assert.match(mw, /await verifySessionToken\(/);
  assert.match(mw, /session\?\.ok === true/);
  assert.doesNotMatch(mw, /authCookie === pin|=== pin/);
});

test('PIN comparison is exact and digest-based', async () => {
  assert.equal(await pinMatches(PIN, PIN), true);
  for (const wrong of ['', '482', '48210', '4822', ' 4821', 4821, null]) assert.equal(await pinMatches(wrong, PIN), false, String(wrong));
  assert.equal(await pinMatches('', ''), false);
  const login = await src('src/lib/auth/login.mjs');
  assert.doesNotMatch(login, /pin\s*[!=]==?\s*config\.pin|config\.pin\s*[!=]==?/);
});

// ---------- client key ----------

test('client identifier trusts only Vercel-injected metadata; otherwise one shared unknown bucket', async () => {
  const spoof = headers({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8', 'x-vercel-forwarded-for': '9.9.9.9' });
  assert.equal(clientIdentifier(spoof, { trustVercel: false }), UNKNOWN_CLIENT);
  assert.equal(clientIdentifier(spoof, { trustVercel: true }), 'ip:9.9.9.9');
  assert.equal(clientIdentifier(headers({ 'x-forwarded-for': '1.2.3.4' }), { trustVercel: true }), UNKNOWN_CLIENT);
  assert.equal(clientIdentifier(headers({ 'x-real-ip': '2001:DB8::1' }), { trustVercel: true }), 'ip:2001:db8::1');
  assert.equal(clientIdentifier(headers({ 'x-vercel-forwarded-for': '<script>' }), { trustVercel: true }), UNKNOWN_CLIENT);
  const k = await hashClientKey(cfg, 'ip:9.9.9.9');
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.notEqual(k, await hashClientKey(readSessionConfig({ pin: PIN, secret: `${SECRET}-2` }), 'ip:9.9.9.9'));
  assert.ok(!k.includes('9.9.9.9'));
});

// ---------- login decision ----------

function recorder(verdict) {
  const calls = [];
  return { calls, attempt: async (a) => (calls.push(a), typeof verdict === 'function' ? verdict(a) : verdict) };
}

test('login issues a verifiable session only when the PIN matches and the throttle allows', async () => {
  const r = recorder({ state: 'allowed' });
  const out = await handleLogin({ pinInput: ` ${PIN} `, env, headers: headers(), attempt: r.attempt, now: () => NOW });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true });
  assert.equal((await verifySessionToken(cfg, out.token, { now: NOW })).ok, true);
  assert.equal(r.calls.length, 1);
  assert.deepEqual(Object.keys(r.calls[0]).sort(), ['key', 'matched']);
  assert.equal(r.calls[0].matched, true);
  assert.match(r.calls[0].key, /^[0-9a-f]{64}$/);
  assert.equal(r.calls[0].key, await hashClientKey(cfg, UNKNOWN_CLIENT));
});

test('wrong PIN is reported as unmatched and returns 401 with no token', async () => {
  const r = recorder({ state: 'allowed' });
  const out = await handleLogin({ pinInput: '0000', env, headers: headers(), attempt: r.attempt });
  assert.deepEqual([out.status, out.body.error, out.token], [401, LOGIN_COPY.wrong_pin, undefined]);
  assert.equal(r.calls[0].matched, false);
  const empty = await handleLogin({ pinInput: { pin: PIN }, env, headers: headers(), attempt: r.attempt });
  assert.equal(empty.status, 401);
});

test('throttled login returns 429 with retry_after even for the correct PIN', async () => {
  const out = await handleLogin({ pinInput: PIN, env, headers: headers(), attempt: recorder({ state: 'limited', retryAfter: 300 }).attempt });
  assert.equal(out.status, 429);
  assert.equal(out.retryAfter, 300);
  assert.equal(out.body.retry_after, 300);
  assert.match(out.body.error, /5 minutes/);
  assert.equal(out.token, undefined);
});

test('offline or malformed throttle service rejects new logins with an actionable error', async () => {
  for (const attempt of [async () => ({ state: 'unavailable', code: 'refused' }), async () => { throw new Error('x'); }, async () => null, async () => ({ state: 'limited' })]) {
    const out = await handleLogin({ pinInput: PIN, env, headers: headers(), attempt });
    assert.equal(out.status, 503);
    assert.equal(out.token, undefined);
    assert.match(out.body.error, /Mac bridge.*already signed in still work/s);
  }
});

test('login fails closed without PIN or signing secret and never calls the throttle', async () => {
  for (const e of [{}, { MISSION_CONTROL_PIN: PIN }, { MISSION_CONTROL_SESSION_SECRET: SECRET }, { MISSION_CONTROL_PIN: PIN, MISSION_CONTROL_SESSION_SECRET: 'short' }]) {
    const r = recorder({ state: 'allowed' });
    const out = await handleLogin({ pinInput: PIN, env: e, headers: headers(), attempt: r.attempt });
    assert.equal(out.status, 503);
    assert.equal(out.body.error, LOGIN_COPY.not_configured);
    assert.equal(r.calls.length, 0);
  }
});

test('login responses never echo the PIN, secret, address or key', async () => {
  const h = headers({ 'x-vercel-forwarded-for': '203.0.113.7' });
  for (const verdict of [{ state: 'allowed' }, { state: 'limited', retryAfter: 61 }, { state: 'unavailable' }]) {
    for (const pinInput of [PIN, '1111']) {
      const r = recorder(verdict);
      const out = await handleLogin({ pinInput, env, headers: h, trustVercel: true, attempt: r.attempt });
      const text = JSON.stringify(out.body);
      for (const s of [PIN, '1111', SECRET, '203.0.113.7', r.calls[0].key]) assert.ok(!text.includes(s), s);
    }
  }
});

// ---------- signed bridge POST ----------

const bridgeCfg = readBridgeConfig({ url: 'http://127.0.0.1:9130', secret: BRIDGE_SECRET });
function expectedSig(method, target, ts, nonce, body) {
  const c = ['mc-bridge-v1', method, target, ts, nonce, createHash('sha256').update(body).digest('hex')].join('\n');
  return createHmac('sha256', Buffer.from(BRIDGE_SECRET, 'utf8')).update(c).digest('hex');
}
const jsonRes = (status, obj, contentType = 'application/json') => ({ status, contentType, body: Buffer.from(JSON.stringify(obj)) });

test('bridgeRequest POST signs exactly the transmitted bytes with the canonical protocol', async () => {
  let seen;
  const transport = async (a) => ((seen = a), jsonRes(200, { allowed: true, retry_after: 0 }));
  const key = 'a'.repeat(64);
  const res = await bridgeRequest(bridgeCfg, 'POST', '/v0/auth/attempt', { body: { key, matched: false }, transport, now: () => NOW, nonce: 'nonce-0123456789abcdef' });
  assert.deepEqual(res, { ok: true, status: 200, data: { allowed: true, retry_after: 0 } });
  assert.ok(Buffer.isBuffer(seen.body));
  assert.equal(seen.body.toString(), JSON.stringify({ key, matched: false }));
  assert.equal(seen.method, 'POST');
  assert.equal(seen.headers['content-type'], 'application/json');
  assert.equal(seen.headers['content-length'], String(seen.body.length));
  assert.equal(seen.headers['x-mc-signature'], expectedSig('POST', '/v0/auth/attempt', String(NOW / 1000), 'nonce-0123456789abcdef', seen.body));
  assert.equal(seen.timeoutMs, 12_000, 'default timeout covers CLI cold start');
  const clamped = await bridgeRequest(bridgeCfg, 'POST', '/v0/x', { body: {}, transport, timeoutMs: 1e9 });
  assert.ok(clamped.ok);
  assert.equal(seen.timeoutMs, 20_000);
  assert.equal((await bridgeRequest(bridgeCfg, 'DELETE', '/v0/x', { transport })).code, 'invalid_method');
  assert.equal((await bridgeRequest(bridgeCfg, 'GET', '/v0/x', { body: {}, transport })).code, 'invalid_body');
  assert.equal((await bridgeRequest(bridgeCfg, 'POST', '/v0/x', { body: { big: 'x'.repeat(20_000) }, transport })).code, 'request_too_large');
  assert.equal((await bridgeRequest(bridgeCfg, 'POST', 'http://evil/v0/x', { body: {}, transport })).code, 'invalid_target');
});

test('bridgeGet keeps its { ok, data } contract and still rejects non-200', async () => {
  const ok = await bridgeGet(bridgeCfg, '/v0/tasks', { transport: async (a) => (assert.equal(a.body, undefined), jsonRes(200, { x: 1 })) });
  assert.deepEqual(ok, { ok: true, data: { x: 1 } });
  const limited = await bridgeGet(bridgeCfg, '/v0/tasks', { transport: async () => jsonRes(429, {}) });
  assert.deepEqual(limited, { ok: false, state: 'error', code: 'http_429' });
});

test('attempt responses are read strictly; anything unexpected is unavailable', async () => {
  assert.deepEqual(checkAttemptResponse(200, { allowed: true, retry_after: 0 }), { state: 'allowed' });
  assert.deepEqual(checkAttemptResponse(429, { allowed: false, retry_after: 90 }), { state: 'limited', retryAfter: 90 });
  assert.deepEqual(checkAttemptResponse(429, { allowed: false, retry_after: 9e9 }), { state: 'limited', retryAfter: 86400 });
  for (const [s, d] of [[200, { allowed: false, retry_after: 0 }], [200, { allowed: true }], [429, { allowed: false, retry_after: 0 }], [429, { allowed: true, retry_after: 5 }], [200, null], [201, { allowed: true, retry_after: 0 }]]) {
    assert.equal(checkAttemptResponse(s, d).state, 'unavailable', JSON.stringify([s, d]));
  }
  assert.equal((await reportLoginAttempt(bridgeCfg, { key: 'bad', matched: true })).code, 'invalid_attempt');
  assert.equal((await reportLoginAttempt(readBridgeConfig({}), { key: 'a'.repeat(64), matched: true })).state, 'unavailable');
  const t = async () => jsonRes(429, { allowed: false, retry_after: 30 });
  assert.deepEqual(await reportLoginAttempt(bridgeCfg, { key: 'a'.repeat(64), matched: false }, { transport: t }), { state: 'limited', retryAfter: 30 });
  const html = async () => jsonRes(200, { allowed: true, retry_after: 0 }, 'text/html');
  assert.equal((await reportLoginAttempt(bridgeCfg, { key: 'a'.repeat(64), matched: true }, { transport: html })).state, 'unavailable');
});

test('nodeTransport transmits the signed POST body byte-for-byte to a loopback server', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const ok = req.headers['x-mc-signature'] === expectedSig(req.method, req.url, req.headers['x-mc-timestamp'], req.headers['x-mc-nonce'], body);
      res.writeHead(ok ? 429 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify(ok ? { allowed: false, retry_after: 42 } : { error: 'bad sig' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const live = readBridgeConfig({ url: `http://127.0.0.1:${port}`, secret: BRIDGE_SECRET });
    const out = await reportLoginAttempt(live, { key: 'b'.repeat(64), matched: false }, { timeoutMs: 2000 });
    assert.deepEqual(out, { state: 'limited', retryAfter: 42 });
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].url, '/v0/auth/attempt');
    assert.equal(seen[0].body.toString(), JSON.stringify({ key: 'b'.repeat(64), matched: false }));
    assert.equal(seen[0].headers.origin, undefined);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
});

// ---------- wiring ----------

test('every async guard call site is awaited; no raw-PIN cookie is written; login fails closed', async () => {
  const files = [];
  async function walk(dir) {
    for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) await walk(p);
      else if (/\.(tsx?|mjs)$/.test(e.name)) files.push(p);
    }
  }
  await walk('src');
  for (const f of files) {
    const text = await src(f);
    for (const m of text.matchAll(/(?<!function )\b(hasHeadquartersAccess|hasControlAccess|isHeadquartersAuthorized|verifySessionToken)\(/g)) {
      const before = text.slice(Math.max(0, m.index - 30), m.index);
      assert.match(before, /(await |return |import \{[^}]*$|, )$/, `${f}: ${m[1]} must be awaited`);
    }
    assert.doesNotMatch(text, /cookies\.set\([^)]*configuredPin|cookies\.set\(AUTH_COOKIE/, f);
  }
  const route = await src('src/app/api/auth/login/route.ts');
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /reportLoginAttempt\(bridge, a\)/);
  assert.match(route, /process\.env\.MISSION_CONTROL_SESSION_SECRET/);
  assert.match(route, /cookieOptions\(/);
  assert.doesNotMatch(route, /console\.|NEXT_PUBLIC/);
  const guard = await src('src/lib/headquarters/guard.ts');
  assert.match(guard, /MISSION_CONTROL_SESSION_SECRET/);
  for (const f of ['src/lib/auth/login.mjs', 'src/lib/auth/session.mjs', 'src/middleware.ts']) assert.doesNotMatch(await src(f), /console\./, f);
});

// ---------- session probe + safe redirect ----------

test('session probe returns only a boolean: true for a valid signed cookie, false otherwise', async () => {
  const { handleSessionProbe } = await import('../src/lib/auth/login.mjs');
  const token = await createSessionToken(cfg, { now: NOW });
  const probe = (t, e = env, now = NOW) => handleSessionProbe({ env: e, token: t, now: () => now });
  const ok = await probe(token);
  assert.deepEqual(ok, { status: 200, body: { authenticated: true } });
  assert.deepEqual(Object.keys(ok.body), ['authenticated']);
  const serialized = JSON.stringify(ok);
  for (const secret of [PIN, SECRET, token, 'owner', 'exp', 'iat']) assert.ok(!serialized.includes(secret), secret);
  for (const bad of [undefined, '', PIN, 'garbage', `${token}x`, nodeToken(PIN, 'wrong-secret-0123456789abcdef0123456789', claims())]) {
    assert.deepEqual(await probe(bad), { status: 200, body: { authenticated: false } });
  }
  assert.equal((await probe(token, env, NOW + 8 * 24 * 3600 * 1000)).body.authenticated, false, 'expired');
  assert.equal((await probe(token, { MISSION_CONTROL_PIN: '9999', MISSION_CONTROL_SESSION_SECRET: SECRET })).body.authenticated, false, 'rotated PIN');
  assert.equal((await probe(token, { MISSION_CONTROL_PIN: PIN })).body.authenticated, false, 'no secret fails closed');
  assert.equal((await probe(token, {})).body.authenticated, false, 'unconfigured fails closed');
});

test('safeNextPath keeps same-origin paths and rejects redirect tricks', async () => {
  const { safeNextPath, DEFAULT_NEXT_PATH } = await import('../src/lib/auth/redirect.mjs');
  assert.equal(DEFAULT_NEXT_PATH, '/projects');
  for (const [input, out] of [
    ['/tasks', '/tasks'],
    ['/tasks/abc-123', '/tasks/abc-123'],
    ['/headquarters?tab=ops#x', '/headquarters?tab=ops#x'],
    ['/a/../tasks', '/tasks'],
  ]) assert.equal(safeNextPath(input), out, input);
  for (const bad of [
    null, undefined, 42, '', 'tasks', 'https://evil.com', 'http:/evil.com', 'javascript:alert(1)', 'data:text/html,x',
    '//evil.com', '///evil.com', '/\\evil.com', '\\\\evil.com', '/\\/evil.com', '\\/evil.com',
    '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\u0000x', '/ /evil.com', '/ x',
    '/%2F/evil.com', '/%2f%2fevil.com', '/%5Cevil.com', '/%5c%5cevil.com', '/%09/evil.com', '/%E0%A4%A',
    '/login', '/login?next=/tasks', '/api/control/x', `/${'a'.repeat(600)}`,
    '/login/', '/login/?next=/tasks', '/login/x', '/login/a/b?c=1', '/LOGIN', '/Login/', '/%6Cogin', '/%6cogin/',
    '/x/../login', '/x/../login/', '/./login/', '/login#x', '/api', '/API/control/x', '/%61pi/x',
  ]) assert.equal(safeNextPath(bad), '/projects', JSON.stringify(bad));
  assert.equal(safeNextPath('//evil.com', '/today'), '/today');
  // login-like but not the login route keep working
  for (const ok of ['/loginx', '/logins/1', '/tasks/login', '/projects?next=/login']) assert.equal(safeNextPath(ok), ok, ok);
});

test('limited sign-in copy covers the 24h daily cap and clamps oversized retry_after', async () => {
  const { MAX_RETRY_AFTER_S } = await import('../src/lib/auth/login.mjs');
  assert.equal(MAX_RETRY_AFTER_S, 86400);
  for (const [secs, sent, copy] of [
    [30, 30, /about a minute\./], [60, 60, /about a minute\./], [61, 61, /2 minutes\./], [895, 895, /15 minutes\./],
    [3540, 3540, /59 minutes\./], [3600, 3600, /about an hour\./], [3601, 3601, /about 2 hours\./],
    [86400, 86400, /about 24 hours\./], [86401, 86400, /about 24 hours\./], [9e9, 86400, /about 24 hours\./],
  ]) {
    const out = await handleLogin({ pinInput: PIN, env, headers: headers(), attempt: recorder({ state: 'limited', retryAfter: secs }).attempt });
    assert.equal(out.status, 429, String(secs));
    assert.deepEqual(Object.keys(out.body).sort(), ['error', 'ok', 'retry_after']);
    assert.equal(out.body.retry_after, sent); assert.equal(out.retryAfter, sent);
    assert.match(out.body.error, /^Too many sign-in attempts\. Try again in /); assert.match(out.body.error, copy, String(secs));
    assert.doesNotMatch(out.body.error, /PIN|daily|global|key|bridge/i, 'generic copy reveals no policy detail');
  }
});

test('logout requires an explicit same-origin request', async () => {
  const { isSameOriginRequest } = await import('../src/lib/auth/login.mjs');
  const h = (o) => new Headers(o);
  const url = 'https://mc.example.com/api/auth/logout';
  assert.equal(isSameOriginRequest(h({ origin: 'https://mc.example.com' }), url), true);
  assert.equal(isSameOriginRequest(h({ 'sec-fetch-site': 'same-origin' }), url), true);
  assert.equal(isSameOriginRequest(h({}), url), true, 'non-browser client without fetch metadata');
  for (const bad of [{ origin: 'https://evil.example' }, { origin: 'null' }, { origin: 'http://mc.example.com' }, { origin: 'https://mc.example.com:444' },
    { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
    assert.equal(isSameOriginRequest(h(bad), url), false, JSON.stringify(bad));
  }
  assert.equal(isSameOriginRequest(h({ origin: 'https://mc.example.com' }), 'not a url'), false);
  const route = await src('src/app/api/auth/logout/route.ts');
  assert.match(route, /if \(!isSameOriginRequest\(request\.headers, request\.url\)\)/);
  assert.match(route, /status: 403/);
});

test('session probe wiring: GET-only public route, no-store, boolean body, login page probes then safe-redirects', async () => {
  const route = await src('src/app/api/auth/session/route.ts');
  assert.match(route, /export async function GET\(/);
  assert.doesNotMatch(route, /export (async )?function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /handleSessionProbe\(/);
  assert.doesNotMatch(route, /cookies\.set|createSessionToken|bridge-client|readBridgeConfig|reportLoginAttempt|console\.|NEXT_PUBLIC/);

  const mw = await src('src/middleware.ts');
  assert.match(mw, /pathname === "\/api\/auth\/session" && method === "GET"/);
  assert.doesNotMatch(mw, /startsWith\("\/api\/auth/);
  assert.match(mw, /await verifySessionToken\(/);

  const page = await src('src/app/login/page.tsx');
  assert.match(page, /fetch\("\/api\/auth\/session", \{[^}]*credentials: "same-origin"[^}]*cache: "no-store"/);
  assert.match(page, /data\?\.authenticated === true\) router\.replace\(nextPath\)/);
  assert.match(page, /safeNextPath\(searchParams\.get\("next"\)\)/);
  assert.doesNotMatch(page, /router\.replace\((?!nextPath\))/);
  assert.doesNotMatch(page, /document\.cookie|localStorage|sessionStorage/);

  const session = await src('src/lib/auth/session.mjs');
  assert.match(session, /sameSite: "strict"/);
  const probeSrc = (await src('src/lib/auth/login.mjs')).split('export async function handleSessionProbe')[1];
  assert.doesNotMatch(probeSrc, /createSessionToken|attempt|fetch/);
});
