"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Dumbbell, ExternalLink, Pause, Pencil, Play, RefreshCw, RotateCcw, Timer, Watch } from "lucide-react";
import {
  SET_ERROR_COPY,
  classifyEditResponse,
  classifySaveResponse,
  draftToSet,
  editOperation,
  editSettle,
  whoopGauges,
  scheduledFor,
  formatClock,
  timerInit,
  timerPause,
  timerRemaining,
  timerReset,
  timerStart,
} from "@/lib/mission-control/fitness-model.mjs";
import { CALLBACK_RESULTS, isCallbackResult } from "@/lib/mission-control/whoop-oauth-model.mjs";

// Generic renderer only: the program, logbook and WHOOP data come from protected /api/fitness routes (private bridge files).
type Exercise = { id: string; name: string; sets: number; rep_min: number; rep_max: number; rest_seconds: number; rir: string; condition: string | null; cues: string[] };
type Session = {
  id: string; label: string; focus: string; effort: string;
  warmup: { minutes_min: number; minutes_max: number; steps: string[] };
  ramp_sets: { exercise_id: string; reps: number; rest_seconds: number; load: string }[];
  exercises: Exercise[];
  cardio: { optional: boolean; condition: string; prescription: string };
  cooldown: { steps: string[] };
};
type Program = {
  title: string; status: string; authority: string; whoop_boundary: string;
  safety_gate: { rules: string[]; stop_signs: string[] };
  sessions: Session[];
  weekly_schedule: { day: string; session_id: string | null; note: string }[];
  schedule_notes: string[]; progression: string[]; recovery: string[]; baseline_unknown: string[];
};
type LoggedSet = { key: string; session_id: string; exercise_id: string; date: string; kind: "warmup" | "working"; set_number: number; weight: number; unit: string; reps: number; rir: number | null; notes: string; saved_at: string;
  revision?: string; edited_at?: string | null };
type Whoop =
  | { state: "not_connected" }
  | { state: "error"; code: string }
  | { state: "connected"; observedAt: string; freshness: string; cached: boolean;
      cycle: { start: string; end: string | null; updated_at: string | null; score_state: string | null; strain: number | null } | null;
      recovery: { updated_at: string | null; score_state: string | null; user_calibrating: boolean; recovery_score: number | null; resting_heart_rate: number | null; hrv_rmssd_milli: number | null } | null;
      sleep: { start: string | null; end: string | null; updated_at: string | null; score_state: string | null; sleep_performance_percentage: number | null; asleep_milli: number | null } | null };

const localDate = () => new Date().toLocaleDateString("en-CA");
const newKey = () => `set_${crypto.randomUUID().replace(/-/g, "")}`;
const newEditKey = () => `edit_${crypto.randomUUID().replace(/-/g, "")}`;
const when = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "unknown");
const restLabel = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min` : `${s} s`);
const failCopy = (state: string) =>
  state === "not_configured" || state === "offline" ? "The private bridge is not reachable from this server." : state === "unauthenticated" ? "Sign in again." : "Could not read this right now.";

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function Card({ title, icon, children, tone }: { title: string; icon?: React.ReactNode; children: React.ReactNode; tone?: "warn" }) {
  return (
    <section className={`min-w-0 rounded-xl border p-4 ${tone === "warn" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"}`}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2>
      <div className="min-w-0 break-words text-sm">{children}</div>
    </section>
  );
}

function RestTimer({ seconds }: { seconds: number }) {
  const [t, setT] = useState(() => timerInit(seconds));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setT(timerInit(seconds)), [seconds]);
  useEffect(() => {
    if (t.startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [t.startedAt]);
  const left = timerRemaining(t, now);
  const running = t.startedAt !== null && left > 0;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="rest-timer">
      <Timer className="h-4 w-4" />
      <span className="font-mono text-lg tabular-nums" data-testid="timer-clock">{formatClock(left)}</span>
      <span className="text-xs text-muted-foreground">{left === 0 ? "rest done" : running ? "resting" : t.remainingMs === t.durationMs ? "ready" : "paused"}</span>
      <button className="rounded border px-2 py-1 text-xs" onClick={() => { const n = Date.now(); setNow(n); setT((x) => timerStart(x, n)); }} disabled={running || left === 0} aria-label="Start rest timer"><Play className="h-3 w-3" /></button>
      <button className="rounded border px-2 py-1 text-xs" onClick={() => { const n = Date.now(); setNow(n); setT((x) => timerPause(x, n)); }} disabled={!running} aria-label="Pause rest timer"><Pause className="h-3 w-3" /></button>
      <button className="rounded border px-2 py-1 text-xs" onClick={() => setT((x) => timerReset(x))} aria-label="Reset rest timer"><RotateCcw className="h-3 w-3" /></button>
    </div>
  );
}

type Draft = { kind: "warmup" | "working"; setNumber: string; weight: string; unit: "lb" | "kg"; reps: string; rir: string; notes: string };

type LogState = "loading" | "ready" | "error";
// The selected date plus an epoch bumped on every date change; async callbacks compare against it before touching state.
type LiveDate = { date: string; epoch: number };

