// SYNTHETIC tests for Body OS helpers, route guards and the page source. No network, no real program/health data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SET_KEYS, checkLogs, checkPlan, checkWhoop, classifySaveResponse, draftToSet, scheduledFor, formatClock, postSet, timerInit, timerPause, timerRemaining, timerReset, timerStart, validateSetInput,
  EDIT_KEYS, validateEditInput, editDraftToInput, classifyEditResponse, postEdit, recoveryBand, whoopGauges, SET_ERROR_COPY,
  completeWhoopOAuth, postWhoopClient, startWhoopOAuth, fetchWhoopOAuthStatus,
} from "../src/lib/mission-control/fitness-client.mjs";
import {
  CALLBACK_RESULTS, OAUTH_COOKIE, WHOOP_REDIRECT_URI, callbackResult, checkAuthorizationUrl, checkOAuthStatus, isCallbackResult, oauthCookieOptions,
  parseCallbackQuery, validateClientInput,
} from "../src/lib/mission-control/whoop-oauth-model.mjs";

const SET = { session_id: "A", exercise_id: "synthetic_press", date: "2026-01-05", kind: "working", set_number: 1, weight: 52.5, unit: "lb", reps: 10, rir: 3, notes: "" };

test("set validation mirrors the bridge contract", () => {
  assert.equal(validateSetInput(SET), null);
  assert.deepEqual(SET_KEYS, Object.keys(SET));
  assert.equal(validateSetInput({ ...SET, extra: 1 }), "invalid_fields");
  assert.equal(validateSetInput({ ...SET, rir: null }), "rir_required");
  assert.equal(validateSetInput({ ...SET, kind: "warmup", rir: null }), null);
  assert.equal(validateSetInput({ ...SET, weight: 10.1 }), "invalid_weight");
  assert.equal(validateSetInput({ ...SET, date: "2026-02-30" }), "invalid_date");
  assert.equal(validateSetInput({ ...SET, exercise_id: "../x" }), "invalid_exercise");
});

test("draftToSet parses form strings and never coerces blanks to 0", () => {
  const d = { sessionId: "A", exerciseId: "synthetic_press", date: "2026-01-05", kind: "working", setNumber: "2", weight: "45", unit: "lb", reps: "", rir: "3", notes: " x " };
  assert.equal(draftToSet(d).error, "invalid_reps");
  assert.deepEqual(draftToSet({ ...d, reps: "9" }).set, { ...SET, set_number: 2, weight: 45, reps: 9, notes: "x" });
  assert.equal(draftToSet({ ...d, reps: "9", kind: "warmup", rir: "" }).set.rir, null);
  assert.equal(draftToSet({ ...d, reps: "9", weight: "-5" }).error, "invalid_weight");
});

test("rest timer: start, pause, resume, reset; no fake progress while paused", () => {
  let t = timerInit(75);
  assert.equal(timerRemaining(t, 1000), 75000);
  t = timerStart(t, 1000);
  assert.equal(timerRemaining(t, 11000), 65000);
  t = timerPause(t, 11000);
  assert.equal(timerRemaining(t, 99000), 65000);
  t = timerStart(t, 100000);
  assert.equal(timerRemaining(t, 200000), 0);
  assert.equal(timerStart(timerPause(t, 200000), 300000).startedAt, null, "a finished timer does not restart itself");
  assert.equal(timerRemaining(timerReset(t), 0), 75000);
  assert.equal(formatClock(65000), "1:05");
});

test("plan/log/whoop readers are strict; WHOOP drops unknown and token-like fields", () => {
  assert.deepEqual(checkPlan({ state: "missing" }), { state: "missing" });
  assert.equal(checkPlan({ state: "ready", program: { sessions: [] } }), null);
  assert.equal(checkLogs({ sets: [{ ...SET, key: "short", saved_at: "x" }], total: 1 }), null);
  assert.deepEqual(checkWhoop({ state: "not_connected", access_token: "x" }), { state: "not_connected" });
  assert.deepEqual(checkWhoop({ state: "error", code: "Bearer abc.def" }), { state: "error", code: "whoop_unavailable" });
  const w = checkWhoop({ state: "connected", observed_at: "2026-01-05T10:00:00Z", freshness: "current", access_token: "SECRET",
    cycle: { id: 1, start: "2026-01-05T04:00:00Z", score_state: "PENDING_SCORE", strain: null }, recovery: null, sleep: null });
  assert.ok(!JSON.stringify(w).includes("SECRET"));
  assert.equal(w.cycle.strain, null);
  assert.equal(w.recovery, null);
});

