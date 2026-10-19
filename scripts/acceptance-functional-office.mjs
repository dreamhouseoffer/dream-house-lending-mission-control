// OPT-IN LOCAL ACCEPTANCE (functional office repair). Not part of npm test.
// What is REAL here: the reviewed bridge source (createBridge from ~/.hermes/mission-control/bridge/server.js) reading the
// live Hermes board/attachments through the real hermes CLI, READ-ONLY (allowCreate false, no runner), and the real
// production build of this app (`next start`). What is OWNED/ISOLATED: the bridge process (this process), its fresh
// random secret, its scratch SQLite, the loopback ports, and a preview-only owner session minted in-process from a fresh
// random PIN/secret. No production credential, env file or bridge secret file is read; the shared bridge and gateway
// are never touched; nothing is created, sent or published. Prints statuses/codes only.
//   MC_FUNCTIONAL_ACCEPTANCE=1 MC_APP_BUILD_DIR=<dir with .next> MC_QA_OUT=<dir> TMPDIR=~/.hermes/cache/scratch \
//   [MC_PLAYWRIGHT_CORE=<playwright-core dir> MC_CHROMIUM_EXECUTABLE=<chromium>] node --test scripts/acceptance-functional-office.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRIDGE_DIR = path.join(os.homedir(), ".hermes", "mission-control", "bridge");
const APP = process.env.MC_APP_BUILD_DIR || ROOT;
const OUT = process.env.MC_QA_OUT;
const PW = process.env.MC_PLAYWRIGHT_CORE;
const EXE = process.env.MC_CHROMIUM_EXECUTABLE;
const skip = process.env.MC_FUNCTIONAL_ACCEPTANCE !== "1" ? "opt-in: set MC_FUNCTIONAL_ACCEPTANCE=1"
  : !existsSync(path.join(APP, ".next", "BUILD_ID")) ? "no production build"
  : !OUT ? "MC_QA_OUT required" : false;
const TASK = "t_11191492";
// The completed, verified FHA release: a generic finished task, never a Content draft.
const RELEASE = "t_d6ca0e80";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

const matrix = [];
const CORE = ["/", "/tasks", `/tasks/${TASK}`, "/agents", "/office", "/approvals", "/workflows", "/content", "/knowledge", "/settings",
  `/tasks/${TASK}/artifacts/a20`, `/tasks/${TASK}/artifacts/a20?view=plain`];
