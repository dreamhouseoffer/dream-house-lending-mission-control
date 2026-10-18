// OPT-IN LOCAL BROWSER TEST (Gate7): the real built /approvals/[id] page and the real OwnerChallengePanel client
// component, rendered and clicked in a headless Chromium (desktop + mobile viewports). Production stays disabled.
// Layers, kept separate in the results:
//   - REAL browser/DOM: Next production build (`next start`), real React hydration, real clicks, real fetch(), and a
//     real navigator.credentials.get() answered by Chrome's CDP virtual authenticator (no platform authenticator, no
//     user passkey, no OS prompt).
//   - SYNTHETIC backend/WebAuthn: the virtual authenticator holds an in-memory SYNTHETIC ES256 key that is pinned only
//     in the private bridge's NODE_TEST_CONTEXT-only harness (createCeremonyTestBridge) on a fresh scratch SQLite with
//     a SYNTHETIC fake `hermes` CLI. Fault cases (post-send 503, pre-send refusal) are injected in the browser routing
//     layer below; nothing in the app is patched.
// Network: the browser opens the SYNTHETIC canonical origin https://mission-control.integration.invalid (never
// resolved). Every browser request is intercepted: same-origin requests are forwarded by this process to a loopback
// `next start`; every other request is aborted and recorded. Servers bind 127.0.0.1 on ephemeral ports and are stopped
// in `after`, whatever fails. Prints codes/statuses only — never the PIN, secrets, cookie or token.
// Requires an existing production build (.next), playwright-core and a Chromium binary already on disk (no installs):
//   MC_OWNER_CHALLENGE_BROWSER=1 MC_PLAYWRIGHT_CORE=<dir of playwright-core> MC_CHROMIUM_EXECUTABLE=<chromium binary> \
//   MC_BROWSER_QA_OUT=<artifact dir> TMPDIR=~/.hermes/cache/scratch node --test scripts/test-owner-challenge-browser.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRIDGE_SERVER = path.join(os.homedir(), ".hermes", "mission-control", "bridge", "server.js");
const APPROVED_SCRATCH = path.join(os.homedir(), ".hermes", "cache", "scratch");
const PW = process.env.MC_PLAYWRIGHT_CORE;
const EXE = process.env.MC_CHROMIUM_EXECUTABLE;
const skip = process.env.MC_OWNER_CHALLENGE_BROWSER !== "1" ? "opt-in: set MC_OWNER_CHALLENGE_BROWSER=1"
  : !existsSync(path.join(ROOT, ".next", "BUILD_ID")) ? "no production build (.next)"
  : !PW || !existsSync(path.join(PW, "package.json")) ? "MC_PLAYWRIGHT_CORE not found (no installs are made)"
  : !EXE || !existsSync(EXE) ? "MC_CHROMIUM_EXECUTABLE not found (no installs are made)" : false;

const CANONICAL = "https://mission-control.integration.invalid"; // SYNTHETIC, never resolved
const RP_ID = new URL(CANONICAL).hostname;
const TASK_ID = "t_5a0007";
const b64u = (b) => Buffer.from(b).toString("base64url");
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const PROFILES = [
  { name: "desktop", context: { viewport: { width: 1280, height: 900 } } },
  { name: "mobile", context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
];
const COPY = {
  notEnabled: "Owner challenge approval is not enabled for this deployment.",
  unconfirmed: "The decision answer could not be confirmed. Retry the same signed decision; it cannot apply twice.",
  cancelled: "Passkey request cancelled. Nothing was signed or sent.",
  preSend: "Owner challenge approval is unavailable right now.",
  authorized: "Approved: authorized, not executed",
  notConnected: "External execution is not connected: nothing has been sent, published or run.",
  authorizesOnly: "Approving authorizes only. It does not execute, send or publish anything; external execution is not connected.",
  replay: "This decision was already recorded; the bridge returned the same result.",
};

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

const freePort = () => new Promise((resolve) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });

