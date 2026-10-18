// HTTP smoke for the approval ceremony routes against an owned `next start` on an unused loopback port.
// Synthetic-only PIN / session secret / canonical origin; bridge and ceremony opt-in forced empty so no external
// integration can be reached. Prints aggregate pass/fail only — never the PIN, secret, cookie or token.
// Requires an existing production build (.next). Usage: node scripts/smoke-approval-ceremony.mjs
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, openSync, existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = path.join("/Users/alfonsogarzabot/.hermes/cache/scratch", `smoke-approval-ceremony-${Date.now()}`);
const { SESSION_COOKIE, readSessionConfig, createSessionToken } = await import(
  pathToFileURL(path.join(ROOT, "src/lib/auth/session.mjs")).href
);

const results = [];
const record = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
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

async function post(base, pathname, { cookie, origin, site, body = "{}" } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  if (origin) headers.origin = origin;
  if (site) headers["sec-fetch-site"] = site;
  const res = await fetch(`${base}${pathname}`, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json, location: res.headers.get("location"), setCookie: res.headers.getSetCookie?.() ?? [] };
}

const errorCode = (j) => (j && typeof j === "object" ? j.error ?? j.reason ?? j.code ?? null : null);
const codes = (j) => (j && typeof j === "object" ? ["error", "code", "reason"].filter((k) => typeof j[k] === "string").map((k) => `${k}=${j[k]}`).join(" ") : "");
const hasCode = (j, c) => Boolean(j) && ["error", "code", "reason"].some((k) => j[k] === c);

let child;
try {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("no_production_build");
  mkdirSync(SCRATCH, { recursive: true });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const pin = randomBytes(9).toString("base64url");
  const secret = randomBytes(48).toString("base64url");
  const config = readSessionConfig({ pin, secret });
  if (!config.ok) throw new Error(`synthetic_config_${config.reason}`);
  const token = await createSessionToken(config);
  // The ceremony requires an https canonical origin (synthetic, never resolved). Logout's same-origin check compares
  // against the server-derived request URL, which `next start` reports as localhost.
  const canonical = "https://mission-control.smoke.invalid";
  const selfOrigin = `http://localhost:${port}`;

  // Minimal env: no inherited secrets. Empty-string keys stay defined so Next's .env loading cannot fill them.
  const env = {
    PATH: process.env.PATH,
    HOME: SCRATCH,
    TMPDIR: SCRATCH,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    MISSION_CONTROL_PIN: pin,
    MISSION_CONTROL_SESSION_SECRET: secret,
    MISSION_CONTROL_CANONICAL_ORIGIN: canonical,
    MISSION_CONTROL_APPROVAL_CEREMONY: "",
    MC_BRIDGE_URL: "",
    MC_BRIDGE_SECRET: "",
  };
  const log = openSync(path.join(SCRATCH, "next-start.log"), "a");
  child = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", log, log],
    detached: true,
  });
  await waitReady(base, child);

  const id = `ap_${randomBytes(12).toString("hex")}`;
  const routes = { challenge: `/api/control/approvals/${id}/challenge`, decision: `/api/control/approvals/${id}/decision` };
  const strict = { cookie: token, origin: canonical, site: "same-origin" };

  for (const [name, p] of Object.entries(routes)) {
    const r = await post(base, p, { origin: canonical, site: "same-origin" });
    const redirectedToLogin = r.status >= 300 && r.status < 400 && /\/login/.test(r.location ?? "");
    record(`${name}: unauthenticated rejected`, redirectedToLogin || r.status === 401 || r.status === 403, `status=${r.status}${redirectedToLogin ? " redirect=/login" : ""}`);

    const ok = await post(base, p, strict);
    record(`${name}: valid session + strict origin -> 503 ceremony_unavailable (opt-in absent)`, ok.status === 503 && hasCode(ok.json, "ceremony_unavailable"), `status=${ok.status} ${codes(ok.json)}`);

    const xo = await post(base, p, { cookie: token, origin: "https://evil.example", site: "cross-site" });
    record(`${name}: cross-origin refused`, xo.status >= 400 && xo.status < 500 && xo.status !== 404 && errorCode(xo.json) !== "invalid_approval_id" && errorCode(xo.json) !== "ceremony_unavailable", `status=${xo.status} error=${errorCode(xo.json)}`);

    const claims = await post(base, p, { ...strict, body: JSON.stringify({ principal: "owner", credential: "x", session_sha256: "0".repeat(64) }) });
    record(`${name}: client claims refused`, claims.status === 400 && errorCode(claims.json) === "client_claim_refused", `status=${claims.status} error=${errorCode(claims.json)}`);
  }

  const out = await post(base, "/api/auth/logout", { cookie: token, origin: selfOrigin, site: "same-origin" });
  const cleared = out.setCookie.some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && /max-age=0/i.test(c));
  record("logout clears cookie", out.status === 200 && cleared, `status=${out.status} cleared=${cleared} revocation=${out.json?.revocation ?? null}`);

  const xlogout = await post(base, "/api/auth/logout", { cookie: token, origin: "https://evil.example", site: "cross-site" });
  record("logout cross-origin refused", xlogout.status === 403, `status=${xlogout.status}`);
} catch (err) {
  record("smoke harness", false, `error=${err?.message ?? "unknown"}`);
} finally {
  if (child && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
    try {
      if (child.exitCode === null) process.kill(-child.pid, "SIGKILL");
    } catch {}
  }
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${r.detail})`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed; scratch=${SCRATCH}`);
process.exitCode = failed ? 1 : 0;