// Whole-document horizontal overflow (a scroll container such as the office floor may pan inside itself).
const overflowOf = (page) => page.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const culprits = [...document.querySelectorAll("body *")].filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.right <= cw + 1) return false;
    for (let p = e.parentElement; p; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden") return false; }
    return true;
  }).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 50)}@${Math.round(e.getBoundingClientRect().right)}`);
  return { sw: document.documentElement.scrollWidth, cw, culprits };
});
const spritePos = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-sprite]")].map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute("data-sprite"), `${Math.round(r.left)},${Math.round(r.top)}`]; })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(area, action, expected, ok, evidence, layer = "real-http") {
  matrix.push({ area, action, expected, result: ok ? "PASS" : "FAIL", evidence, layer });
  return ok;
}

test("functional office acceptance (isolated read-only bridge + preview app)", { skip, timeout: 600_000 }, async (t) => {
  mkdirSync(OUT, { recursive: true });
  const scratch = mkdtempSync(path.join(process.env.TMPDIR, "mc-accept-"));
  const require = createRequire(path.join(BRIDGE_DIR, "server.js"));
  const { createBridge } = require(path.join(BRIDGE_DIR, "server.js"));
  // Non-secret launch fields only (bin path, env names, assignees). secretFile is never opened.
  const cfg = JSON.parse(readFileSync(path.join(BRIDGE_DIR, "config.json"), "utf8"));
  const secret = randomBytes(48).toString("base64url");
  const startBridge = async () => {
    const b = createBridge({ secret, dbPath: path.join(scratch, `bridge-${Date.now()}.db`), hermesBin: cfg.hermesBin, hermesEnv: cfg.hermesEnv, assignees: cfg.assignees, allowCreate: false });
    return { b, port: await b.listen(bridgePort) };
  };
  const bridgePort = await freePort();
  let bridge = await startBridge();

  const appPort = await freePort();
  const pin = randomBytes(12).toString("base64url");
  const sessionSecret = randomBytes(48).toString("base64url");
  const log = openSync(path.join(scratch, "next.log"), "a");
  const next = spawn(process.execPath, [path.join(APP, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(appPort), "-H", "127.0.0.1"], {
    cwd: APP, stdio: ["ignore", log, log],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", TMPDIR: process.env.TMPDIR,
      MC_BRIDGE_URL: `http://127.0.0.1:${bridgePort}`, MC_BRIDGE_SECRET: secret, MISSION_CONTROL_PIN: pin, MISSION_CONTROL_SESSION_SECRET: sessionSecret },
  });
  t.after(async () => { next.kill("SIGTERM"); await bridge.b.close().catch(() => {}); });
  const base = `http://127.0.0.1:${appPort}`;
  for (let i = 0; i < 120; i++) { try { await fetch(`${base}/login`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

  const session = await import(pathToFileURL(path.join(ROOT, "src/lib/auth/session.mjs")).href);
  const minted = await session.createSessionToken(session.readSessionConfig({ pin, secret: sessionSecret }));
  const token = typeof minted === "string" ? minted : minted.token;
  const cookie = `${session.SESSION_COOKIE}=${token}`;
  const get = (p, auth = true) => fetch(`${base}${p}`, { headers: auth ? { cookie } : {}, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  const text = async (p, auth = true) => { const r = await get(p, auth); return { status: r.status, body: await r.text(), headers: r.headers }; };

  // ---- authentication boundary ----
  for (const p of [`/api/control/tasks/${TASK}/artifacts`, `/api/control/tasks/${TASK}/artifacts/a20`, "/api/control/record-links"]) {
    const r = await text(p, false);
    // The existing middleware redirects first (307 -> /login); the route's own 401 is the second layer.
    const loc = r.headers.get("location") ?? "";
    check("auth", `GET ${p} unauthenticated`, "307 to /login (middleware) or 401; no bytes", (r.status === 401 || (r.status === 307 && /\/login\?/.test(loc))) && !r.body.includes("# "), `status ${r.status}${loc ? " -> /login" : ""}`);
  }
  const anonContent = await text("/content", false);
  check("auth", "GET /content unauthenticated", "no file names rendered", !anonContent.body.includes("page-draft.md"), `status ${anonContent.status}`);

  // ---- artifact list (real t_11191492 via isolated bridge) ----
  const lr = await text(`/api/control/tasks/${TASK}/artifacts`);
  const list = lr.status === 200 ? JSON.parse(lr.body) : null;
  const byId = Object.fromEntries((list?.artifacts ?? []).map((a) => [a.id, a]));
  check("review", "list t_11191492 artifacts", "200; a20 reviewed; publication not authorized; no paths",
    Boolean(list && byId.a20?.reviewed && list.review?.publicationAuthorized === false && !/stored_path|\/Users\//.test(lr.body)),
    `status ${lr.status}; ids ${Object.keys(byId).join(",")}; reviewed ${Object.values(byId).filter((a) => a.reviewed).map((a) => a.id).join(",")}`);

  // ---- downloads ----
  for (const id of ["a20", "a18", "a21m2", "a21m3"]) {
    const r = await get(`/api/control/tasks/${TASK}/artifacts/${id}`);
    const body = Buffer.from(await r.arrayBuffer());
    const h = r.headers;
    const ok = r.status === 200 && h.get("x-artifact-sha256") === sha(body) && (!byId[id]?.sha256 || byId[id].sha256 === sha(body))
      && /^attachment;/.test(h.get("content-disposition") ?? "") && h.get("x-content-type-options") === "nosniff"
      && /sandbox/.test(h.get("content-security-policy") ?? "") && /no-store/.test(h.get("cache-control") ?? "");
    check("review", `download ${id}`, "200 attachment, digest = registration, nosniff, sandbox CSP, no-store", ok, `status ${r.status}; ${body.length} B; sha ${sha(body).slice(0, 12)}…`);
  }
  for (const [p, want] of [["a99", [404]], ["a0", [400]], ["..%2Fx", [400, 404]], ["page-draft.md", [400]], ["a21m9", [404]]]) {
    const r = await text(`/api/control/tasks/${TASK}/artifacts/${p}`);
    check("security", `download ${p}`, `${want.join("/")}, no bytes`, want.includes(r.status) && !r.body.includes("# "), `status ${r.status}`);
  }
  const badTask = await text(`/api/control/tasks/t_bad/artifacts/a20`);
  check("security", "download with invalid task id", "400", badTask.status === 400, `status ${badTask.status}`);

  // ---- record links ----
  const rl = await text("/api/control/record-links");
  const links = rl.status === 200 ? JSON.parse(rl.body) : null;
  check("status-truth", "record links", "200; only structured links; FHA record linked; no paths",
    Boolean(links && links.links.some((l) => l.recordId === "recAUzgyM97zBejVk") && !/workspace_path|\/Users\//.test(rl.body)),
    `status ${rl.status}; linked records ${links?.links.map((l) => `${l.recordId}:${l.tasks.length}`).join(",")}; scanned ${links?.scannedTasks}`);

  // ---- pages ----
  const pages = ["/", "/tasks", `/tasks/${TASK}`, `/tasks/${RELEASE}`, `/tasks/${TASK}/artifacts/a20`, `/tasks/${TASK}/artifacts/a21m2?view=plain`, "/agents", "/office", "/approvals",
    "/workflows", "/content", "/knowledge", "/settings", "/pipeline", "/ask", "/milo-approvals", "/headquarters", "/briefs", "/content/training", "/campaigns",
    "/finance", "/portfolio", "/vega", "/body-os", "/today", "/tasks/legacy", "/projects/legacy", "/team", "/calendar", "/memory", "/docs", "/tools"];
  const html = {};
  for (const p of pages) {
    const r = await text(p);
    html[p] = r.body;
    check("navigation", `GET ${p}`, "200 and no application error", r.status === 200 && !/Application error|Internal Server Error/.test(r.body), `status ${r.status}`);
  }
  const c = html["/content"];
  check("review", "/content shows the Milo package", "t_11191492, Ready for review (draft), publication unknown + review boundary, Open/Download links",
    /t_11191492/.test(c) && /Ready for review \(draft\)/.test(c) && /Publication: unknown/.test(c) && /This review did not authorize publication/.test(c) && /artifacts\/a20/.test(c), "rendered HTML");
  const pkgs = (c.match(/href="\/tasks\/t_[0-9a-f]{8}"/g) ?? []).map((m) => m.slice(13, -1));
  check("review", "/content is one declared package, no generic cards", "only t_11191492; no 'could not be read'; no 'Not published'; FHA release absent",
    pkgs.length > 0 && pkgs.every((id) => id === TASK) && !/could not be read|could not be verified/.test(c) && !/Not published/.test(c) && !c.includes(RELEASE),
    `task links ${[...new Set(pkgs)].join(",") || "none"}`);
  const rel = html[`/tasks/${RELEASE}`];
  check("status-truth", "completed FHA release task detail", "Result files + publication unknown; never Draft / Not published / not authorized",
    /Result files/.test(rel) && /Publication status unavailable/.test(rel) && !/Draft \(not reviewed\)|Ready for review|Not published|publication is not authorized/.test(rel), "rendered HTML");
  check("review", "task detail opens result files", "Result files section lists page-draft.md", /Result files/.test(html[`/tasks/${TASK}`]) && /page-draft\.md/.test(html[`/tasks/${TASK}`]), "rendered HTML");
  check("security", "markdown preview escapes HTML", "no executable <script> from the draft", !/<script>alert/i.test(html[`/tasks/${TASK}/artifacts/a20`]), "rendered HTML");
  const o = html["/office"];
  const cond = { milo: /data-desk="milo"/.test(o), noTest: !/data-desk="gpt56-test"/.test(o), humans: /presence not tracked/.test(o), noFake: !/\$340K|loans closed/i.test(o), noAtlasDesk: !/data-desk="[^"]*atlas/i.test(o) };
  const typing = [...o.matchAll(/data-desk="([^"]+)"[^]*?(typing · run open|desk empty · idle|human · not tracked|>unknown<)/g)].map((m) => `${m[1]}:${m[2]}`);
  check("office", "office roster", "Milo desk; gpt56-test not a desk; humans untracked; no fake numbers; no invented Atlas desk",
    Object.values(cond).every(Boolean), `${JSON.stringify(cond)}; desks ${typing.join(", ")}; atlas-text-from-schedules=${/atlas/i.test(o)}`);
  check("navigation", "Office in core nav and linked from Agents", "href=/office in sidebar and Agents", /href="\/office"/.test(html["/"]) && /Open the team office/.test(html["/agents"]), "rendered HTML");

  // ---- browser (optional; real Chromium against the preview) ----
  if (PW && EXE && existsSync(EXE)) {
    const { chromium } = createRequire(path.join(PW, "package.json"))(PW);
    const browser = await chromium.launch({ executablePath: EXE, headless: true });
    t.after(() => browser.close());
    for (const prof of [{ name: "desktop", context: { viewport: { width: 1280, height: 900 } } }, { name: "mobile", context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }]) {
      for (const reduced of [false, true]) {
        const ctx = await browser.newContext({ ...prof.context, reducedMotion: reduced ? "reduce" : "no-preference" });
        await ctx.addCookies([{ name: session.SESSION_COOKIE, value: token, domain: "127.0.0.1", path: "/", httpOnly: true }]);
        const page = await ctx.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e?.message ?? e)));
        const tag = `${prof.name}${reduced ? "-reduced" : ""}`;
        await page.goto(`${base}/office`, { waitUntil: "networkidle" });
        const motion = await page.locator("[data-office-motion]").getAttribute("data-office-motion");
        check("office", `${tag}: motion state`, reduced ? "paused by reduced-motion" : "running", motion === (reduced ? "paused" : "running"), `data-office-motion=${motion}`, "real-browser");
        if (!reduced) {
          await page.getByRole("button", { name: "Pause motion" }).click();
          const after = await page.locator("[data-office-motion]").getAttribute("data-office-motion");
          check("office", `${tag}: Pause motion`, "paused", after === "paused", `data-office-motion=${after}`, "real-browser");
          await page.getByRole("button", { name: "Resume motion" }).click();
        }
        await page.screenshot({ path: path.join(OUT, `office-${tag}-closed.png`), fullPage: true });
        const ofClosed = await overflowOf(page);
        check("layout", `${tag}: /office no page overflow (panel closed)`, "scrollWidth <= clientWidth", ofClosed.sw <= ofClosed.cw, `${ofClosed.sw}/${ofClosed.cw} ${ofClosed.culprits.join(" ")}`, "real-browser");
        // Typing is never drawn for an Unknown desk; every typing desk must say so in its label.
        const deskTruth = await page.evaluate(() => [...document.querySelectorAll("[data-desk]")].map((d) => ({ id: d.getAttribute("data-desk"), label: d.innerText.replace(/\s+/g, " "), typing: !!d.querySelector(".office-type-l, .office-code") })));
        check("office", `${tag}: no typing for unknown/idle desks`, "typing only with label 'typing · run open'",
          deskTruth.every((d) => (reduced ? !d.typing || /typing · run open/.test(d.label) : d.typing === /typing · run open/.test(d.label))) && deskTruth.filter((d) => /unknown/.test(d.label)).every((d) => !d.typing),
          deskTruth.map((d) => `${d.id}:${/typing/.test(d.label) ? "typing" : /unknown/.test(d.label) ? "unknown" : /idle/.test(d.label) ? "idle" : "human"}`).join(","), "real-browser");
        // Physical wandering: sprite boxes move while running, and stay put when paused / reduced motion.
        const p0 = await spritePos(page);
        if (Object.keys(p0).length > 0) {
          if (!reduced) {
            let moved = false;
            for (let i = 0; i < 10 && !moved; i++) { await sleep(1500); const p1 = await spritePos(page); moved = Object.keys(p0).some((k) => p1[k] !== p0[k]); }
            check("office", `${tag}: idle sprites physically wander`, "bounding box changes", moved, `sprites ${Object.keys(p0).join(",")}`, "real-browser");
            await page.getByRole("button", { name: "Pause motion" }).click();
            await sleep(400);
            const q0 = await spritePos(page); await sleep(7000); const q1 = await spritePos(page);
            check("office", `${tag}: paused sprites do not move`, "same bounding boxes over 7s", JSON.stringify(q0) === JSON.stringify(q1), JSON.stringify(q1), "real-browser");
            await page.getByRole("button", { name: "Resume motion" }).click();
          } else {
            await sleep(7000); const p1 = await spritePos(page);
            check("office", `${tag}: reduced motion sprites do not move`, "same bounding boxes over 7s", JSON.stringify(p0) === JSON.stringify(p1), JSON.stringify(p1), "real-browser");
          }
        } else {
          check("office", `${tag}: idle sprites`, "none to test (no idle agent)", true, "no idle agent at test time", "real-browser");
        }
        const desk = page.locator('[data-desk="milo"]');
        await desk.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        const opened = await dialog.isVisible();
        const dlgText = opened ? await dialog.innerText() : "";
        await page.screenshot({ path: path.join(OUT, `office-${tag}-open.png`), fullPage: false });
        const ofOpen = await overflowOf(page);
        check("layout", `${tag}: /office no page overflow (panel open)`, "scrollWidth <= clientWidth", ofOpen.sw <= ofOpen.cw, `${ofOpen.sw}/${ofOpen.cw} ${ofOpen.culprits.join(" ")}`, "real-browser");
        const miloStatus = opened ? await dialog.locator("[data-status]").getAttribute("data-status") : null;
        check("office", `${tag}: real readback of Milo activity`, "status reported with evidence (unknown is acceptable)", Boolean(miloStatus) && /Activity evidence/.test(dlgText), `status=${miloStatus}; ${dlgText.replace(/\s+/g, " ").match(/Status (.*?) Activity evidence/)?.[1] ?? ""}`, "real-browser");
        await page.keyboard.press("Escape");
        const closed = !(await dialog.isVisible().catch(() => false));
        const focusBack = await page.evaluate(() => document.activeElement?.getAttribute("data-desk"));
        check("office", `${tag}: keyboard desk opens panel, Escape closes, focus returns`, "panel with status/task/result; focus back on desk",
          opened && /Status/.test(dlgText) && /Latest result/.test(dlgText) && closed && focusBack === "milo", `opened=${opened} closed=${closed} focus=${focusBack}`, "real-browser");
        if (!reduced) {
          await page.goto(`${base}/content`, { waitUntil: "networkidle" });
          await page.screenshot({ path: path.join(OUT, `content-${tag}.png`), fullPage: true });
          // Default view: exactly the four canonical reviewed files (standalone a18/a20 preferred over zip copies).
          const visible = await page.evaluate(() => [...document.querySelectorAll("#review li")]
            .filter((li) => !li.closest("details:not([open])") && li.getBoundingClientRect().height > 0)
            .map((li) => li.querySelector("a[href*='/artifacts/']")?.getAttribute("href")?.split("/").pop()));
          check("review", `${tag}: /content default files`, "a18,a20,a21m2,a21m3 once each; duplicates and registry behind details",
            [...visible].sort().join(",") === "a18,a20,a21m2,a21m3", `visible ${visible.join(",")}`, "real-browser");
          await page.getByRole("link", { name: "Open page-draft.md" }).first().click();
          await page.waitForURL(/\/artifacts\/a20/);
          const prev = await page.getByText("Preview").first().isVisible();
          await page.screenshot({ path: path.join(OUT, `preview-${tag}.png`), fullPage: false });
          const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15_000 }), page.getByRole("link", { name: "Download" }).first().click()]);
          const dlPath = await dl.path();
          const dlOk = Boolean(dlPath) && sha(readFileSync(dlPath)) === byId.a20?.sha256;
          check("review", `${tag}: open preview then download a20`, "preview renders; download bytes = registered digest", prev && dlOk, `file ${dl.suggestedFilename()}`, "real-browser");
          await page.goto(`${base}/approvals`, { waitUntil: "networkidle" });
          await page.screenshot({ path: path.join(OUT, `approvals-${tag}.png`), fullPage: true });
          await page.goto(`${base}/`, { waitUntil: "networkidle" });
          await page.screenshot({ path: path.join(OUT, `home-${tag}.png`), fullPage: true });
          if (prof.name === "mobile") {
            await page.getByRole("button", { name: /menu/i }).first().click();
            const navOffice = await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Office" }).isVisible();
            check("navigation", "mobile menu has Office", "visible", navOffice, `visible=${navOffice}`, "real-browser");
          }
        }
        if (!reduced) {
          for (const r of CORE) {
            await page.goto(`${base}${r}`, { waitUntil: "networkidle" });
            const of = await overflowOf(page);
            check("layout", `${tag}: ${r} no page overflow`, "scrollWidth <= clientWidth", of.sw <= of.cw, `${of.sw}/${of.cw} ${of.culprits.join(" ")}`, "real-browser");
          }
          if (prof.name === "mobile") {
            await page.goto(`${base}/tasks`, { waitUntil: "networkidle" });
            await page.getByRole("button", { name: /menu/i }).first().click();
            const nav = page.getByRole("dialog", { name: "Navigation" });
            const of = await overflowOf(page);
            const linkBox = await nav.getByRole("link", { name: "Office" }).boundingBox();
            check("layout", "mobile: navigation drawer open", "no page overflow; Office link >= 36px tall", of.sw <= of.cw && (linkBox?.height ?? 0) >= 36, `${of.sw}/${of.cw}; office link h=${linkBox?.height}`, "real-browser");
            await nav.getByRole("link", { name: "Office" }).click();
            await page.waitForURL(/\/office$/);
            check("navigation", "mobile: drawer Office link navigates and closes", "on /office, drawer closed", !(await nav.isVisible().catch(() => false)), page.url(), "real-browser");
          }
          // ---- F3: Tasks filter + detail ----
          await page.goto(`${base}/tasks`, { waitUntil: "networkidle" });
          await page.locator('input[name="q"]').fill(TASK);
          await page.locator('input[name="q"]').press("Enter");
          await page.waitForURL(/q=t_11191492/);
          const rows = await page.locator(`a[href="/tasks/${TASK}"]`).count();
          const others = await page.locator('a[href^="/tasks/t_"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => !h.startsWith("/tasks/t_11191492")).length);
          check("tasks", `${tag}: search filter`, "only the searched task listed", rows >= 1 && others === 0, `rows=${rows} others=${others}`, "real-browser");
          const statusLinks = await page.locator('a[href*="status="]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
          const done = statusLinks.find((h) => /status=completed/.test(h)) ?? statusLinks[0];
          if (done) {
            await page.goto(`${base}${done.startsWith("/") ? done : `/tasks${done}`}`, { waitUntil: "networkidle" });
            const ok = /status=/.test(page.url()) && !(await page.getByText("Application error").count());
            check("tasks", `${tag}: status filter link`, "filtered page renders", ok, `${done} -> ${page.url().replace(base, "")}`, "real-browser");
          }
          await page.goto(`${base}/tasks?q=${TASK}`, { waitUntil: "networkidle" });
          await page.locator(`a[href="/tasks/${TASK}"]`).first().click();
          await page.waitForURL(new RegExp(`/tasks/${TASK}$`));
          const full = page.locator("summary", { hasText: "Show full instructions" });
          let expanded = null;
          if (await full.count()) { await full.first().click(); expanded = await full.first().evaluate((s) => s.parentElement.open); }
          const resultLink = await page.locator(`a[href^="/tasks/${TASK}/artifacts/"]`).count();
          check("tasks", `${tag}: task detail`, "Result files links; full instructions expand on click", resultLink > 0 && expanded !== false, `result links=${resultLink}; instructions expanded=${expanded}`, "real-browser");
          // ---- F3: Approvals (feed not configured in this preview: must say so, never an empty queue) ----
          await page.goto(`${base}/approvals`, { waitUntil: "networkidle" });
          const ap = await page.locator("main").innerText();
          check("approvals", `${tag}: Milo feed state`, "feed unavailable stated with unknown count (no live Airtable here), or real cards",
            /Milo approval feed unavailable/.test(ap) ? /not an empty queue/.test(ap) : /Read from Airtable/.test(ap), (ap.match(/Milo approval feed unavailable[^\n]*|Read from Airtable[^\n]*/) ?? ["?"])[0], "real-browser");
          const apDetails = page.locator("main summary");
          if (await apDetails.count()) { await apDetails.first().click(); }
          check("approvals", `${tag}: execution inbox controls`, "no enabled approve/execute button without server support",
            (await page.locator('main button:not([disabled])', { hasText: /^(Approve|Execute|Publish|Run)/ }).count()) === 0, `details toggles=${await apDetails.count()}`, "real-browser");
          // ---- F3: Knowledge / Settings / Workflows ----
          await page.goto(`${base}/knowledge`, { waitUntil: "networkidle" });
          const kn = await page.locator("main").innerText();
          check("knowledge", `${tag}: browser-only state labelled`, "memory search unavailable; browser-local; never 'shared'", /Memory search unavailable/.test(kn) && /Browser-local/i.test(kn) && !/shared|permanent/i.test(kn), "rendered", "real-browser");
          await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
          const st = await page.locator("main").innerText();
          check("settings", `${tag}: connection provenance`, "bridge observed time shown; no fake usage/cost", /observed|Observed/.test(st) && !/\$\d/.test(st), (st.match(/[^\n]*bridge[^\n]*/i) ?? [""])[0].slice(0, 120), "real-browser");
          await page.goto(`${base}/workflows`, { waitUntil: "networkidle" });
          const wf = await page.locator("main").innerText();
          check("workflows", `${tag}: live schedules with status`, "live scheduler rows (not the snapshot fallback)", !/Committed snapshot \(fallback\)/.test(wf) && /schedul/i.test(wf), (wf.match(/[^\n]*(Live|live)[^\n]*/) ?? [""])[0].slice(0, 120), "real-browser");
        }
        check("errors", `${tag}: no page errors`, "0", errs.length === 0, errs.slice(0, 3).join(" | ") || "none", "real-browser");
        await ctx.close();
      }
    }
  } else {
    matrix.push({ area: "browser", action: "real-browser checks", expected: "run", result: "SKIPPED", evidence: "MC_PLAYWRIGHT_CORE/MC_CHROMIUM_EXECUTABLE not set", layer: "real-browser" });
  }

  // ---- offline: stop the owned bridge; nothing cached or simulated is shown ----
  await bridge.b.close();
  const offContent = await text("/content");
  const offDl = await text(`/api/control/tasks/${TASK}/artifacts/a20`);
  const offOffice = await text("/office");
  check("offline", "bridge stopped: /content", "offline notice, no files", /offline/i.test(offContent.body) && !/page-draft\.md/.test(offContent.body), `status ${offContent.status}`);
  check("offline", "bridge stopped: download", "503, no bytes", offDl.status === 503, `status ${offDl.status}`);
  check("offline", "bridge stopped: /office", "no typing, no desks invented", !/typing · run open/.test(offOffice.body) && !/data-desk="milo"/.test(offOffice.body), `status ${offOffice.status}`);
  bridge = await startBridge();
  const back = await text("/content");
  check("offline", "bridge restarted: refresh recovers", "files listed again", /page-draft\.md/.test(back.body), `status ${back.status}`);

  writeFileSync(path.join(OUT, "acceptance-matrix.json"), JSON.stringify({ observed_at: new Date().toISOString(), task: TASK, matrix }, null, 2));
  const failed = matrix.filter((m) => m.result === "FAIL");
  for (const m of matrix) console.log(`${m.result}\t${m.layer}\t${m.area}\t${m.action}\t${m.evidence}`);
  assert.equal(failed.length, 0, `failed: ${failed.map((f) => f.action).join("; ")}`);
});