function SetLogger({ session, exercise, date, logState, logged, live, onSaved }: {
  session: Session; exercise: Exercise; date: string; logState: LogState; logged: LoggedSet[]; live: React.MutableRefObject<LiveDate>; onSaved: (date: string) => void;
}) {
  const ready = logState === "ready";
  const working = logged.filter((s) => s.kind === "working");
  // No set number is suggested until this date's logbook has been read: loading/unavailable must not imply a count.
  const nextNum = (kind: "warmup" | "working") => (ready ? String(Math.min(20, logged.filter((s) => s.kind === kind).reduce((m, s) => Math.max(m, s.set_number), 0) + 1)) : "");
  const [d, setD] = useState<Draft>({ kind: "working", setNumber: "", weight: "", unit: "lb", reps: "", rir: "3", notes: "" });
  const [key, setKey] = useState(newKey);
  const [fingerprint, setFingerprint] = useState("");
  // Messages and the busy flag belong to the date they were produced for and are hidden on any other date.
  const [msg, setMsgFor] = useState<{ date: string; tone: "ok" | "err"; text: string } | null>(null);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const busy = busyDate === date;
  const setMsg = (m: { tone: "ok" | "err"; text: string } | null) => setMsgFor(m && { date, ...m });
  useEffect(() => setD((x) => ({ ...x, setNumber: nextNum(x.kind) })), [logged.length, date, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setMsg(null); setD({ ...d, [k]: e.target.value } as Draft); };

  async function save() {
    const parsed = draftToSet({ sessionId: session.id, exerciseId: exercise.id, date, ...d });
    if ("error" in parsed) { setMsg({ tone: "err", text: SET_ERROR_COPY[parsed.error as keyof typeof SET_ERROR_COPY] ?? "Check the values." }); return; }
    // Same values reuse the same key (a retry dedupes); changed values always get a fresh key.
    const fp = JSON.stringify(parsed.set);
    const useKey = fp === fingerprint ? key : newKey();
    const saveDate = date;
    const epoch = live.current.epoch;
    // After a date change the answer only refreshes the logbook if that date is shown again; the draft and messages are left alone.
    const current = () => live.current.epoch === epoch;
    const report = (m: { tone: "ok" | "err"; text: string }) => { if (current()) setMsgFor({ date: saveDate, ...m }); };
    setKey(useKey); setFingerprint(fp); setBusyDate(saveDate);
    try {
      const res = await fetch("/api/fitness/logs", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", "idempotency-key": useKey }, body: fp });
      const r = classifySaveResponse(res.status, await res.json().catch(() => null));
      if (r.kind === "saved") {
        report({ tone: "ok", text: r.deduplicated ? "Already saved (same set) — not duplicated." : `Saved ${r.set.kind === "warmup" ? "warm-up" : "working"} set ${r.set.set_number}.` });
        if (current()) { setFingerprint(""); setD((x) => ({ ...x, reps: "", notes: "" })); }
        onSaved(saveDate);
      } else if (r.kind === "refused") {
        report({ tone: "err", text: `Not saved. ${SET_ERROR_COPY[r.code as keyof typeof SET_ERROR_COPY] ?? (r.code === "unauthenticated" ? "Sign in again." : "Check the values.")}` });
      } else {
        // Values and key are kept: the set may have reached the logbook, and the same key cannot apply twice.
        report({ tone: "err", text: "Not confirmed: the logbook did not confirm this set. Press Save again with the same values — it will not duplicate." });
      }
    } catch {
      report({ tone: "err", text: "Not confirmed: no answer from the logbook. Press Save again with the same values — it will not duplicate." });
    } finally { setBusyDate((b) => (b === saveDate ? null : b)); }
  }
  const progress = ready ? `${working.length} of ${exercise.sets} prescribed` : logState === "loading" ? "loading…" : "unknown (logbook unavailable)";

  const input = "w-full min-w-0 rounded border bg-background px-2 py-1 text-sm";
  return (
    <div className="mt-3 rounded-lg border border-dashed p-3" data-testid={`logger-${exercise.id}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">Log a set <span className="text-muted-foreground">(draft — not saved until you press Save)</span></span>
        <span data-testid={`progress-${exercise.id}`}>Working sets logged {date}: {progress}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <label className="text-xs">Type<select className={input} value={d.kind} onChange={(e) => { const kind = e.target.value as Draft["kind"]; setMsg(null); setD({ ...d, kind, setNumber: nextNum(kind), rir: kind === "warmup" ? "" : d.rir || "3" }); }}><option value="working">Working</option><option value="warmup">Warm-up</option></select></label>
        <label className="text-xs">Set #<input className={input} inputMode="numeric" value={d.setNumber} onChange={field("setNumber")} /></label>
        <label className="text-xs">Weight<input className={input} inputMode="decimal" value={d.weight} onChange={field("weight")} placeholder="0" /></label>
        <label className="text-xs">Unit<select className={input} value={d.unit} onChange={field("unit")}><option value="lb">lb</option><option value="kg">kg</option></select></label>
        <label className="text-xs">Reps<input className={input} inputMode="numeric" value={d.reps} onChange={field("reps")} /></label>
        <label className="text-xs">RIR<input className={input} inputMode="numeric" value={d.rir} onChange={field("rir")} placeholder={d.kind === "warmup" ? "optional" : ""} /></label>
        <label className="col-span-2 text-xs sm:col-span-4 lg:col-span-1">Notes<input className={input} maxLength={280} value={d.notes} onChange={field("notes")} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50" onClick={save} disabled={busy || logState === "loading"} data-testid={`save-${exercise.id}`}>{busy ? "Saving…" : "Save set"}</button>
        {msg && msg.date === date && <span role="status" className={`text-xs ${msg.tone === "ok" ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

type OAuthStatus = { configured: boolean; token: "none" | "stored" | "blocked" | "invalid"; last_attempt: { status: string; at: string } | null; redirect_uri: string; scopes: string };

const ATTEMPT_LABEL: Record<string, string> = {
  pending: "waiting for WHOOP", exchanging: "in progress", authorized: "authorized (tokens stored)", denied: "declined", expired: "expired",
  superseded: "replaced by a newer attempt", provider_error: "WHOOP reported an error", authorization_failed: "WHOOP refused",
  needs_reauthorization: "outcome unknown, not retried — connect again", needs_setup: "app not configured",
};

// Owner setup: (1) first-time Client ID + Secret -> private bridge file on the Mac; (2) Connect -> WHOOP's consent page.
// Configured is NOT connected: only a successful read in the panel above means WHOOP data is connected.
function WhoopSetup() {
  const [status, setStatus] = useState<OAuthStatus | null | "error">(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    getJson("/api/fitness/whoop/oauth").then(({ data }) => setStatus(data?.ok ? data : "error"), () => setStatus("error"));
  }, []);
  useEffect(() => {
    load();
    // One allowlisted result code from the callback redirect; then drop it from the address bar.
    const r = new URLSearchParams(window.location.search).get("whoop");
    if (r !== null) {
      setResult(isCallbackResult(r) ? r : null);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [load]);

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/fitness/whoop/client", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: clientId.trim(), client_secret: clientSecret }),
        signal: AbortSignal.timeout(20_000) });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok === true) {
        setClientSecret("");
        setMsg(data.outcome === "unchanged" ? "These WHOOP app values were already saved. Nothing changed." : "Saved privately on the Mac. Next: Connect WHOOP.");
        load();
      } else if (res.status === 409) {
        setMsg("Not saved. A different WHOOP app (or connected account) is already configured; it was not replaced.");
      } else if (res.status === 400) {
        setMsg("Not saved. Check the Client ID and Client Secret exactly as shown in the WHOOP Developer Dashboard.");
      } else {
        setMsg("Not confirmed: the private bridge did not confirm the save. Try again.");
      }
    } catch {
      setMsg("Not confirmed: the private bridge did not confirm the save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/fitness/whoop/connect", { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok === true && typeof data.authorization_url === "string") {
        window.location.assign(data.authorization_url);
        return;
      }
      setMsg(data?.code === "needs_setup" ? CALLBACK_RESULTS.needs_setup : "Could not start the WHOOP authorization. Nothing changed — try again.");
    } catch {
      setMsg("Could not start the WHOOP authorization. Nothing changed — try again.");
    }
    setBusy(false);
  }

  const s = status && status !== "error" ? status : null;
  const attempt = s?.last_attempt?.status;
  return (
    <div className="mt-3 space-y-2 border-t pt-3" data-testid="whoop-setup">
      {result && <p className="text-xs" role="status" data-testid="whoop-result">{CALLBACK_RESULTS[result as keyof typeof CALLBACK_RESULTS]}</p>}
      {status === null && <p className="text-xs text-muted-foreground">Checking WHOOP setup…</p>}
      {status === "error" && <p className="text-xs text-muted-foreground" data-testid="whoop-setup-error">WHOOP setup status is unavailable right now.</p>}
      {s && (
        <p className="text-xs" data-testid="whoop-setup-status">
          App: <b>{s.configured ? "configured" : "not configured"}</b> · Authorization: <b>{s.token === "stored" ? "tokens stored privately" : s.token === "blocked" ? "needs reauthorization" : s.token === "invalid" ? "token file unreadable" : "none"}</b>
          {attempt ? <> · Last attempt: <b data-testid="whoop-last-attempt">{ATTEMPT_LABEL[attempt] ?? "unknown"}</b></> : null}
          {" "}· Configured is not connected; data shows above only after a successful read.
        </p>
      )}
      {s && !s.configured && (
        <form className="space-y-2" onSubmit={saveClient} data-testid="whoop-client-form" autoComplete="off">
          <p className="text-xs text-muted-foreground">First create a private app in the WHOOP Developer Dashboard with redirect <span className="break-all font-mono">{s.redirect_uri}</span> and scopes {s.scopes}. Then enter its two values here once; they are stored only in an owner-only file on the Mac.</p>
          <label className="block text-xs">Client ID
            <input className="mt-1 w-full min-w-0 rounded border bg-background px-2 py-1 font-mono text-xs" value={clientId} onChange={(e) => setClientId(e.target.value)}
              autoComplete="off" spellCheck={false} maxLength={200} required data-testid="whoop-client-id" /></label>
          <label className="block text-xs">Client Secret
            <input className="mt-1 w-full min-w-0 rounded border bg-background px-2 py-1 font-mono text-xs" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="new-password" spellCheck={false} maxLength={512} required data-testid="whoop-client-secret" /></label>
          <button type="submit" className="rounded border px-3 py-1 text-xs" disabled={busy}>Save WHOOP app</button>
        </form>
      )}
      {s?.configured && (
        <button type="button" className="rounded border px-3 py-1 text-xs" onClick={connect} disabled={busy} data-testid="whoop-connect">
          {s.token === "stored" ? "Reconnect WHOOP" : "Connect WHOOP"}
        </button>
      )}
      {msg && <p className="text-xs" role="status" data-testid="whoop-setup-msg">{msg}</p>}
    </div>
  );
}

// WHOOP-inspired read-only view (own styling, no WHOOP assets). Gauges come only from actual API fields via whoopGauges():
// sleep = sleep_performance_percentage, recovery = recovery_score in official bands, strain = native 0-21 day strain.
type Gauge = { status: string; fraction: number | null; display: string | null; tone: string | null };
const TONE: Record<string, string> = { purple: "#8b7cf6", red: "#ff3b4e", yellow: "#f5d000", green: "#22d36b", blue: "#2f9bff" };
const STATUS_LABEL: Record<string, string> = { scored: "", stale: "stale", pending: "pending", unscorable: "unscored", calibrating: "calibrating", missing: "no data", unknown: "unknown" };

function GaugeRing({ name, label, g, children }: { name: string; label: string; g: Gauge; children?: React.ReactNode }) {
  const r = 42, c = 2 * Math.PI * r;
  const stroke = g.tone ? TONE[g.tone] : "#6b7280";
  return (
    <div className="flex min-w-0 flex-col items-center text-center" data-testid={`gauge-${name}`} data-status={g.status} data-tone={g.tone ?? "none"}>
      <div className="relative aspect-square w-full max-w-[120px]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#2c2f34" strokeWidth="8" />
          {g.fraction !== null && <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${c * g.fraction} ${c}`} data-testid={`gauge-arc-${name}`} />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-white sm:text-2xl" data-testid={`gauge-value-${name}`}>{g.display ?? "—"}</span>
          {STATUS_LABEL[g.status] && <span className="text-[10px] uppercase tracking-wider text-zinc-400">{STATUS_LABEL[g.status]}</span>}
        </div>
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{label}</div>
      <div className="min-w-0 text-[11px] leading-tight text-zinc-400">{children}</div>
    </div>
  );
}

const hm = (ms: number) => `${Math.floor(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;

function WhoopPanel({ whoop, retained, boundary, refreshing, refreshNote, onRefresh }: {
  whoop: Whoop | null; retained: boolean; boundary: string; refreshing: boolean; refreshNote: string | null; onRefresh: () => void;
}) {
  // retained = the earlier read kept after a failed refresh: shown as stale (no colour), with its own timestamps unchanged.
  const g = whoop?.state === "connected" ? whoopGauges(whoop, { retained }) : null;
  const v = (n: number | null | undefined, unit: string) => (n === null || n === undefined ? "unknown" : `${Math.round(n)}${unit}`);
  const label = "text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400";
  const setup = (
    <>
      <WhoopSetup />
      {whoop?.state !== "connected" && (
        <a className="mt-2 inline-flex items-center gap-1 text-xs underline" href="https://developer.whoop.com/docs/developing/oauth" target="_blank" rel="noopener noreferrer">WHOOP OAuth docs <ExternalLink className="h-3 w-3" /></a>
      )}
      <p className="mt-3 text-xs text-zinc-400">{boundary}</p>
    </>
  );
  return (
    <section className="min-w-0 rounded-xl border border-zinc-800 bg-[#16181b] p-4 text-zinc-100" data-testid="whoop-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`flex items-center gap-2 ${label}`}><Watch className="h-4 w-4" />WHOOP · read-only</h2>
        <button type="button" onClick={onRefresh} disabled={refreshing || whoop === null} data-testid="whoop-refresh"
          className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {!whoop && <p className="text-sm text-zinc-400">Checking connection…</p>}
      {refreshNote && <p className="mb-2 text-xs text-amber-300" role="status" data-testid="whoop-refresh-note">{refreshNote}</p>}
      {whoop?.state === "not_connected" && (
        <p className="text-sm" data-testid="whoop-not-connected"><Badge variant="outline">Not connected</Badge> No WHOOP data is shown and nothing is requested from WHOOP until the owner completes setup.</p>
      )}
      {whoop?.state === "error" && <p className="text-sm" data-testid="whoop-error"><Badge variant="outline">Unavailable</Badge> WHOOP data could not be read ({whoop.code.replace(/_/g, " ")}). Values are unknown — not zero, not green.</p>}
      {whoop?.state === "connected" && g && (
        <div className="space-y-3" data-testid="whoop-connected" data-retained={retained ? "true" : "false"}>
          <div className="grid grid-cols-3 gap-2">
            <GaugeRing name="sleep" label="Sleep" g={g.sleep}>
              {whoop.sleep?.score_state === "SCORED" && whoop.sleep.asleep_milli != null ? <>Asleep {hm(whoop.sleep.asleep_milli)}</> : null}
            </GaugeRing>
            <GaugeRing name="recovery" label="Recovery" g={g.recovery}>
              {whoop.recovery?.score_state === "SCORED" ? <>HRV {v(whoop.recovery.hrv_rmssd_milli, " ms")}<br />RHR {v(whoop.recovery.resting_heart_rate, " bpm")}</> : null}
            </GaugeRing>
            <GaugeRing name="strain" label="Strain" g={g.strain}>Day strain, 0–21</GaugeRing>
          </div>
          <dl className="space-y-0.5 text-[11px] text-zinc-400" data-testid="whoop-times">
            <div><dt className="inline">WHOOP data: </dt><dd className="inline">
              {whoop.cycle ? `cycle from ${when(whoop.cycle.start)}${whoop.cycle.end ? ` to ${when(whoop.cycle.end)}` : " (ongoing)"}` : "no cycle"}
              {whoop.sleep ? ` · sleep ${when(whoop.sleep.start)} → ${when(whoop.sleep.end)}` : " · no sleep for this cycle"}
              {whoop.recovery ? ` · recovery updated ${when(whoop.recovery.updated_at)}` : " · no recovery for this cycle"}</dd></div>
            <div data-testid="whoop-fetched"><dt className="inline">Fetched: </dt><dd className="inline">{when(whoop.observedAt)}{whoop.cached ? " (bridge copy, refreshed at most every 5 min)" : ""} · {
              whoop.freshness === "current" ? "current cycle" : whoop.freshness === "no_data" ? "no data yet" : "stale (older cycle or sleep)"}</dd></div>
          </dl>
        </div>
      )}
      {whoop?.state === "connected" ? (
        <details className="mt-3 border-t border-zinc-800 pt-2 text-xs" data-testid="whoop-details">
          <summary className="cursor-pointer text-zinc-400">Connection details</summary>
          {setup}
        </details>
      ) : setup}
    </section>
  );
}

type EditDraft = { weight: string; unit: "lb" | "kg"; reps: string; rir: string; notes: string };
// pending = the exact operation (op key + serialized body) sent and not yet confirmed or refused; while set, the draft is locked.
type Editor = { id: string; date: string; row: LoggedSet; draft: EditDraft; pending: { opKey: string; body: string } | null; busy: boolean; msg: string | null };
const editorLocked = (ed: Editor | null) => !!ed && (ed.busy || ed.pending !== null);

// Inline correction of one saved row: values only. Date, session, exercise, type and set number are shown, never editable.
function SetEditor({ ed, onChange, onSubmit, onCancel }: { ed: Editor; onChange: (d: EditDraft) => void; onSubmit: () => void; onCancel: () => void }) {
  const input = "w-full min-w-0 rounded border bg-background px-2 py-1 text-sm disabled:opacity-60";
  const locked = editorLocked(ed);
  const f = (k: keyof EditDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...ed.draft, [k]: e.target.value } as EditDraft);
  return (
    <div className="mt-2 space-y-2 border-t pt-2" data-testid="set-editor">
      <p className="text-muted-foreground">Editing {ed.row.kind === "warmup" ? "warm-up" : "working"} set {ed.row.set_number} on {ed.row.date} — the same entry is updated, nothing is added.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>Weight<input className={input} inputMode="decimal" value={ed.draft.weight} onChange={f("weight")} disabled={locked} data-testid="edit-weight" /></label>
        <label>Unit<select className={input} value={ed.draft.unit} onChange={f("unit")} disabled={locked} data-testid="edit-unit"><option value="lb">lb</option><option value="kg">kg</option></select></label>
        <label>Reps<input className={input} inputMode="numeric" value={ed.draft.reps} onChange={f("reps")} disabled={locked} data-testid="edit-reps" /></label>
        <label>RIR<input className={input} inputMode="numeric" value={ed.draft.rir} onChange={f("rir")} placeholder={ed.row.kind === "warmup" ? "optional" : ""} disabled={locked} data-testid="edit-rir" /></label>
        <label className="col-span-2 sm:col-span-4">Notes<input className={input} maxLength={280} value={ed.draft.notes} onChange={f("notes")} disabled={locked} data-testid="edit-notes" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50" onClick={onSubmit} disabled={ed.busy} data-testid="edit-update">{ed.busy ? "Updating…" : ed.pending ? "Retry update" : "Update"}</button>
        <button type="button" className="rounded border px-3 py-1 text-sm disabled:opacity-50" onClick={onCancel} disabled={locked} data-testid="edit-cancel">Cancel</button>
        {ed.msg && <span role="status" className="text-red-500" data-testid="edit-msg">{ed.msg}</span>}
      </div>
    </div>
  );
}

export default function BodyOSPage() {
  const [plan, setPlan] = useState<{ state: "loading" | "ready" | "missing" | "error"; program?: Program; note?: string }>({ state: "loading" });
  // null = follow the selected date's weekly template; a tab click is an explicit manual choice that is kept across dates.
  const [manualSession, setManualSession] = useState<string | null>(null);
  const [date, setDate] = useState(localDate);
  // Logbook state is tagged with the date it was read for; it is only ever shown for that same date.
  const [logs, setLogs] = useState<{ date: string; state: LogState; sets: LoggedSet[]; total: number; note?: string }>(() => ({ date, state: "loading", sets: [], total: 0 }));
  const live = useRef<LiveDate>({ date, epoch: 0 });
  const loadGen = useRef(0);
  const [whoop, setWhoop] = useState<Whoop | null>(null);
  const [whoopBusy, setWhoopBusy] = useState(false);
  const [whoopNote, setWhoopNote] = useState<string | null>(null);
  const [whoopRetained, setWhoopRetained] = useState(false);
  const [restFor, setRestFor] = useState<number>(120);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [logMsg, setLogMsg] = useState<{ date: string; tone: "ok" | "err"; text: string } | null>(null);

  // One read path for the first load and the manual Refresh. A failed refresh keeps the earlier read (with its own provider and
  // fetched times) but shows it as stale, never as normal; a WHOOP-side error replaces it with "unavailable". No timestamp is made up.
  const loadWhoop = useCallback((manual: boolean) => {
    const failed = (code: string) => {
      if (manual) { setWhoopRetained(true); setWhoopNote("Refresh failed — nothing newer was read. The earlier read is shown as stale, with its original fetch time."); }
      else { setWhoopRetained(false); setWhoop({ state: "error", code }); }
    };
    setWhoopBusy(true); setWhoopNote(null);
    getJson("/api/fitness/whoop").then(({ data }) => {
      if (data?.ok) { setWhoopRetained(false); setWhoop(data); }
      else failed(data?.state ?? "whoop_unavailable");
    }, () => failed("offline")).finally(() => setWhoopBusy(false));
  }, []);

  useEffect(() => {
    getJson("/api/fitness/plan").then(({ data }) => {
      if (data?.ok && data.state === "ready") setPlan({ state: "ready", program: data.program });
      else if (data?.ok && data.state === "missing") setPlan({ state: "missing" });
      else setPlan({ state: "error", note: failCopy(data?.state) });
    }, () => setPlan({ state: "error", note: failCopy("offline") }));
    loadWhoop(false);
  }, [loadWhoop]);

  // Only the newest request for the still-selected date may write: older or other-date answers are dropped.
  // A same-date reload (after a save) keeps the shown sets until it answers; a new date starts empty and loading.
  const loadLogs = useCallback((forDate: string) => {
    const gen = ++loadGen.current;
    const current = () => gen === loadGen.current && live.current.date === forDate;
    setLogs((x) => (x.date === forDate ? x : { date: forDate, state: "loading", sets: [], total: 0 }));
    getJson(`/api/fitness/logs?date=${encodeURIComponent(forDate)}`).then(({ data }) => {
      if (!current()) return;
      if (data?.ok && Array.isArray(data.sets)) setLogs({ date: forDate, state: "ready", sets: data.sets.filter((s: LoggedSet) => s?.date === forDate), total: data.total });
      else setLogs({ date: forDate, state: "error", sets: [], total: 0, note: failCopy(data?.state) });
    }, () => { if (current()) setLogs({ date: forDate, state: "error", sets: [], total: 0, note: failCopy("offline") }); });
  }, []);
  useEffect(() => { loadLogs(date); }, [date, loadLogs]);
  // A save that answers after the date changed must not start a reload that would supersede the newer date's read.
  const onSaved = useCallback((savedDate: string) => { if (live.current.date === savedDate) loadLogs(savedDate); }, [loadLogs]);
  const changeDate = (next: string) => {
    if (!next || next === live.current.date) return;
    live.current = { date: next, epoch: live.current.epoch + 1 };
    setDate(next);
  };
  const day = logs.date === date ? logs : { date, state: "loading" as const, sets: [] as LoggedSet[], total: 0, note: undefined };
  const daySets = day.sets.filter((s) => s.date === date);

  // Edit of one saved row. The editor is tagged with its date and only ever shown on that date; its answer never touches
  // another date's view. Once sent, the editor owns that exact op (key + body) until it is confirmed, stale or explicitly refused:
  // the draft is locked, Cancel and other Edits are blocked, and Retry update resends the same op (it cannot apply twice).
  const patchEditor = (id: string, p: Partial<Editor>) => setEditor((e) => (e && e.id === id ? { ...e, ...p } : e));
  const locked = editorLocked(editor);
  const startEdit = (row: LoggedSet) => {
    if (locked || !row.revision) return;
    setLogMsg(null);
    setEditor({ id: crypto.randomUUID(), date, row, pending: null, busy: false, msg: null,
      draft: { weight: String(row.weight), unit: row.unit === "kg" ? "kg" : "lb", reps: String(row.reps), rir: row.rir === null ? "" : String(row.rir), notes: row.notes } });
  };
  async function submitEdit(ed: Editor) {
    if (ed.busy) return;
    const o = editOperation(ed.pending, ed.row, ed.draft, newEditKey);
    if (!o.op) { patchEditor(ed.id, { msg: SET_ERROR_COPY[o.error as keyof typeof SET_ERROR_COPY] ?? "Check the values." }); return; }
    const op = o.op;
    patchEditor(ed.id, { pending: op, busy: true, msg: null });
    const hold = (text: string) => patchEditor(ed.id, { busy: false, msg: `Not confirmed: ${text} Values are locked — press Retry update to resend the same update; it will not apply twice.` });
    const done = (text: string, tone: "ok" | "err") => { setEditor((e) => (e && e.id === ed.id ? null : e)); setLogMsg({ date: ed.date, tone, text }); onSaved(ed.date); };
    const what = `${ed.row.kind === "warmup" ? "warm-up" : "working"} set ${ed.row.set_number}`;
    try {
      const res = await fetch("/api/fitness/logs/edit", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", "idempotency-key": op.opKey }, body: op.body });
      const r = classifyEditResponse(res.status, await res.json().catch(() => null));
      const next = editSettle(r.kind);
      if (r.kind === "updated") done(r.deduplicated ? `Already updated ${what} — not applied twice.` : `Updated ${what}.`, "ok");
      else if (r.kind === "unchanged") done(`No changes to ${what}; nothing was written.`, "ok");
      else if (r.kind === "stale") done(`Not updated: ${what} was changed elsewhere since you opened it. Nothing was overwritten; the latest values are shown — press Edit to change them again.`, "err");
      // An explicit refusal means nothing was applied: the lock clears so the values can be corrected (new op) or cancelled.
      else if (r.kind === "refused" && next === "unlock") patchEditor(ed.id, { busy: false, pending: null, msg: `Not updated. ${SET_ERROR_COPY[r.code as keyof typeof SET_ERROR_COPY] ?? (r.code === "unauthenticated" ? "Sign in again." : "Check the values.")}` });
      else hold("the logbook did not confirm this update.");
    } catch {
      hold("no answer from the logbook.");
    }
  }

  const program = plan.program;
  const scheduled = useMemo(() => (program ? scheduledFor(program.weekly_schedule, date) : null), [program, date]);
  const sessionId = manualSession ?? scheduled?.session_id ?? null;
  const session = useMemo(() => program?.sessions.find((s) => s.id === sessionId) ?? null, [program, sessionId]);
  const nameOf = (sid: string, eid: string) => program?.sessions.find((s) => s.id === sid)?.exercises.find((e) => e.id === eid)?.name ?? eid;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6" data-testid="body-os">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Dumbbell className="h-6 w-6" />Body OS</h1>
          <p className="text-sm text-muted-foreground">{program ? program.title : "Training program and logbook"}</p>
        </div>
        {program && <Badge variant="outline">{program.status}</Badge>}
      </header>

      <WhoopPanel whoop={whoop} retained={whoopRetained} boundary={program?.whoop_boundary ?? "WHOOP data is context only; it never removes restrictions or raises load."}
        refreshing={whoopBusy} refreshNote={whoopNote} onRefresh={() => loadWhoop(true)} />

      {plan.state === "loading" && <p className="text-sm text-muted-foreground">Loading program…</p>}
      {plan.state === "missing" && <Card title="No program on file" tone="warn"><p>No reviewed training program is available. Nothing is invented in its place.</p></Card>}
      {plan.state === "error" && <Card title="Program unavailable" tone="warn"><p>{plan.note}</p></Card>}

      {program && (
        <>
          <section className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Choose session">
              {program.sessions.map((s) => (
                <button key={s.id} role="tab" aria-selected={s.id === sessionId} data-testid={`session-${s.id}`} onClick={() => setManualSession(s.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${s.id === sessionId ? "border-primary bg-primary/10" : ""}`}>
                  <div className="font-semibold">{s.label}</div><div className="text-xs text-muted-foreground">{s.focus}</div>
                </button>
              ))}
            </div>
            <label className="flex flex-wrap items-center gap-2 text-sm">Training date
              <input type="date" className="rounded border bg-background px-2 py-1" value={date} max={localDate()} onChange={(e) => changeDate(e.target.value)} data-testid="log-date" />
            </label>
            <p className="text-xs" data-testid="scheduled-session">
              Weekly template for {date}{scheduled ? ` (${scheduled.day})` : ""}:{" "}
              <b>{!scheduled ? "no template entry" : scheduled.session_id ? `Session ${scheduled.session_id}` : "Rest day"}</b>
              {scheduled?.note ? ` — ${scheduled.note}` : ""}
            </p>
            <p className="text-xs" data-testid="selected-session">
              Selected session: <b>{session ? session.label : "none"}</b>
              {manualSession ? " (your choice)" : session ? " (from the weekly template)" : " — pick a session above to log one anyway"}
              {manualSession && <> · <button className="underline" onClick={() => setManualSession(null)} data-testid="follow-template">follow the weekly template</button></>}
            </p>
            <p className="text-xs text-muted-foreground">{program.schedule_notes.join(" ")}</p>
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            {!session && (
              <div className="min-w-0 space-y-4 lg:col-span-2" data-testid="no-session">
                <Card title={scheduled && !scheduled.session_id ? "Rest day in the weekly template" : "No session selected"}>
                  <p>No training session is shown for this date. Choose a session above only if you intend to train.</p>
                </Card>
              </div>
            )}
            {session && (
              <div className="min-w-0 space-y-4 lg:col-span-2" data-testid="session-detail">
                <Card title={`Warm-up · ${session.warmup.minutes_min}–${session.warmup.minutes_max} min`}>
                  <ul className="list-disc space-y-1 pl-5">{session.warmup.steps.map((s) => <li key={s}>{s}</li>)}</ul>
                  {session.ramp_sets.length > 0 && <>
                    <p className="mt-2 text-xs font-medium">Ramp sets (log as warm-up)</p>
                    <ul className="list-disc space-y-1 pl-5">{session.ramp_sets.map((r, i) => <li key={i}>{nameOf(session.id, r.exercise_id)}: {r.reps} reps, {r.load}, rest {restLabel(r.rest_seconds)}</li>)}</ul>
                  </>}
                </Card>
                {session.exercises.map((e, i) => (
                  <Card key={e.id} title={`${i + 1}. ${e.name}`}>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span><b>{e.sets}</b> sets × <b>{e.rep_min}–{e.rep_max}</b> reps</span>
                      <span>Rest <b>{restLabel(e.rest_seconds)}</b></span>
                      <span>{e.rir}</span>
                      <button className="text-xs underline" onClick={() => setRestFor(e.rest_seconds)} data-testid={`use-rest-${e.id}`}>use rest timer</button>
                    </div>
                    {e.condition && <p className="mt-1 text-xs text-amber-600">Condition: {e.condition}</p>}
                    {e.cues.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{e.cues.map((c) => <li key={c}>{c}</li>)}</ul>}
                    <SetLogger session={session} exercise={e} date={date} logState={day.state} live={live} onSaved={onSaved}
                      logged={daySets.filter((s) => s.session_id === session.id && s.exercise_id === e.id)} />
                  </Card>
                ))}
                <Card title="Optional cardio — not a clearance"><p className="text-xs">{session.cardio.condition}</p><p className="mt-1">{session.cardio.prescription}</p></Card>
                <Card title="Cooldown"><ul className="list-disc space-y-1 pl-5">{session.cooldown.steps.map((s) => <li key={s}>{s}</li>)}</ul></Card>
              </div>
            )}
            <div className="min-w-0 space-y-4">
              <Card title="Rest timer" icon={<Timer className="h-4 w-4" />}><RestTimer seconds={restFor} /><p className="mt-1 text-xs text-muted-foreground">Set to {restLabel(restFor)}. Pick an exercise&apos;s “use rest timer” to change it.</p></Card>
              <Card title={`Logbook · ${date}`} icon={<ClipboardList className="h-4 w-4" />}>
                {day.state === "loading" && <p className="text-muted-foreground" data-testid="logbook-loading">Loading…</p>}
                {day.state === "error" && <p className="text-red-500" data-testid="logbook-error">{day.note}</p>}
                {day.state === "ready" && daySets.length === 0 && <p className="text-muted-foreground" data-testid="logbook-empty">No sets logged for this date.</p>}
                {locked && editor && editor.date !== date && <p className="mb-2 text-xs text-amber-600" data-testid="edit-locked-note">An update on {editor.date} is not confirmed yet. Open that date and press Retry update before editing another set.</p>}
                {logMsg && logMsg.date === date && <p role="status" data-testid="logbook-msg" className={`mb-2 text-xs ${logMsg.tone === "ok" ? "text-emerald-500" : "text-red-500"}`}>{logMsg.text}</p>}
                <ul className="space-y-1" data-testid="logbook">
                  {daySets.map((s) => (
                    <li key={s.key} className="rounded border px-2 py-1 text-xs" data-testid={`row-${s.key}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0"><b>{s.session_id}</b> · {nameOf(s.session_id, s.exercise_id)} · {s.kind === "warmup" ? "warm-up" : "working"} {s.set_number}: {s.weight} {s.unit} × {s.reps}{s.rir !== null ? ` @ ${s.rir} RIR` : ""}{s.notes ? ` — ${s.notes}` : ""}{s.edited_at ? <span className="text-muted-foreground"> · edited</span> : null}</span>
                        {!(editor && editor.date === date && editor.row.key === s.key) && (
                          <button type="button" className="inline-flex shrink-0 items-center gap-1 underline disabled:opacity-50" onClick={() => startEdit(s)}
                            disabled={day.state !== "ready" || !s.revision || locked} data-testid={`edit-${s.key}`}><Pencil className="h-3 w-3" />Edit</button>
                        )}
                      </div>
                      {editor && editor.date === date && editor.row.key === s.key && (
                        <SetEditor ed={editor} onChange={(draft) => setEditor((e) => (e && e.id === editor.id && !editorLocked(e) ? { ...e, draft, msg: null } : e))}
                          onSubmit={() => submitEdit(editor)} onCancel={() => setEditor((e) => (e && e.id === editor.id && !editorLocked(e) ? null : e))} />
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Weekly template (a plan, not a record)">
                <ul className="space-y-1 text-xs">{program.weekly_schedule.map((d) => <li key={d.day}><b>{d.day}</b>: {d.session_id ? `Session ${d.session_id} — ` : ""}{d.note}</li>)}</ul>
              </Card>
              <Card title="Progression & recovery"><ul className="list-disc space-y-1 pl-5 text-xs">{[...program.progression, ...program.recovery].map((p) => <li key={p}>{p}</li>)}</ul></Card>
              <Card title="Baseline — not yet supplied"><ul className="list-disc pl-5 text-xs">{program.baseline_unknown.map((b) => <li key={b}>{b}: unknown</li>)}</ul></Card>
            </div>
          </div>

          {/* Optional reference only (closed by default); not a pre-session gate; nothing blocks logging. */}
          <details className="rounded-xl border border-border bg-card p-4 text-xs" data-testid="programme-notes">
            <summary className="cursor-pointer text-sm font-semibold">Programme notes</summary>
            <p className="mt-2">{program.authority}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{[...program.safety_gate.rules, ...program.safety_gate.stop_signs].map((r) => <li key={r}>{r}</li>)}</ul>
            {session && <p className="mt-2">Session {session.id}: {session.effort}</p>}
          </details>
        </>
      )}
    </div>
  );
}