test("postSet maps bridge outcomes (synthetic transport, no network)", async () => {
  const cfg = { configured: true, origin: "http://127.0.0.1:9", secret: Buffer.alloc(32, 1) };
  const transport = (status, data) => async () => ({ status, contentType: "application/json", body: Buffer.from(JSON.stringify(data)) });
  const key = "set_synthetic_00000001";
  const saved = await postSet(cfg, SET, key, { transport: transport(201, { outcome: "saved", deduplicated: false, set: { ...SET, key, saved_at: "2026-01-05T10:00:00Z" } }) });
  assert.equal(saved.outcome, "saved");
  assert.equal((await postSet(cfg, SET, key, { transport: transport(409, { error: "idempotency_conflict" }) })).outcome, "conflict");
  assert.equal((await postSet(cfg, SET, key, { transport: transport(400, { error: "invalid_exercise" }) })).code, "invalid_exercise");
  assert.equal((await postSet(cfg, { ...SET, reps: -1 }, key)).outcome, "rejected");
});

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("fitness API routes are session-guarded; POST is same-origin, size-bounded and keyed", () => {
  for (const p of ["src/app/api/fitness/plan/route.ts", "src/app/api/fitness/whoop/route.ts", "src/app/api/fitness/logs/route.ts"]) {
    const src = read(p);
    assert.match(src, /hasControlAccess\(\)/, p);
    assert.doesNotMatch(src, /process\.env\.(?!MC_)/, p);
  }
  const logs = read("src/app/api/fitness/logs/route.ts");
  assert.match(logs, /isSameOriginMutation\(request\.headers, request\.url\)/);
  assert.match(logs, /MAX_SET_REQUEST_BYTES/);
  assert.match(logs, /IDEM_RE\.test\(key\)/);
  // The ONE approved exemption: WHOOP's OAuth callback, exact path, GET only. Every other fitness/body-os/whoop path stays protected.
  const mw = read("src/middleware.ts");
  const mentions = mw.split("\n").filter((l) => /fitness|body-os|whoop/i.test(l) && !/^\s*\/\//.test(l));
  assert.deepEqual(mentions.map((l) => l.trim()), ['(pathname === "/api/fitness/whoop/callback" && method === "GET") ||'], "only the exact callback exemption");
  assert.doesNotMatch(mw, /startsWith\("\/api\/fitness|startsWith\("\/body-os|whoop\/(oauth|client|connect)/);
});

test("Body OS page has no fake metrics, seeded history or token handling", () => {
  const src = read("src/app/body-os/page.tsx");
  assert.match(src, /fitness-model\.mjs/, "page imports only the browser-safe model");
  for (const bad of [/\b86\b/, /\b8\.1\b/, /\b9\.8\b/, /yesterday/i, /access_token|refresh_token/, /hydrat/i, /faint/i, /localStorage/]) {
    assert.doesNotMatch(src, bad, String(bad));
  }
  assert.match(src, /\/api\/fitness\/logs/);
  assert.match(src, /idempotency-key/);
  // The connect button now starts the real OAuth flow via the protected POST; never a fake "connected" claim.
  assert.doesNotMatch(src, /Connected (to )?WHOOP|Connect now/i, "no fake connected state");
  assert.match(src, /fetch\("\/api\/fitness\/whoop\/connect", \{ method: "POST"/);
});

test("save answers: only a 2xx 'saved' is saved; 4xx is refused; 5xx/unreadable is not confirmed", () => {
  const set = { ...SET, key: "set_synthetic_000000001" };
  assert.equal(classifySaveResponse(200, { ok: true, outcome: "saved", deduplicated: false, set }).kind, "saved");
  assert.equal(classifySaveResponse(200, { ok: true, outcome: "saved", deduplicated: true, set }).deduplicated, true);
  assert.equal(classifySaveResponse(503, { ok: false, outcome: "saved", set }).kind, "unconfirmed", "non-success status is never saved");
  assert.equal(classifySaveResponse(500, { ok: true, outcome: "saved", set }).kind, "unconfirmed");
  assert.equal(classifySaveResponse(200, null).kind, "unconfirmed");
  assert.equal(classifySaveResponse(503, { ok: false, outcome: "unavailable", code: "bridge_offline" }).kind, "unconfirmed");
  assert.equal(classifySaveResponse(504, null).kind, "unconfirmed");
  assert.equal(classifySaveResponse(408, null).kind, "unconfirmed");
  assert.deepEqual(classifySaveResponse(409, { ok: false, outcome: "conflict", code: "set_already_logged" }), { kind: "refused", code: "set_already_logged" });
  assert.deepEqual(classifySaveResponse(400, { ok: false, outcome: "rejected", code: "invalid_reps" }), { kind: "refused", code: "invalid_reps" });
  assert.deepEqual(classifySaveResponse(401, { ok: false, state: "unauthenticated" }), { kind: "refused", code: "unauthenticated" });
});

test("scheduledFor maps a date's weekday to the weekly template (rest days stay rest)", () => {
  const sched = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => ({ day, session_id: ["A", "B", null, "C", null, "D", null][i], note: "n" }));
  assert.deepEqual(scheduledFor(sched, "2026-10-19"), { day: "Monday", session_id: "A", note: "n" }); // Monday
  assert.equal(scheduledFor(sched, "2026-10-20").session_id, "B");
  assert.equal(scheduledFor(sched, "2026-10-21").session_id, null, "Wednesday rest");
  assert.equal(scheduledFor(sched, "2026-10-24").session_id, "D");
  assert.equal(scheduledFor(sched, "2026-10-25").session_id, null, "Sunday rest");
  assert.equal(scheduledFor(sched.map((d) => ({ ...d, day: d.day.slice(0, 3) })), "2026-10-22").session_id, "C", "short day names");
  assert.equal(scheduledFor(sched, "2026-02-30"), null);
  assert.equal(scheduledFor([], "2026-10-19"), null);
  const src = read("src/app/body-os/page.tsx");
  assert.doesNotMatch(src, /useState\("A"\)/, "no hard-coded session A default");
  assert.match(src, /scheduledFor\(program\.weekly_schedule, date\)/);
  assert.match(src, /classifySaveResponse\(res\.status/);
});

// ---------- WHOOP OAuth (synthetic, no network) ----------
const STATE = "S".repeat(43);
const cfgW = { configured: true, origin: "http://127.0.0.1:9", secret: Buffer.alloc(32, 1) };
const reply = (status, data, seen) => async (req) => { if (seen) seen.push(req); return { status, contentType: "application/json", body: Buffer.from(JSON.stringify(data)) }; };
const AUTH = `https://api.prod.whoop.com/oauth/oauth2/auth?${new URLSearchParams({ response_type: "code", client_id: "synthetic-client-id-0001",
  redirect_uri: WHOOP_REDIRECT_URI, scope: "read:cycles read:recovery read:sleep offline", state: STATE })}`;

test("WHOOP callback query: exact keys only, no duplicates/extras, bounded values", () => {
  const q = (s) => parseCallbackQuery(new URLSearchParams(s));
  assert.deepEqual(q(`code=abc123&state=${STATE}`), { kind: "code", state: STATE, code: "abc123" });
  assert.deepEqual(q(`code=abc&state=${STATE}&scope=read:cycles`), { kind: "code", state: STATE, code: "abc" });
  assert.deepEqual(q(`error=access_denied&state=${STATE}&error_description=x`), { kind: "error", state: STATE, error: "access_denied" });
  assert.deepEqual(q("error=access_denied"), { kind: "error", state: null, error: "access_denied" });
  for (const bad of ["", "code=abc", `state=${STATE}`, `code=a&code=b&state=${STATE}`, `code=a&state=${STATE}&state=${STATE}`, `code=a&state=${STATE}&redirect_uri=https://evil.example`,
    `code=a&state=${STATE}&next=/x`, `code=a&state=short`, `code=a b&state=${STATE}`, `code=a&error=x&state=${STATE}`, "error=Bad Thing", `code=${"x".repeat(2049)}&state=${STATE}`]) {
    assert.equal(q(bad), null, bad);
  }
});

test("WHOOP client input: exactly id + secret, no token/URL fields", () => {
  const ok = { client_id: "synthetic-client-id-0001", client_secret: "synthetic-client-secret-ZZZZ" };
  assert.equal(validateClientInput(ok), null);
  assert.equal(validateClientInput({ ...ok, access_token: "x".repeat(20) }), "invalid_fields");
  assert.equal(validateClientInput({ ...ok, redirect_uri: "https://evil.example" }), "invalid_fields");
  assert.equal(validateClientInput({ client_id: ok.client_id }), "invalid_fields");
  assert.equal(validateClientInput({ ...ok, client_id: "https://evil.example/x" }), "invalid_client_id");
  assert.equal(validateClientInput({ ...ok, client_secret: "has a space" }), "invalid_client_secret");
});

test("WHOOP authorize URL must be exactly the fixed endpoint, redirect and scopes", () => {
  assert.equal(checkAuthorizationUrl(AUTH), true);
  for (const bad of [AUTH.replace("api.prod.whoop.com", "evil.example"), AUTH.replace("/oauth2/auth", "/oauth2/x"), `${AUTH}&extra=1`, `${AUTH}#f`,
    AUTH.replace(encodeURIComponent(WHOOP_REDIRECT_URI), encodeURIComponent("https://evil.example/cb")), AUTH.replace("+offline", ""), "javascript:alert(1)", null]) {
    assert.equal(checkAuthorizationUrl(bad), false, String(bad));
  }
});

test("WHOOP companion cookie: HttpOnly, Secure, Lax, callback path only, short TTL; session cookie stays Strict", () => {
  assert.equal(OAUTH_COOKIE, "mc_whoop_oauth");
  assert.deepEqual(oauthCookieOptions(), { httpOnly: true, secure: true, sameSite: "lax", path: "/api/fitness/whoop/callback", maxAge: 600 });
  assert.equal(oauthCookieOptions(0).maxAge, 0);
  assert.match(read("src/lib/auth/session.mjs"), /sameSite: "strict"/);
});

test("WHOOP callback results are allowlisted; unknown outcomes are 'unavailable', never success", () => {
  assert.equal(callbackResult("authorized"), "authorized");
  assert.equal(callbackResult("invalid_state"), "invalid");
  assert.equal(callbackResult("needs_reauthorization"), "reauthorize");
  assert.equal(callbackResult("something_else"), "unavailable");
  assert.equal(callbackResult(undefined), "unavailable");
  for (const k of Object.keys(CALLBACK_RESULTS)) assert.equal(isCallbackResult(k), true);
  for (const k of ["<script>", "connected", "", "toString", "__proto__"]) assert.equal(isCallbackResult(k), false, k);
  assert.ok(!Object.values(CALLBACK_RESULTS).some((t) => /connected/i.test(t)), "a callback never claims WHOOP is connected");
});

test("WHOOP 'unavailable' is unconfirmed: a post-send bridge timeout/5xx never claims no effect", async () => {
  const text = CALLBACK_RESULTS.unavailable;
  assert.doesNotMatch(text, /nothing (was exchanged|changed)/i);
  assert.match(text, /may or may not/i);
  assert.match(text, /check the whoop status/i);
  const cb = { state: STATE, nonce: STATE, code: "abc" };
  const timeout = async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); };
  for (const transport of [timeout, reply(500, {}), reply(502, {}), reply(504, {})]) {
    const outcome = await completeWhoopOAuth(cfgW, cb, { transport });
    assert.equal(outcome, "unavailable");
    assert.equal(callbackResult(outcome), "unavailable");
  }
});

test("WHOOP status reader keeps booleans/codes only", () => {
  const st = checkOAuthStatus({ configured: true, token: "stored", last_attempt: { status: "authorized", at: "2026-10-19T15:00:00Z" }, client_secret: "LEAK", redirect_uri: "https://evil.example" });
  assert.deepEqual(Object.keys(st).sort(), ["configured", "last_attempt", "redirect_uri", "scopes", "token"]);
  assert.equal(st.redirect_uri, WHOOP_REDIRECT_URI);
  assert.ok(!JSON.stringify(st).includes("LEAK"));
  assert.equal(checkOAuthStatus({ configured: "yes", token: "stored", last_attempt: null }), null);
  assert.equal(checkOAuthStatus({ configured: true, token: "stored", last_attempt: { status: "pwned", at: "x" } }), null);
});

test("WHOOP signed bridge calls: client never echoed, start URL checked, outcomes fixed", async () => {
  const seen = [];
  const input = { client_id: "synthetic-client-id-0001", client_secret: "synthetic-client-secret-ZZZZ" };
  const c = await postWhoopClient(cfgW, input, { transport: reply(201, { outcome: "configured" }, seen) });
  assert.deepEqual(c, { outcome: "configured" });
  assert.equal(seen[0].target, "/v0/fitness/whoop/oauth/client");
  assert.deepEqual((await postWhoopClient(cfgW, input, { transport: reply(409, { error: "client_already_configured" }) })), { outcome: "conflict", code: "client_already_configured" });
  assert.equal((await postWhoopClient(cfgW, { ...input, access_token: "x" })).outcome, "rejected");
  assert.equal((await postWhoopClient(cfgW, input, { transport: reply(500, {}) })).outcome, "unavailable");
  const hash = "a".repeat(64);
  assert.deepEqual(await startWhoopOAuth(cfgW, hash, { transport: reply(200, { authorization_url: AUTH }) }), { ok: true, authorization_url: AUTH });
  assert.deepEqual(await startWhoopOAuth(cfgW, hash, { transport: reply(200, { authorization_url: AUTH.replace("api.prod.whoop.com", "evil.example") }) }), { ok: false, code: "bad_payload" });
  assert.deepEqual(await startWhoopOAuth(cfgW, hash, { transport: reply(409, { error: "needs_setup" }) }), { ok: false, code: "needs_setup" });
  assert.equal(await completeWhoopOAuth(cfgW, { state: STATE, nonce: STATE, code: "abc" }, { transport: reply(200, { outcome: "authorized" }) }), "authorized");
  assert.equal(await completeWhoopOAuth(cfgW, { state: STATE, nonce: STATE, code: "abc" }, { transport: reply(200, { outcome: "connected!" }) }), "unavailable");
  assert.equal(await completeWhoopOAuth(cfgW, { state: STATE, nonce: STATE, code: "abc" }, { transport: reply(503, {}) }), "unavailable");
  assert.equal(typeof fetchWhoopOAuthStatus, "function");
});

test("WHOOP routes: protected setup/connect/status; ONE public callback that binds state + cookie and leaks nothing", () => {
  for (const p of ["src/app/api/fitness/whoop/oauth/route.ts", "src/app/api/fitness/whoop/client/route.ts", "src/app/api/fitness/whoop/connect/route.ts"]) {
    const src = read(p);
    assert.match(src, /hasControlAccess\(\)/, p);
    assert.match(src, /"Cache-Control": "no-store"/, p);
    assert.doesNotMatch(src, /console\.|process\.env/, p);
  }
  for (const p of ["src/app/api/fitness/whoop/client/route.ts", "src/app/api/fitness/whoop/connect/route.ts"]) {
    const src = read(p);
    assert.match(src, /isSameOriginMutation\(request\.headers, request\.url\)/, p);
    assert.match(src, /export async function POST\(/, p);
    assert.doesNotMatch(src, /export async function (GET|PUT|PATCH|DELETE)/, p);
  }
  const client = read("src/app/api/fitness/whoop/client/route.ts");
  assert.match(client, /MAX_CLIENT_REQUEST_BYTES/);
  assert.doesNotMatch(client, /client_secret\s*[:,]\s*.*NextResponse|json\(\{[^}]*client_(id|secret)/, "never echoed");
  const connect = read("src/app/api/fitness/whoop/connect/route.ts");
  assert.match(connect, /randomBytes\(32\)/);
  assert.match(connect, /res\.cookies\.set\(OAUTH_COOKIE, nonce, oauthCookieOptions\(\)\)/);
  assert.doesNotMatch(connect, /SESSION_COOKIE|createSessionToken/);
  const cb = read("src/app/api/fitness/whoop/callback/route.ts");
  assert.match(cb, /export async function GET\(/);
  assert.doesNotMatch(cb, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(cb, /hasControlAccess|SESSION_COOKIE|createSessionToken|console\.|NextResponse\.json/, "no session minted, no JSON data returned, nothing logged");
  assert.match(cb, /cb && cb\.state !== null && NONCE_RE\.test\(nonce\)/, "query alone is never enough: state AND companion cookie");
  assert.match(cb, /status: 303/);
  assert.match(cb, /Location: `\/body-os\?whoop=\$\{result\}`/, "fixed path + allowlisted code only");
  assert.match(cb, /"Referrer-Policy": "no-referrer"/);
  assert.match(cb, /res\.cookies\.set\(OAUTH_COOKIE, "", oauthCookieOptions\(0\)\)/);
  const page = read("src/app/body-os/page.tsx");
  assert.match(page, /type="password"/);
  assert.match(page, /setClientSecret\(""\)/, "secret input cleared after an accepted save");
  assert.doesNotMatch(page, /localStorage|sessionStorage|document\.cookie|access_token|refresh_token/);
  // client_secret appears only as the one setup POST body key (approved setup field), never rendered or prefilled.
  assert.deepEqual(page.match(/client_secret/g), ["client_secret"]);
  assert.match(page, /JSON\.stringify\(\{ client_id: clientId\.trim\(\), client_secret: clientSecret \}\)/);
  assert.match(page, /window\.history\.replaceState\(null, "", window\.location\.pathname\)/, "result code stripped from the address bar");
});

// ---- v2: in-place edit of a saved set (append-only save is unchanged) ----
const ROW = { ...SET, key: "set_synthetic_000000001", saved_at: "2026-01-05T10:00:00Z", revision: "a".repeat(32), edited_at: null };
const EDIT = { key: ROW.key, expected_revision: ROW.revision, weight: 55, unit: "lb", reps: 9, rir: 2, notes: "fixed" };

test("edit input: exact correctable fields only; identity fields are never accepted", () => {
  assert.deepEqual(EDIT_KEYS, Object.keys(EDIT));
  assert.equal(validateEditInput(EDIT), null);
  assert.equal(validateEditInput({ ...EDIT, date: "2026-01-06" }), "invalid_fields");
  assert.equal(validateEditInput({ ...EDIT, set_number: 2 }), "invalid_fields");
  assert.equal(validateEditInput({ ...EDIT, expected_revision: "nope" }), "invalid_revision");
  assert.equal(validateEditInput({ ...EDIT, key: "x" }), "invalid_set_key");
  assert.equal(validateEditInput({ ...EDIT, weight: 10.1 }), "invalid_weight");
  assert.equal(validateEditInput({ ...EDIT, rir: 11 }), "invalid_rir");
  assert.equal(validateEditInput({ ...EDIT, notes: "a\nb" }), "invalid_notes");
  for (const c of ["revision_conflict", "set_not_found"]) assert.ok(SET_ERROR_COPY[c], c);
});

test("editDraftToInput prefills from the row and keeps its identity and revision", () => {
  const ok = editDraftToInput(ROW, { weight: "55", unit: "lb", reps: "9", rir: "2", notes: " fixed " });
  assert.deepEqual(ok.input, EDIT);
  assert.equal(editDraftToInput(ROW, { weight: "55", unit: "lb", reps: "", rir: "2", notes: "" }).error, "invalid_reps");
  assert.equal(editDraftToInput(ROW, { weight: "55", unit: "lb", reps: "9", rir: "", notes: "" }).error, "rir_required");
  assert.equal(editDraftToInput({ ...ROW, kind: "warmup" }, { weight: "5", unit: "kg", reps: "9", rir: "", notes: "" }).input.rir, null);
});

test("edit answers: only 2xx updated/unchanged confirm; 409 revision_conflict is stale; 5xx/timeout are not confirmed", () => {
  const set = { ...ROW, weight: 55 };
  assert.equal(classifyEditResponse(200, { ok: true, outcome: "updated", deduplicated: false, set }).kind, "updated");
  assert.equal(classifyEditResponse(200, { ok: true, outcome: "updated", deduplicated: true, set }).deduplicated, true);
  assert.equal(classifyEditResponse(200, { ok: true, outcome: "unchanged", set }).kind, "unchanged");
  assert.equal(classifyEditResponse(200, { ok: true, outcome: "saved", set }).kind, "unconfirmed", "a set-save answer is not an edit");
  assert.equal(classifyEditResponse(503, { ok: false }).kind, "unconfirmed");
  assert.equal(classifyEditResponse(200, null).kind, "unconfirmed");
  assert.deepEqual(classifyEditResponse(409, { ok: false, outcome: "conflict", code: "revision_conflict" }), { kind: "stale" });
  assert.deepEqual(classifyEditResponse(409, { ok: false, outcome: "conflict", code: "idempotency_conflict" }), { kind: "refused", code: "idempotency_conflict" });
  assert.deepEqual(classifyEditResponse(404, { ok: false, outcome: "rejected", code: "set_not_found" }), { kind: "refused", code: "set_not_found" });
});

test("postEdit maps bridge outcomes (synthetic transport, no network)", async () => {
  const cfg = { configured: true, origin: "http://127.0.0.1:9", secret: Buffer.alloc(32, 1) };
  const seen = [];
  const transport = (status, data) => async (req) => { seen.push(req); return { status, contentType: "application/json", body: Buffer.from(JSON.stringify(data)) }; };
  const op = "edit_synthetic_0000001";
  const r = await postEdit(cfg, EDIT, op, { transport: transport(200, { outcome: "updated", deduplicated: false, set: { ...ROW, weight: 55, revision: "b".repeat(32) } }) });
  assert.equal(r.outcome, "updated");
  assert.equal(r.set.revision, "b".repeat(32));
  assert.equal((await postEdit(cfg, EDIT, op, { transport: transport(200, { outcome: "updated", set: { ...ROW, key: "set_other_00000000001" } }) })).outcome, "unavailable", "answer for another row is not accepted");
  assert.deepEqual(await postEdit(cfg, EDIT, op, { transport: transport(409, { error: "revision_conflict" }) }), { outcome: "conflict", code: "revision_conflict" });
  assert.deepEqual(await postEdit(cfg, EDIT, op, { transport: transport(404, { error: "set_not_found" }) }), { outcome: "rejected", code: "set_not_found" });
  assert.equal((await postEdit(cfg, EDIT, op, { transport: transport(503, { error: "log_store_unavailable" }) })).outcome, "unavailable");
  assert.equal((await postEdit(cfg, { ...EDIT, date: "x" }, op)).outcome, "rejected");
  assert.equal((await postEdit(cfg, EDIT, "short")).outcome, "rejected");
});

test("edit route: same-origin, session-guarded, JSON, bounded, keyed; no delete or generic JSON editor", () => {
  const src = read("src/app/api/fitness/logs/edit/route.ts");
  assert.match(src, /isSameOriginMutation\(request\.headers, request\.url\)/);
  assert.match(src, /hasControlAccess\(\)/);
  assert.match(src, /IDEM_RE\.test\(key\)/);
  assert.match(src, /MAX_EDIT_REQUEST_BYTES/);
  assert.match(src, /validateEditInput\(input\)/);
  assert.doesNotMatch(src, /export async function (GET|PUT|DELETE|PATCH)/);
  assert.ok(src.indexOf("isSameOriginMutation(request") < src.indexOf("hasControlAccess()"), "origin is checked before the session");
  assert.doesNotMatch(src, /process\.env\.(?!MC_)/);
});

test("Body OS page v2: no safety-gate card or Effort card; Edit/Update/Cancel on saved rows; no delete", () => {
  const src = read("src/app/body-os/page.tsx");
  assert.doesNotMatch(src, /read before every session/i);
  assert.doesNotMatch(src, /title="Effort"/);
  assert.doesNotMatch(src, /acknowledg/i);
  assert.match(src, /fetch\("\/api\/fitness\/logs\/edit", \{ method: "POST"/);
  for (const t of ["edit-", "edit-update", "edit-cancel"]) assert.ok(src.includes(t), t);
  assert.doesNotMatch(src, /method: "DELETE"|Delete set|>Delete</);
  assert.doesNotMatch(src, /\b81\b|6h ?25/);
});

test("WHOOP gauges: official recovery bands; sleep is performance %, strain native 0-21; unknown/stale never coloured", () => {
  assert.equal(recoveryBand(0), "red"); assert.equal(recoveryBand(33), "red");
  assert.equal(recoveryBand(34), "yellow"); assert.equal(recoveryBand(66), "yellow");
  assert.equal(recoveryBand(67), "green"); assert.equal(recoveryBand(100), "green");
  assert.equal(recoveryBand(null), null);
  const base = { state: "connected", observedAt: "2026-01-05T12:00:00Z", freshness: "current", cached: false,
    cycle: { id: 1, start: "2026-01-05T04:00:00Z", end: null, updated_at: "2026-01-05T11:00:00Z", score_state: "SCORED", strain: 10.5 },
    recovery: { updated_at: "2026-01-05T07:00:00Z", score_state: "SCORED", user_calibrating: false, recovery_score: 70, resting_heart_rate: 50, hrv_rmssd_milli: 60 },
    sleep: { start: "2026-01-04T23:00:00Z", end: "2026-01-05T06:30:00Z", updated_at: "2026-01-05T06:40:00Z", score_state: "SCORED", sleep_performance_percentage: 88, asleep_milli: 25200000 } };
  const g = whoopGauges(base);
  assert.deepEqual([g.sleep.fraction, g.sleep.status, g.sleep.tone], [0.88, "scored", "purple"]);
  assert.equal(g.sleep.display, "88%");
  assert.deepEqual([g.recovery.fraction, g.recovery.tone, g.recovery.display], [0.7, "green", "70%"]);
  assert.deepEqual([g.strain.fraction, g.strain.tone, g.strain.display], [0.5, "blue", "10.5"]);
  assert.doesNotMatch(g.strain.display, /%/);
  const pend = whoopGauges({ ...base, recovery: { ...base.recovery, score_state: "PENDING_SCORE", recovery_score: null }, sleep: null, cycle: { ...base.cycle, score_state: "UNSCORABLE", strain: null } });
  assert.deepEqual([pend.recovery.status, pend.recovery.fraction, pend.recovery.tone], ["pending", null, null]);
  assert.deepEqual([pend.sleep.status, pend.sleep.fraction], ["missing", null]);
  assert.deepEqual([pend.strain.status, pend.strain.fraction], ["unscorable", null]);
  assert.equal(whoopGauges({ ...base, recovery: { ...base.recovery, user_calibrating: true } }).recovery.status, "calibrating");
  assert.equal(whoopGauges({ ...base, recovery: { ...base.recovery, user_calibrating: true } }).recovery.tone, null);
  const stale = whoopGauges({ ...base, freshness: "stale" });
  assert.ok(["sleep", "recovery", "strain"].every((k) => stale[k].status === "stale" && stale[k].tone === null));
  assert.equal(whoopGauges({ state: "error", code: "network" }), null);
  assert.equal(checkWhoop({ state: "connected", observed_at: "2026-01-05T10:00:00Z", freshness: "current", cached: true, cycle: null, recovery: null, sleep: null }).cached, true);
});

// ---- run44: the editor owns one exact pending operation; WHOOP failed refresh is shown as stale, never as normal ----
test("edit operation: one exact op key + body is owned until confirmed; draft changes cannot mint another", async () => {
  const FM = await import("../src/lib/mission-control/fitness-model.mjs");
  assert.equal(typeof FM.editOperation, "function", "editOperation exported");
  let n = 0; const mint = () => `edit_synthetic_${String(++n).padStart(8, "0")}`;
  const d = { weight: "55", unit: "lb", reps: "9", rir: "2", notes: "fixed" };
  const first = FM.editOperation(null, ROW, d, mint);
  assert.deepEqual(first.op, { opKey: "edit_synthetic_00000001", body: JSON.stringify(EDIT) });
  // Unresolved: a different draft (or a blank one) still yields the SAME key and the SAME serialized payload, nothing minted.
  const again = FM.editOperation(first.op, ROW, { ...d, reps: "1", notes: "other" }, mint);
  assert.deepEqual(again.op, first.op);
  assert.deepEqual(FM.editOperation(first.op, ROW, { ...d, reps: "" }, mint).op, first.op);
  assert.equal(n, 1, "no second key minted while unresolved");
  const bad = FM.editOperation(null, ROW, { ...d, reps: "" }, mint);
  assert.equal(bad.error, "invalid_reps"); assert.equal(n, 1, "invalid draft mints no key");
});

test("edit settle: success/unchanged/stale close; explicit 4xx unlocks; 408/429/5xx/unreadable keep the lock", async () => {
  const FM = await import("../src/lib/mission-control/fitness-model.mjs");
  assert.equal(typeof FM.editSettle, "function", "editSettle exported");
  const set = { ...ROW, revision: "b".repeat(32) };
  const k = (status, data) => FM.editSettle(classifyEditResponse(status, data).kind);
  assert.equal(k(200, { ok: true, outcome: "updated", set }), "close");
  assert.equal(k(200, { ok: true, outcome: "unchanged", set }), "close");
  assert.equal(k(409, { ok: false, code: "revision_conflict" }), "close");
  assert.equal(k(400, { ok: false, code: "invalid_reps" }), "unlock");
  assert.equal(k(404, { ok: false, code: "set_not_found" }), "unlock");
  assert.equal(k(401, { ok: false, state: "unauthenticated" }), "unlock");
  for (const s of [408, 429, 500, 502, 503]) assert.equal(k(s, { ok: false }), "hold", String(s));
  assert.equal(k(200, null), "hold");
  assert.equal(FM.editSettle("anything-else"), "hold", "unknown kinds never unlock");
});

test("WHOOP gauges: a retained read after a failed refresh is stale/neutral; out-of-range or no_data is unknown, never a full ring", () => {
  const base = { state: "connected", observedAt: "2026-01-05T12:00:00Z", freshness: "current", cached: false,
    cycle: { id: 1, start: "2026-01-05T04:00:00Z", end: null, updated_at: "2026-01-05T11:00:00Z", score_state: "SCORED", strain: 10.5 },
    recovery: { updated_at: "2026-01-05T07:00:00Z", score_state: "SCORED", user_calibrating: false, recovery_score: 70, resting_heart_rate: 50, hrv_rmssd_milli: 60 },
    sleep: { start: "2026-01-04T23:00:00Z", end: "2026-01-05T06:30:00Z", updated_at: "2026-01-05T06:40:00Z", score_state: "SCORED", sleep_performance_percentage: 88, asleep_milli: 25200000 } };
  const kept = whoopGauges(base, { retained: true });
  for (const k of ["sleep", "recovery", "strain"]) assert.deepEqual([kept[k].status, kept[k].tone], ["stale", null], k);
  assert.equal(kept.strain.display, "10.5", "native strain number kept");
  assert.equal(whoopGauges(base).recovery.tone, "green", "a fresh successful read is normal again");
  const unk = (g) => [g.status, g.fraction, g.display, g.tone];
  const out = whoopGauges({ ...base, sleep: { ...base.sleep, sleep_performance_percentage: 120 }, recovery: { ...base.recovery, recovery_score: -5 }, cycle: { ...base.cycle, strain: 25 } });
  for (const k of ["sleep", "recovery", "strain"]) assert.deepEqual(unk(out[k]), ["unknown", null, null, null], k);
  assert.deepEqual(unk(whoopGauges({ ...base, recovery: { ...base.recovery, recovery_score: Number.NaN } }).recovery), ["unknown", null, null, null]);
  const none = whoopGauges({ ...base, freshness: "no_data" });
  for (const k of ["sleep", "recovery", "strain"]) assert.deepEqual(unk(none[k]), ["unknown", null, null, null], k);
  assert.equal(whoopGauges({ ...base, freshness: "weird" }).recovery.tone, null, "unrecognised freshness is never coloured");
  assert.equal(whoopGauges({ ...base, cycle: { ...base.cycle, strain: 21 } }).strain.fraction, 1);
  assert.equal(whoopGauges({ ...base, cycle: { ...base.cycle, strain: 0 } }).strain.fraction, 0);
});

test("Body OS page run44: editor fields locked while unresolved; exact Retry update; retained WHOOP read flagged; no global overflow hiding", () => {
  const src = read("src/app/body-os/page.tsx");
  assert.match(src, /editOperation\(/);
  assert.match(src, /editSettle\(/);
  assert.match(src, /Retry update/);
  assert.match(src, /whoopGauges\(whoop, \{ retained/);
  assert.doesNotMatch(src, /data-testid="body-os"[^>]*overflow-x-hidden|overflow-x-hidden[^>]*data-testid="body-os"/);
});
