"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ClipboardList, Dumbbell, ExternalLink, Pause, Play, RotateCcw, Timer, Watch } from "lucide-react";
import {
  SET_ERROR_COPY,
  classifySaveResponse,
  draftToSet,
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
type LoggedSet = { key: string; session_id: string; exercise_id: string; date: string; kind: "warmup" | "working"; set_number: number; weight: number; unit: string; reps: number; rir: number | null; notes: string; saved_at: string };
type Whoop =
  | { state: "not_connected" }
  | { state: "error"; code: string }
  | { state: "connected"; observedAt: string; freshness: string;
      cycle: { start: string; end: string | null; score_state: string | null; strain: number | null } | null;
      recovery: { updated_at: string | null; score_state: string | null; user_calibrating: boolean; recovery_score: number | null; resting_heart_rate: number | null; hrv_rmssd_milli: number | null } | null;
      sleep: { start: string | null; end: string | null; score_state: string | null; sleep_performance_percentage: number | null; asleep_milli: number | null } | null };

const localDate = () => new Date().toLocaleDateString("en-CA");
const newKey = () => `set_${crypto.randomUUID().replace(/-/g, "")}`;
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

function SetLogger({ session, exercise, date, logged, onSaved }: { session: Session; exercise: Exercise; date: string; logged: LoggedSet[]; onSaved: () => void }) {
  const working = logged.filter((s) => s.kind === "working");
  const nextNum = (kind: "warmup" | "working") => String(Math.min(20, logged.filter((s) => s.kind === kind).reduce((m, s) => Math.max(m, s.set_number), 0) + 1));
  const [d, setD] = useState<Draft>({ kind: "working", setNumber: "1", weight: "", unit: "lb", reps: "", rir: "3", notes: "" });
  const [key, setKey] = useState(newKey);
  const [fingerprint, setFingerprint] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setD((x) => ({ ...x, setNumber: nextNum(x.kind) })), [logged.length, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setMsg(null); setD({ ...d, [k]: e.target.value } as Draft); };

  async function save() {
    const parsed = draftToSet({ sessionId: session.id, exerciseId: exercise.id, date, ...d });
    if ("error" in parsed) { setMsg({ tone: "err", text: SET_ERROR_COPY[parsed.error as keyof typeof SET_ERROR_COPY] ?? "Check the values." }); return; }
    // Same values reuse the same key (a retry dedupes); changed values always get a fresh key.
    const fp = JSON.stringify(parsed.set);
    const useKey = fp === fingerprint ? key : newKey();
    setKey(useKey); setFingerprint(fp); setBusy(true);
    try {
      const res = await fetch("/api/fitness/logs", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", "idempotency-key": useKey }, body: fp });
      const r = classifySaveResponse(res.status, await res.json().catch(() => null));
      if (r.kind === "saved") {
        setMsg({ tone: "ok", text: r.deduplicated ? "Already saved (same set) — not duplicated." : `Saved ${r.set.kind === "warmup" ? "warm-up" : "working"} set ${r.set.set_number}.` });
        setFingerprint(""); setD((x) => ({ ...x, reps: "", notes: "" }));
        onSaved();
      } else if (r.kind === "refused") {
        setMsg({ tone: "err", text: `Not saved. ${SET_ERROR_COPY[r.code as keyof typeof SET_ERROR_COPY] ?? (r.code === "unauthenticated" ? "Sign in again." : "Check the values.")}` });
      } else {
        // Values and key are kept: the set may have reached the logbook, and the same key cannot apply twice.
        setMsg({ tone: "err", text: "Not confirmed: the logbook did not confirm this set. Press Save again with the same values — it will not duplicate." });
      }
    } catch {
      setMsg({ tone: "err", text: "Not confirmed: no answer from the logbook. Press Save again with the same values — it will not duplicate." });
    } finally { setBusy(false); }
  }

  const input = "w-full min-w-0 rounded border bg-background px-2 py-1 text-sm";
  return (
    <div className="mt-3 rounded-lg border border-dashed p-3" data-testid={`logger-${exercise.id}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">Log a set <span className="text-muted-foreground">(draft — not saved until you press Save)</span></span>
        <span data-testid={`progress-${exercise.id}`}>Working sets logged {date}: {working.length} of {exercise.sets} prescribed</span>
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
        <button className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50" onClick={save} disabled={busy} data-testid={`save-${exercise.id}`}>{busy ? "Saving…" : "Save set"}</button>
        {msg && <span role="status" className={`text-xs ${msg.tone === "ok" ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>}
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

function WhoopPanel({ whoop, boundary }: { whoop: Whoop | null; boundary: string }) {
  const v = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? "unknown" : `${Math.round(n * 10) / 10}${unit}`);
  return (
    <Card title="WHOOP (read-only)" icon={<Watch className="h-4 w-4" />}>
      {!whoop && <p className="text-muted-foreground">Checking connection…</p>}
      {whoop?.state === "not_connected" && (
        <div className="space-y-2" data-testid="whoop-not-connected">
          <p><Badge variant="outline">Not connected</Badge> No WHOOP data is shown and nothing is requested from WHOOP until the owner completes setup.</p>
          <a className="inline-flex items-center gap-1 text-xs underline" href="https://developer.whoop.com/docs/developing/oauth" target="_blank" rel="noopener noreferrer">WHOOP OAuth docs <ExternalLink className="h-3 w-3" /></a>
        </div>
      )}
      <WhoopSetup />
      {whoop?.state === "error" && <p data-testid="whoop-error"><Badge variant="outline">Unavailable</Badge> WHOOP data could not be read ({whoop.code.replace(/_/g, " ")}). Values are unknown — not zero, not green.</p>}
      {whoop?.state === "connected" && (
        <div className="space-y-2" data-testid="whoop-connected">
          <p className="text-xs">Fetched {when(whoop.observedAt)} · data is <b>{whoop.freshness === "current" ? "current cycle" : whoop.freshness === "no_data" ? "not available" : "stale (older cycle/sleep)"}</b></p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded border p-2"><div className="text-xs text-muted-foreground">Recovery</div><div className="text-lg">{whoop.recovery?.score_state === "SCORED" ? v(whoop.recovery.recovery_score, "%") : "unknown"}</div>
              <div className="text-xs text-muted-foreground">{whoop.recovery ? `${whoop.recovery.score_state?.toLowerCase().replace("_", " ")}${whoop.recovery.user_calibrating ? " · calibrating" : ""} · updated ${when(whoop.recovery.updated_at)}` : "no recovery for this cycle"}</div>
              {whoop.recovery?.score_state === "SCORED" && <div className="text-xs">RHR {v(whoop.recovery.resting_heart_rate, " bpm")} · HRV {v(whoop.recovery.hrv_rmssd_milli, " ms")}</div>}</div>
            <div className="rounded border p-2"><div className="text-xs text-muted-foreground">Sleep</div><div className="text-lg">{whoop.sleep?.score_state === "SCORED" ? v(whoop.sleep.sleep_performance_percentage, "%") : "unknown"}</div>
              <div className="text-xs text-muted-foreground">{whoop.sleep ? `${when(whoop.sleep.start)} → ${when(whoop.sleep.end)}` : "no sleep for this cycle"}</div>
              {whoop.sleep?.asleep_milli != null && <div className="text-xs">Asleep {v(whoop.sleep.asleep_milli / 3600000, " h")}</div>}</div>
            <div className="rounded border p-2"><div className="text-xs text-muted-foreground">Day strain (cardiovascular)</div><div className="text-lg">{whoop.cycle?.score_state === "SCORED" ? v(whoop.cycle.strain) : "unknown"}</div>
              <div className="text-xs text-muted-foreground">{whoop.cycle ? `cycle from ${when(whoop.cycle.start)}${whoop.cycle.end ? ` to ${when(whoop.cycle.end)}` : " (ongoing)"}` : "no cycle"}</div></div>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{boundary}</p>
    </Card>
  );
}

export default function BodyOSPage() {
  const [plan, setPlan] = useState<{ state: "loading" | "ready" | "missing" | "error"; program?: Program; note?: string }>({ state: "loading" });
  // null = follow the selected date's weekly template; a tab click is an explicit manual choice that is kept across dates.
  const [manualSession, setManualSession] = useState<string | null>(null);
  const [date, setDate] = useState(localDate);
  const [logs, setLogs] = useState<{ state: "loading" | "ready" | "error"; sets: LoggedSet[]; total: number; note?: string }>({ state: "loading", sets: [], total: 0 });
  const [whoop, setWhoop] = useState<Whoop | null>(null);
  const [restFor, setRestFor] = useState<number>(120);

  useEffect(() => {
    getJson("/api/fitness/plan").then(({ data }) => {
      if (data?.ok && data.state === "ready") setPlan({ state: "ready", program: data.program });
      else if (data?.ok && data.state === "missing") setPlan({ state: "missing" });
      else setPlan({ state: "error", note: failCopy(data?.state) });
    }, () => setPlan({ state: "error", note: failCopy("offline") }));
    getJson("/api/fitness/whoop").then(({ data }) => setWhoop(data?.ok ? data : { state: "error", code: data?.state ?? "whoop_unavailable" }), () => setWhoop({ state: "error", code: "offline" }));
  }, []);

  const loadLogs = useCallback(() => {
    getJson(`/api/fitness/logs?date=${encodeURIComponent(date)}`).then(({ data }) => {
      if (data?.ok) setLogs({ state: "ready", sets: data.sets, total: data.total });
      else setLogs({ state: "error", sets: [], total: 0, note: failCopy(data?.state) });
    }, () => setLogs({ state: "error", sets: [], total: 0, note: failCopy("offline") }));
  }, [date]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  const program = plan.program;
  const scheduled = useMemo(() => (program ? scheduledFor(program.weekly_schedule, date) : null), [program, date]);
  const sessionId = manualSession ?? scheduled?.session_id ?? null;
  const session = useMemo(() => program?.sessions.find((s) => s.id === sessionId) ?? null, [program, sessionId]);
  const nameOf = (sid: string, eid: string) => program?.sessions.find((s) => s.id === sid)?.exercises.find((e) => e.id === eid)?.name ?? eid;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 overflow-x-hidden p-4 md:p-6" data-testid="body-os">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Dumbbell className="h-6 w-6" />Body OS</h1>
          <p className="text-sm text-muted-foreground">{program ? program.title : "Training program and logbook"}</p>
        </div>
        {program && <Badge variant="outline">{program.status}</Badge>}
      </header>

      {plan.state === "loading" && <p className="text-sm text-muted-foreground">Loading program…</p>}
      {plan.state === "missing" && <Card title="No program on file" tone="warn"><p>No reviewed training program is available. Nothing is invented in its place.</p></Card>}
      {plan.state === "error" && <Card title="Program unavailable" tone="warn"><p>{plan.note}</p></Card>}

      {program && (
        <>
          <Card title="Safety gate — read before every session" icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} tone="warn">
            <p className="mb-2 text-xs">{program.authority}</p>
            <ul className="list-disc space-y-1 pl-5">{program.safety_gate.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            <ul className="mt-2 list-disc space-y-1 pl-5 font-medium">{program.safety_gate.stop_signs.map((r) => <li key={r}>{r}</li>)}</ul>
          </Card>

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
              <input type="date" className="rounded border bg-background px-2 py-1" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} data-testid="log-date" />
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
                    <SetLogger session={session} exercise={e} date={date} logged={logs.sets.filter((s) => s.session_id === session.id && s.exercise_id === e.id)} onSaved={loadLogs} />
                  </Card>
                ))}
                <Card title="Effort"><p>{session.effort}</p></Card>
                <Card title="Optional cardio — not a clearance"><p className="text-xs">{session.cardio.condition}</p><p className="mt-1">{session.cardio.prescription}</p></Card>
                <Card title="Cooldown"><ul className="list-disc space-y-1 pl-5">{session.cooldown.steps.map((s) => <li key={s}>{s}</li>)}</ul></Card>
              </div>
            )}
            <div className="min-w-0 space-y-4">
              <Card title="Rest timer" icon={<Timer className="h-4 w-4" />}><RestTimer seconds={restFor} /><p className="mt-1 text-xs text-muted-foreground">Set to {restLabel(restFor)}. Pick an exercise&apos;s “use rest timer” to change it.</p></Card>
              <Card title={`Logbook · ${date}`} icon={<ClipboardList className="h-4 w-4" />}>
                {logs.state === "loading" && <p className="text-muted-foreground">Loading…</p>}
                {logs.state === "error" && <p className="text-red-500">{logs.note}</p>}
                {logs.state === "ready" && logs.sets.length === 0 && <p className="text-muted-foreground" data-testid="logbook-empty">No sets logged for this date.</p>}
                <ul className="space-y-1" data-testid="logbook">
                  {logs.sets.map((s) => (
                    <li key={s.key} className="rounded border px-2 py-1 text-xs">
                      <b>{s.session_id}</b> · {nameOf(s.session_id, s.exercise_id)} · {s.kind === "warmup" ? "warm-up" : "working"} {s.set_number}: {s.weight} {s.unit} × {s.reps}{s.rir !== null ? ` @ ${s.rir} RIR` : ""}{s.notes ? ` — ${s.notes}` : ""}
                    </li>
                  ))}
                </ul>
              </Card>
              <WhoopPanel whoop={whoop} boundary={program.whoop_boundary} />
              <Card title="Weekly template (a plan, not a record)">
                <ul className="space-y-1 text-xs">{program.weekly_schedule.map((d) => <li key={d.day}><b>{d.day}</b>: {d.session_id ? `Session ${d.session_id} — ` : ""}{d.note}</li>)}</ul>
              </Card>
              <Card title="Progression & recovery"><ul className="list-disc space-y-1 pl-5 text-xs">{[...program.progression, ...program.recovery].map((p) => <li key={p}>{p}</li>)}</ul></Card>
              <Card title="Baseline — not yet supplied"><ul className="list-disc pl-5 text-xs">{program.baseline_unknown.map((b) => <li key={b}>{b}: unknown</li>)}</ul></Card>
            </div>
          </div>
        </>
      )}
      {!program && plan.state !== "loading" && <WhoopPanel whoop={whoop} boundary="WHOOP data is context only; it never removes restrictions or raises load." />}
    </div>
  );
}