async function startNext(dir, tag, extraEnv) {
  const pin = randomBytes(9).toString("base64url");
  const sessionSecret = randomBytes(48).toString("base64url");
  const port = await freePort();
  const log = openSync(path.join(dir, `next-start-${tag}.log`), "a");
  const child = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      MISSION_CONTROL_PIN: pin, MISSION_CONTROL_SESSION_SECRET: sessionSecret,
      MISSION_CONTROL_CANONICAL_ORIGIN: CANONICAL, ...extraEnv },
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
  return { pin, sessionSecret, child, stop, port, base: `http://127.0.0.1:${port}`, selfOrigin: `http://localhost:${port}` };
}

async function waitReady(base, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited_${child.exitCode}`);
    try { await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(2000) }); return; }
    catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error("server_not_ready");
}

async function loginToken(app, cookieName) {
  const res = await fetch(`${app.base}/api/auth/login`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", origin: app.selfOrigin, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ pin: app.pin }) });
  assert.equal(res.status, 200, "synthetic login");
  const c = res.headers.getSetCookie().find((x) => x.startsWith(`${cookieName}=`));
  assert.ok(c, "session cookie set");
  return c.slice(cookieName.length + 1).split(";")[0];
}

const FORWARD_HEADERS = ["accept", "content-type", "cookie", "origin", "referer", "user-agent", "sec-fetch-site", "sec-fetch-mode",
  "sec-fetch-dest", "rsc", "next-router-state-tree", "next-router-prefetch", "next-url", "next-action"];
const DROP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie"]);

test("Gate7 owner-challenge panel in a real browser (SYNTHETIC backend + virtual authenticator, production disabled)", { skip, timeout: 300_000 }, async (t) => {
  assert.ok(process.env.NODE_TEST_CONTEXT, "must run under node --test");
  assert.equal(realpathSync(process.env.TMPDIR ?? ""), realpathSync(APPROVED_SCRATCH), "TMPDIR must be the approved scratch dir");
  const dir = mkdtempSync(path.join(realpathSync(APPROVED_SCRATCH), "mc-gate7-browser-"));
  const OUT = process.env.MC_BROWSER_QA_OUT ? path.resolve(process.env.MC_BROWSER_QA_OUT) : path.join(dir, "qa");
  mkdirSync(OUT, { recursive: true });

  const results = { started_at: new Date().toISOString(), canonical: CANONICAL, checks: [], denied_requests: [], console: {}, page_errors: {}, screenshots: [] };
  const check = (layer, name, ok, detail) => {
    results.checks.push({ layer, name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
    process.stdout.write(`${ok ? "PASS" : "FAIL"} [${layer}] ${name}\n`);
    assert.ok(ok, `${layer}: ${name}${detail === undefined ? "" : ` :: ${JSON.stringify(detail).slice(0, 400)}`}`);
  };
  const saveResults = () => {
    results.passed = results.checks.filter((c) => c.ok).length;
    results.failed = results.checks.filter((c) => !c.ok).length;
    writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
    for (const [k, lines] of Object.entries(results.console)) writeFileSync(path.join(OUT, `console-${k}.log`), lines.join("\n") + (lines.length ? "\n" : ""));
  };

  // ---- SYNTHETIC backend: scratch board, ceremony harness bridge, SYNTHETIC owner key ----
  const statePath = path.join(dir, "fake-board-SYNTHETIC.json");
  writeFileSync(statePath, JSON.stringify({ tasks: [{ id: TASK_ID, title: "SYNTHETIC no-send gate7 fixture", status: "review",
    assignee: "mcb-synthetic", created_by: "mission-control", created_at: 1790000000 }] }));
  const kanbanHome = path.join(dir, "kanban-home");
  const pins = { HERMES_HOME: kanbanHome, HERMES_KANBAN_HOME: kanbanHome, HERMES_KANBAN_DB: path.join(kanbanHome, "kanban.db"),
    HERMES_KANBAN_WORKSPACES_ROOT: path.join(kanbanHome, "kanban", "workspaces"), HERMES_KANBAN_ATTACHMENTS_ROOT: path.join(kanbanHome, "kanban", "attachments") };
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const credIdBytes = randomBytes(16);
  const credential = { id: b64u(credIdBytes), principal: "owner", alg: "ES256", public_key_spki: publicKey.export({ format: "der", type: "spki" }).toString("base64") };
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const bridgeSecret = randomBytes(36).toString("base64url");
  const { createCeremonyTestBridge } = createRequire(import.meta.url)(BRIDGE_SERVER);
  const { bridgeRequest, readBridgeConfig } = await import(pathToFileURL(path.join(ROOT, "src/lib/mission-control/bridge-client.mjs")).href);
  const { SESSION_COOKIE, createSessionToken, readSessionConfig } = await import(pathToFileURL(path.join(ROOT, "src/lib/auth/session.mjs")).href);

  const owned = [];
  t.after(async () => {
    saveResults();
    for (const stop of owned.reverse()) { try { await stop(); } catch {} }
  });

  const bridge = createCeremonyTestBridge({ secret: bridgeSecret, dbPath: path.join(dir, "bridge-SYNTHETIC.db"), hermesBin: writeFakeCli(dir, statePath),
    assignees: [], cliTimeoutMs: 5000, hermesHome: kanbanHome, hermesEnv: { ...pins },
    approvals: { enabled: true, humans: ["owner"], ceremony: { issueLimits: { windowSeconds: 300, maxPerSession: 20, maxGlobal: 50 } },
      ownerAssertion: { mode: "webauthn", rpId: RP_ID, origins: [CANONICAL], maxTtlSeconds: 120, credentials: [credential] } } });
  owned.push(() => bridge.close());
  const bridgeCalls = [];
  bridge.server.on("request", (req) => bridgeCalls.push(`${req.method} ${req.url}`));
  const bridgePort = await bridge.listen(0);
  assert.notEqual(bridgePort, 9130, "never the live bridge port");
  const direct = readBridgeConfig({ url: `http://127.0.0.1:${bridgePort}`, secret: bridgeSecret });
  let seq = 0;
  const seedApproval = async () => {
    seq += 1;
    const r = await bridgeRequest(direct, "POST", "/v0/approvals", { acceptStatus: [201], idempotencyKey: `gate7-seed-${String(seq).padStart(8, "0")}`,
      body: { task_id: TASK_ID, artifact_id: `art-synthetic-g7-${seq}`, content: `SYNTHETIC no-send draft ${seq}`, action: "publish",
        destination: "test-sink:synthetic-no-send", max_cost_cents: 0, not_before: iso(-1000), expires_at: iso(3_600_000), requested_by: "agent-synthetic" } });
    assert.ok(r.ok, JSON.stringify(r));
    return r.data.approval;
  };
  const dbRow = (id) => bridge.db.prepare("SELECT status, row_version FROM approvals WHERE approval_id=?").get(id);
  const assertionsCount = () => bridge.db.prepare("SELECT COUNT(*) n FROM owner_assertions").get().n;

  // Default (no owner opt-in, no bridge configured) and opt-in-against-harness `next start` servers.
  const appOff = await startNext(dir, "default-disabled", {});
  owned.push(appOff.stop);
  const appOn = await startNext(dir, "enabled-harness", { MISSION_CONTROL_APPROVAL_CEREMONY: "challenge_only_v1",
    MC_BRIDGE_URL: `http://127.0.0.1:${bridgePort}`, MC_BRIDGE_SECRET: bridgeSecret });
  owned.push(appOn.stop);
  await Promise.all([waitReady(appOff.base, appOff.child), waitReady(appOn.base, appOn.child)]);
  for (const a of [appOff, appOn]) assert.ok(![9130, 3211].includes(a.port));
  // The default server has no bridge, so its bridge-throttled login answers 503 by design; its SYNTHETIC owner session
  // is minted with the app's own session code and that server's scratch secret instead.
  const offConfig = readSessionConfig({ pin: appOff.pin, secret: appOff.sessionSecret });
  assert.ok(offConfig.ok);
  const tokenOff = await createSessionToken(offConfig);
  const tokenOn = await loginToken(appOn, SESSION_COOKIE);

  // ---- REAL browser ----
  const { chromium } = createRequire(import.meta.url)(PW);
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-first-run", "--disable-background-networking", "--disable-sync"] });
  owned.push(() => browser.close());
  results.browser = { version: browser.version(), executable: path.basename(EXE) };

  // One context per (profile, server). All requests intercepted; only the canonical origin is forwarded to loopback.
  async function openContext(profile, app, token, tag) {
    const ctx = await browser.newContext({ ...profile.context, serviceWorkers: "block", ignoreHTTPSErrors: false });
    await ctx.addCookies([{ name: SESSION_COOKIE, value: token, domain: RP_ID, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    const log = { posts: [], gets: [], decideBodies: [] };
    const state = { decideFault: "pass" };
    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (u.origin !== CANONICAL) {
        results.denied_requests.push({ tag, url: `${u.protocol}//${u.host}${u.pathname}` });
        return route.abort("blockedbyclient");
      }
      const isApi = u.pathname.startsWith("/api/control/approvals/");
      if (isApi && req.method() === "GET") log.gets.push(u.pathname);
      if (req.method() === "POST") log.posts.push(u.pathname);
      const isDecide = req.method() === "POST" && /^\/api\/control\/approvals\/[^/]+\/decision$/.test(u.pathname);
      if (isDecide) log.decideBodies.push(req.postDataBuffer() ?? Buffer.alloc(0));
      // SYNTHETIC fault, pre-send: refuse before anything reaches the app or the bridge.
      if (isDecide && state.decideFault === "pre_send_503") {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "ceremony_unavailable" }) });
      }
      const all = await req.allHeaders();
      const headers = {};
      for (const k of FORWARD_HEADERS) if (all[k] !== undefined) headers[k] = all[k];
      // Chromium adds Sec-Fetch-* after interception, so the paused request lacks them. Derive same-origin only from
      // the browser's own Origin header (never for a foreign or missing Origin); counted in the results.
      if (headers["sec-fetch-site"] === undefined && headers.origin === CANONICAL) {
        headers["sec-fetch-site"] = "same-origin";
        results.sec_fetch_site_derived = (results.sec_fetch_site_derived ?? 0) + 1;
      }
      const res = await fetch(`${app.base}${u.pathname}${u.search}`, { method: req.method(), headers, body: req.postDataBuffer() ?? undefined,
        redirect: "manual", signal: AbortSignal.timeout(30_000) });
      const body = Buffer.from(await res.arrayBuffer());
      // SYNTHETIC fault, post-send: the decision really reached the app and bridge; only the answer is lost.
      if (isDecide && state.decideFault === "post_send_503") {
        log.lostAnswer = { status: res.status, replay: (() => { try { return JSON.parse(body.toString()).replay; } catch { return null; } })() };
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "bridge_offline" }) });
      }
      const outHeaders = {};
      res.headers.forEach((v, k) => { if (!DROP_RESPONSE.has(k)) outHeaders[k] = k === "location" ? v.replace(app.base, CANONICAL).replace(app.selfOrigin, CANONICAL) : v; });
      return route.fulfill({ status: res.status, headers: outHeaders, body });
    });
    // Passive spy: counts get()/create() calls and delegates unchanged to the browser's own implementation.
    await ctx.addInitScript(() => {
      const c = navigator.credentials;
      const get = c.get.bind(c);
      const create = c.create.bind(c);
      window.__mcCred = { get: 0, create: 0 };
      c.get = (o) => { window.__mcCred.get += 1; return get(o); };
      c.create = (o) => { window.__mcCred.create += 1; return create(o); };
    });
    const page = await ctx.newPage();
    const lines = (results.console[tag] = []);
    const errs = (results.page_errors[tag] = []);
    page.on("console", (m) => lines.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => errs.push(String(e?.message ?? e)));
    return { ctx, page, log, state };
  }

  async function virtualAuthenticator(page, signCount) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable", { enableUI: false });
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal",
      hasResidentKey: false, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await cdp.send("WebAuthn.addCredential", { authenticatorId, credential: { credentialId: credIdBytes.toString("base64"), isResidentCredential: false,
      rpId: RP_ID, privateKey: pkcs8, signCount } });
    return { presence: (on) => cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled: on }) };
  }

  const shot = async (page, name) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.screenshots.push(path.basename(file));
  };
  // Waits for visible text; on timeout saves a failure screenshot and reports the panel's live notices.
  const waitText = async (page, text, timeout = 15_000) => {
    try { await page.getByText(text).first().waitFor({ timeout }); }
    catch (e) {
      const notices = await page.locator("[aria-live]").allTextContents().catch(() => []);
      await shot(page, `failure-${results.screenshots.length}`).catch(() => {});
      throw new Error(`timeout waiting for ${JSON.stringify(text)}; notices=${JSON.stringify(notices)}`, { cause: e });
    }
  };
  const credCalls = (page) => page.evaluate(() => ({ ...window.__mcCred }));
  const terms = (page) => page.locator("dl > div").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.querySelector("dt")?.textContent ?? "", e.querySelector("dd")?.textContent ?? ""])));
  // Two synchronous clicks in one task: React cannot re-render between them, so only the inflight guard can stop the second.
  const doubleClick = (page, name) => page.getByRole("button", { name }).evaluate((b) => { b.click(); b.click(); });

  for (const [i, profile] of PROFILES.entries()) {
    const P = profile.name;

    // ===== Default: no owner opt-in. Disabled control; no approval read, no POST, no get(). =====
    {
      const tag = `${P}-default-disabled`;
      const { ctx, page, log } = await openContext(profile, appOff, tokenOff, tag);
      const id = `ap_${"0".repeat(23)}${i + 1}`;
      await page.goto(`${CANONICAL}/approvals/${id}`, { waitUntil: "networkidle" });
      await waitText(page, COPY.notEnabled, 15_000);
      const btn = page.getByRole("button", { name: "Decide with passkey" });
      check("browser-dom", `${P} default: disabled "Decide with passkey" rendered with not-enabled reason`, (await btn.isDisabled()) && (await btn.getAttribute("title")) === COPY.notEnabled);
      check("browser-dom", `${P} default: no Prepare challenge control`, (await page.getByRole("button", { name: "Prepare challenge" }).count()) === 0);
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      check("browser-dom", `${P} default: no approval GET and no POST at all`, log.gets.length === 0 && log.posts.length === 0, { gets: log.gets, posts: log.posts });
      check("browser-dom", `${P} default: navigator.credentials get()/create() never called`, JSON.stringify(await credCalls(page)) === JSON.stringify({ get: 0, create: 0 }));
      await shot(page, `${P}-1-default-disabled`);
      await ctx.close();
    }

    // ===== Enabled SYNTHETIC canonical context =====
    const tag = `${P}-enabled-synthetic`;
    const { ctx, page, log, state } = await openContext(profile, appOn, tokenOn, tag);
    const va = await virtualAuthenticator(page, 1000 * (i + 1));

    // --- A: exact terms, one prepare POST, one get(), unconfirmed post-send 503, byte-identical retry, authorized copy ---
    {
      const ap = await seedApproval();
      const note = `SYNTHETIC gate7 ${P} note`;
      await page.goto(`${CANONICAL}/approvals/${ap.approval_id}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Prepare challenge" }).waitFor({ timeout: 15_000 });
      check("browser-dom", `${P} enabled: approval read once through guarded GET`, log.gets.length === 1 && log.gets[0] === `/api/control/approvals/${ap.approval_id}`, log.gets);
      await page.locator("#owner-note").fill(note);
      await shot(page, `${P}-2-enabled-ready`);
      await doubleClick(page, "Prepare challenge");
      await waitText(page, "Your passkey will sign exactly these terms:", 15_000);
      const issues = log.posts.filter((p) => p.endsWith("/challenge"));
      check("browser-dom", `${P} prepare: double click sends exactly one challenge POST`, issues.length === 1, log.posts);
      check("browser-dom", `${P} prepare: no decision POST and no get() before the passkey click`, !log.posts.some((p) => p.endsWith("/decision")) && (await credCalls(page)).get === 0);
      const shown = await terms(page);
      const ch = bridge.db.prepare("SELECT expires_at FROM owner_challenges WHERE approval_id=?").get(ap.approval_id);
      const expected = {
        "Approval / row version": `${ap.approval_id} · v${ap.row_version}`,
        Task: TASK_ID,
        Artifact: `${ap.artifact.id} · version ${ap.artifact.version}`,
        "Artifact sha256": ap.artifact.sha256,
        Action: "publish",
        Destination: "test-sink:synthetic-no-send",
        "Max cost (cents)": "0",
        "Requested by": "agent-synthetic",
        Window: `${ap.not_before} → ${ap.expires_at}`,
        Note: note,
        "Site (rp_id)": RP_ID,
      };
      const mismatched = Object.entries(expected).filter(([k, v]) => shown[k] !== v);
      check("browser-dom", `${P} terms: displayed signed terms equal the bridge approval exactly`, mismatched.length === 0, { mismatched: mismatched.map(([k]) => [k, shown[k]]) });
      check("browser-dom", `${P} terms: challenge expiry shown and rendered as ISO`, /^\d{4}-\d\d-\d\dT/.test(shown["Challenge expires"] ?? "") && Boolean(ch));
      check("browser-dom", `${P} terms: decision chip and authorizes-only copy`, (await page.getByText(COPY.authorizesOnly).count()) === 1 && (await page.getByRole("button", { name: "Approve with passkey" }).count()) === 1);
      await shot(page, `${P}-3-exact-terms`);

      state.decideFault = "post_send_503";
      const before = assertionsCount();
      await doubleClick(page, "Approve with passkey");
      await waitText(page, COPY.unconfirmed, 20_000);
      check("browser-dom", `${P} sign: double click → exactly one real get() and one decision POST`, (await credCalls(page)).get === 1 && log.decideBodies.length === 1, { cred: await credCalls(page), decides: log.decideBodies.length });
      check("synthetic-backend", `${P} post-send: virtual-authenticator assertion verified and recorded by the harness bridge before the answer was dropped`,
        log.lostAnswer?.status === 200 && dbRow(ap.approval_id).status === "approved" && assertionsCount() === before + 1, { lost: log.lostAnswer, row: dbRow(ap.approval_id) });
      check("browser-dom", `${P} unconfirmed: retry control offered, discard hidden, no "Nothing was approved"`,
        (await page.getByRole("button", { name: "Retry same signed decision" }).count()) === 1 && (await page.getByRole("button", { name: "Discard challenge" }).count()) === 0
          && (await page.getByText("Nothing was approved").count()) === 0);
      await shot(page, `${P}-4-unconfirmed-503`);

      state.decideFault = "pass";
      await page.getByRole("button", { name: "Retry same signed decision" }).click();
      await waitText(page, COPY.authorized, 20_000);
      check("browser-dom", `${P} retry: second decision body is byte-identical and no new get()`,
        log.decideBodies.length === 2 && Buffer.compare(log.decideBodies[0], log.decideBodies[1]) === 0 && (await credCalls(page)).get === 1);
      check("browser-dom", `${P} result: authorized-not-executed copy with replay note`,
        (await page.getByText(COPY.notConnected).count()) === 1 && (await page.getByText(COPY.replay).count()) === 1);
      check("synthetic-backend", `${P} retry: bridge deduplicated (no second assertion)`, assertionsCount() === before + 1);
      await shot(page, `${P}-5-authorized-not-executed`);
    }

    // --- B: cancellation while the authenticator waits ---
    {
      const ap = await seedApproval();
      log.posts.length = 0; log.decideBodies.length = 0;
      await page.goto(`${CANONICAL}/approvals/${ap.approval_id}`, { waitUntil: "networkidle" });
      await page.getByRole("radio", { name: "Reject" }).check();
      await page.getByRole("button", { name: "Prepare challenge" }).click();
      await page.getByRole("button", { name: "Reject with passkey" }).waitFor({ timeout: 15_000 });
      await va.presence(false);
      await page.getByRole("button", { name: "Reject with passkey" }).click();
      const waiting = page.getByRole("button", { name: "Waiting for passkey…" });
      await waiting.waitFor({ timeout: 10_000 });
      check("browser-dom", `${P} cancel: main button disabled while the prompt is open`, await waiting.isDisabled());
      await waiting.evaluate((b) => b.click());
      await shot(page, `${P}-6-waiting-for-passkey`);
      await page.getByRole("button", { name: "Cancel passkey prompt" }).click();
      await waitText(page, COPY.cancelled, 10_000);
      check("browser-dom", `${P} cancel: one get() only, nothing sent, challenge still reviewable`, (await credCalls(page)).get === 1 && log.decideBodies.length === 0
        && (await page.getByRole("button", { name: "Reject with passkey" }).isEnabled()) && (await page.getByRole("button", { name: "Discard challenge" }).count()) === 1);
      check("synthetic-backend", `${P} cancel: approval still pending in the harness`, dbRow(ap.approval_id).status === "pending");
      await shot(page, `${P}-7-cancelled`);
      await page.getByRole("button", { name: "Discard challenge" }).click();
      check("browser-dom", `${P} discard: back to the decision form`, (await page.getByRole("button", { name: "Prepare challenge" }).count()) === 1);
      await va.presence(true);
    }

    // --- C: definite pre-send refusal ---
    {
      const ap = await seedApproval();
      log.posts.length = 0; log.decideBodies.length = 0;
      const decideCallsBefore = bridgeCalls.filter((c) => c.includes(ap.approval_id) && c.endsWith("/decision")).length;
      await page.goto(`${CANONICAL}/approvals/${ap.approval_id}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Prepare challenge" }).click();
      await page.getByRole("button", { name: "Approve with passkey" }).waitFor({ timeout: 15_000 });
      state.decideFault = "pre_send_503";
      await page.getByRole("button", { name: "Approve with passkey" }).click();
      await waitText(page, COPY.preSend, 20_000);
      check("browser-dom", `${P} pre-send: definite refusal copy, signed body discarded, back to form, no retry`,
        (await page.getByRole("button", { name: "Prepare challenge" }).count()) === 1 && (await page.getByRole("button", { name: "Retry same signed decision" }).count()) === 0
          && (await page.getByText("Code: ceremony_unavailable").count()) === 1 && log.decideBodies.length === 1);
      check("synthetic-backend", `${P} pre-send: nothing reached the bridge decision route; approval pending`,
        bridgeCalls.filter((c) => c.includes(ap.approval_id) && c.endsWith("/decision")).length === decideCallsBefore && dbRow(ap.approval_id).status === "pending");
      await shot(page, `${P}-8-pre-send-refusal`);
      state.decideFault = "pass";
    }

    check("browser-dom", `${P} enabled: navigator.credentials.create() never called`, (await credCalls(page)).create === 0);
    check("browser-dom", `${P} no uncaught page errors`, results.page_errors[tag].length === 0 && results.page_errors[`${P}-default-disabled`].length === 0,
      { enabled: results.page_errors[tag], disabled: results.page_errors[`${P}-default-disabled`] });
    await ctx.close();
  }

  // ---- boundaries ----
  check("browser-dom", "every browser request stayed on the SYNTHETIC canonical origin (none denied)", results.denied_requests.length === 0, results.denied_requests);
  check("synthetic-backend", "legacy decision route never called on the bridge", !bridgeCalls.some((c) => /^POST \/v0\/approvals\/[^/]+\/decision$/.test(c)));
  const argv = readFileSync(`${statePath}.argv`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  check("synthetic-backend", "fake native CLI only ever read the scratch task", argv.every((a) => a[0] === "kanban" && a[1] === "show" && a[2] === TASK_ID));
  results.finished_at = new Date().toISOString();
});
