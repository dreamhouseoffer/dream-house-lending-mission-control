"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { decisionBody, isRecordId, isUnknownOutcome, meaningfulNotes, outcomeMessage } from "@/lib/mission-control/output-review-model.mjs";

type Pair = { part: string | null; before_label: string; before: string; after_label: string; after: string };
type Unit = { id: string | null; title: string; context: string | null; pairs: Pair[]; extra: { label: string; text: string }[] };
type Receipt = { decision_id: string; decision: "approve" | "revise" | "reject"; version_digest: string; version_label: string | null; task_id: string; notes: string | null; decided_at: string };
type Version = {
  version_label: string; version_digest: string; task_id: string; task_title: string; native_status: string; is_revision: boolean; manifest_artifact_id: string;
  reviewable: boolean; not_reviewable: string | null;
  review: { reviewer: string | null; reviewed_at: string | null; decision: string | null; accepted: boolean; covers_all_declared: boolean; source_id: string | null } | null;
  primary: { artifact_id: string; name: string; sha256: string; size: number; text: string; selection: string } | null;
  units: Unit[]; unparsed_units: string[]; comparison: "exact_units" | "partial_exact_units" | "unavailable";
  destinations: { url: string; label: string }[]; destinations_sha256: string;
  files: { artifact_id: string; name: string; sha256: string | null; size: number; role: string }[]; decision: Receipt | null;
};
type Revision = { state: string; label: string; native_status: string | null; requested_against_label: string | null; revision_task_id: string | null; attempts: number; run_id: number | null };
type Review = {
  record_id: string; state: "ok" | "none" | "blocked"; blocked: { code: string; task_id: string | null } | null; current: Version | null;
  previous: { version_label: string; task_id: string; is_revision: boolean; decision: Receipt | null }[];
  revision: Revision | null; next_step: { owner_needed: boolean; text: string }; history: Receipt[]; problems: { task_id: string; code: string }[];
  controls: { decide_unavailable: string | null; approve: boolean; reject: boolean; revise: boolean; revise_unavailable: string | null }; boundary: string;
};
type Decision = "approve" | "revise" | "reject";
// A sent-but-unconfirmed decision: retry resends the SAME key and body so the bridge replays rather than duplicates.
type Pending = { key: string; body: Record<string, unknown>; decision: Decision; versionLabel: string };

const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "unknown");
// The pending op survives reload/navigation: stored per record so only the SAME key/body can ever be resent for it.
const pendingSlot = (recordId: string) => `mc.output-review.pending.${recordId}`;
function readPending(recordId: string): Pending | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(pendingSlot(recordId)) ?? "null");
    return p && typeof p.key === "string" && /^[0-9a-f]{32}$/.test(p.key) && p.body && typeof p.body === "object" && ["approve", "revise", "reject"].includes(p.decision) ? (p as Pending) : null;
  } catch { return null; }
}
function writePending(recordId: string, p: Pending | null) {
  try { if (p) window.localStorage.setItem(pendingSlot(recordId), JSON.stringify(p)); else window.localStorage.removeItem(pendingSlot(recordId)); } catch { /* storage unavailable: in-memory lock still holds */ }
}
// POSTs still in flight per record. Module scope outlives a record switch, so a returning view (A->B->A) stays locked until its own answer.
const inflight = new Map<string, string>();
// A POST's answer is announced to every mounted panel: a view reopened (new instance) while the POST was in flight restored
// that same op as "sending" and only learns its outcome here. Each view applies it only if it shows that record and op.
type Outcome = { confirmed: boolean; unknown: boolean; code: string; data: { receipt?: Receipt | null; next_step?: { text: string } } | null };
const answered = new Set<(rec: string, p: Pending, o: Outcome, from: object) => void>();
const VERB: Record<Decision, string> = { approve: "Wording approved", revise: "Revision requested", reject: "Rejected" };

/** Whether an unconfirmed decision is held for this record (presence only; the board never reads its body). */
export const hasPendingOutputDecision = (recordId: string) => isRecordId(recordId) && readPending(recordId) !== null;

// `onChange(recordId)`: this record's output state may have changed (read settled or a decision answered) — the page
// re-reads it through the same GET so the board never trusts this view's copy.
export function OutputReviewPanel({ recordId, onChange }: { recordId: string; onChange?: (recordId: string) => void }) {
  const [reviewS, setReview] = useState<Review | null>(null);
  const [loadErrorS, setLoadError] = useState<string | null>(null);
  // No read yet counts as loading: controls stay off until the first answer for this record arrives.
  const [loadingS, setLoading] = useState(true);
  const [notesS, setNotes] = useState("");
  const [pendingS, setPendingState] = useState<Pending | null>(null);
  const [sendingS, setSending] = useState(false);
  const [messageS, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  // Which record the state above belongs to. On a record switch the first render still holds the previous record's
  // state until the reset effect runs: never show it (or its pending/controls) under the new record.
  const [viewFor, setViewFor] = useState(recordId);
  const fresh = viewFor === recordId;
  const review = fresh ? reviewS : null;
  const loadError = fresh ? loadErrorS : null;
  const loading = !fresh || loadingS;
  const notes = fresh ? notesS : "";
  const pending = fresh ? pendingS : null;
  const sending = fresh && sendingS;
  const message = fresh ? messageS : null;
  // The actual draft is the primary thing the owner reviews: shown in full by default (it can be collapsed).
  const [showDraft, setShowDraft] = useState(true);
  // Generation-bound loads: only the newest request for THIS record may set state; an older or other-record answer is dropped.
  const gen = useRef(0);
  // The panel is reused across records: async callbacks only touch state while their record is still shown (and, for
  // a POST, while it still owns that record's view: same epoch, or the same exact operation after A->B->A).
  const shown = useRef(recordId);
  const epoch = useRef(0);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  const self = useRef({});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    if (!isRecordId(recordId) || shown.current !== recordId) return;
    const mine = ++gen.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/control/output-reviews/${recordId}`, { cache: "no-store" }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (mine !== gen.current) return;
      if (res?.ok && data?.ok && data.review && data.review.record_id === recordId) { setReview(data.review as Review); setLoadError(null); onChangeRef.current?.(recordId); }
      else setLoadError(data?.code || (res ? `http_${res.status}` : "unreachable"));
    } finally { if (mine === gen.current) setLoading(false); }
  }, [recordId]);
  useEffect(() => {
    // Restore (never drop) an unconfirmed decision for this record; its notes stay with it.
    shown.current = recordId; epoch.current += 1; setViewFor(recordId);
    const restored = isRecordId(recordId) ? readPending(recordId) : null;
    setReview(null); setLoadError(null); setPendingState(restored); setMessage(null); setLoading(true);
    setSending(Boolean(restored && inflight.get(recordId) === restored.key));
    setNotes(restored && typeof restored.body.notes === "string" ? restored.body.notes : "");
    load();
    // Unmount or record change: in-flight GET/POST/handoff answers from this view no longer write into it.
    return () => { shown.current = ""; epoch.current += 1; gen.current += 1; };
  }, [load, recordId]);

  // How an answer for this view's exact op is shown: the same for the view that sent it and for one reopened since.
  async function apply(p: Pending, o: Outcome) {
    setSending(false);
    if (o.confirmed) {
      setPendingState(null);
      setNotes("");
      setMessage({ tone: "ok", text: `${VERB[p.decision]} for ${p.versionLabel} (receipt ${o.data?.receipt?.decision_id ?? "—"}). ${o.data?.next_step?.text ?? ""}` });
      await load();
      return;
    }
    if (o.unknown) {
      // Outcome unknown: keep the exact request so Retry replays it (never a second decision).
      setMessage({ tone: "bad", text: `Not confirmed (${o.code}) — the decision may or may not be saved. Retry sends the same request.` });
      return;
    }
    setPendingState(null);
    setMessage({ tone: "bad", text: outcomeMessage(o.code) });
    await load();
  }
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    const onAnswer = (rec: string, p: Pending, o: Outcome, from: object) => {
      if (from !== self.current && shown.current === rec && pendingRef.current?.key === p.key) applyRef.current(p, o);
    };
    answered.add(onAnswer);
    return () => { answered.delete(onAnswer); };
  }, []);

  async function send(p: Pending) {
    const rec = recordId;
    const ep = epoch.current;
    const owns = () => shown.current === rec && (epoch.current === ep || pendingRef.current?.key === p.key);
    inflight.set(rec, p.key);
    writePending(rec, p);
    setSending(true);
    setPendingState(p);
    setMessage(null);
    let status = 0;
    let data: { outcome?: string; code?: string; receipt?: Receipt | null; next_step?: { text: string } } | null = null;
    try {
      const res = await fetch(`/api/control/output-reviews/${recordId}/decision`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": p.key }, body: JSON.stringify(p.body) });
      status = res.status;
      data = await res.json().catch(() => null);
    } catch { status = 0; }
    if (inflight.get(rec) === p.key) inflight.delete(rec);
    const confirmed = data?.outcome === "saved" || data?.outcome === "replayed";
    const code = data?.code || (status === 0 ? "network" : status >= 500 ? "http_5xx" : `http_${status}`);
    const unknown = !confirmed && (status === 0 || status >= 500 || isUnknownOutcome(code));
    // Durable state is always this record's own: only a confirmed or definitively refused answer releases its exact operation.
    if (!unknown && readPending(rec)?.key === p.key) writePending(rec, null);
    const o: Outcome = { confirmed, unknown, code, data };
    answered.forEach((fn) => fn(rec, p, o, self.current));
    onChangeRef.current?.(rec);
    if (!owns()) return; // another record (or a newer operation) is on screen: never unlock or overwrite it
    await apply(p, o);
  }

  function decide(decision: Decision) {
    const cur = review?.current;
    if (!cur) return;
    const r = decisionBody(cur, decision, notes) as { ok: true; body: Record<string, unknown> } | { ok: false; code: string };
    if (!r.ok) { setMessage({ tone: "bad", text: outcomeMessage(r.code) }); return; }
    send({ key: newKey(), body: r.body, decision, versionLabel: cur.version_label });
  }

  async function retryHandoff(decisionId: string) {
    const ep = epoch.current;
    setSending(true);
    const res = await fetch(`/api/control/output-reviews/${recordId}/handoff-retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision_id: decisionId }) }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (epoch.current !== ep) return; // the view moved on; this record's revision state is re-read when it is shown again
    setMessage(data?.outcome === "saved" ? { tone: "ok", text: data.revision?.label ?? "Handoff re-attempted." } : { tone: "bad", text: `Handoff not confirmed (${data?.code ?? "network"}). Retry is safe — it never creates a duplicate.` });
    setSending(false);
    await load();
  }

  if (!isRecordId(recordId)) return null;
  const cur = review?.current ?? null;
  const decided = cur?.decision ?? null;
  // Decisions need a fresh, confirmed read: never while loading, after a failed refresh (stale view) or with one unconfirmed.
  const locked = sending || Boolean(pending) || loading || Boolean(loadError);
  const canDecide = Boolean(review && cur && !decided && review.controls.decide_unavailable === null && cur.reviewable);
  const lastRevise = review?.history.filter((h) => h.decision === "revise").slice(-1)[0] ?? null;

  return (
    <section className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.06] p-3" data-testid="output-review" data-record={recordId} data-state={loading ? "loading" : loadError ? "error" : review ? "ready" : "loading"} aria-label="Review Milo's output">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-violet-100">Review: what Milo produced</h3>
        <button onClick={load} disabled={loading} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 disabled:opacity-50" data-testid="output-review-refresh">
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      {loadError ? <p className="mt-2 text-xs text-rose-200" data-testid="output-review-error">Output review unavailable ({loadError}).{review ? " What is shown below may be out of date; decisions are disabled until a refresh succeeds." : " Nothing is assumed; refresh to retry."}</p> : null}
      {review?.blocked ? <p className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-sm text-rose-100" data-testid="output-blocked">{review.next_step.text}{review.blocked.task_id ? <> · native task <Link className="font-mono text-emerald-300" href={`/tasks/${review.blocked.task_id}`}>{review.blocked.task_id}</Link></> : null}</p> : null}
      {!review && !loadError ? <p className="mt-2 text-xs text-white/50">Loading the registered output…</p> : null}
      {/* The unconfirmed operation is shown and retryable whatever the read state: it never depends on a successful load. */}
      {pending && !sending ? (
        <div className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-sm text-rose-100" data-testid="output-retry">
          <div className="flex flex-wrap items-center gap-2">
            <span>Unconfirmed: {pending.decision} on {pending.versionLabel}. Retry sends the same request; nothing else can be decided until it is confirmed.</span>
            <button onClick={() => send(pending)} className="rounded-lg bg-rose-200 px-3 py-1 font-bold text-black">Retry {pending.decision}</button>
          </div>
          {typeof pending.body.notes === "string" && pending.body.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-rose-100/80" data-testid="output-pending-notes">{pending.body.notes}</p> : null}
        </div>
      ) : pending ? <p className="mt-2 text-xs text-white/60" data-testid="output-sending">Sending {pending.decision} on {pending.versionLabel}…</p> : null}
      {review && !cur && !review.blocked ? <p className="mt-2 text-xs text-white/60" data-testid="output-review-none">{review.next_step.text}</p> : null}

      {review && cur ? (
        <>
          <p className="mt-1 break-words text-xs text-white/60" data-testid="output-version">
            {cur.version_label}{cur.is_revision ? " (revision)" : ""} · native task <Link className="font-mono text-emerald-300" href={`/tasks/${cur.task_id}`}>{cur.task_id}</Link> ({cur.native_status})
            {" · "}{cur.review ? `parent review by ${cur.review.reviewer ?? "Hermie"} ${fmt(cur.review.reviewed_at)}${cur.review.accepted ? "" : " — NOT an acceptance"}${cur.review.covers_all_declared ? "" : " — does NOT cover every declared file"}` : "no parent review yet"}
          </p>
          {cur.review?.decision ? <p className="mt-1 break-words text-[11px] text-white/50" data-testid="parent-review-decision">Parent review: {cur.review.decision}</p> : null}
          {!review.blocked ? <p className={`mt-2 rounded-lg p-2 text-sm ${review.next_step.owner_needed ? "border border-amber-400/25 bg-amber-500/10 text-amber-100" : "border border-white/10 bg-white/[0.04] text-white/80"}`} data-testid="output-next-step">
            {review.next_step.text}
          </p> : null}
          {review.revision ? <p className="mt-2 text-xs text-white/70" data-testid="output-revision">
            Revision{review.revision.requested_against_label ? ` of ${review.revision.requested_against_label}` : ""}: {review.revision.label}
            {review.revision.revision_task_id ? <> · <Link className="font-mono text-emerald-300" href={`/tasks/${review.revision.revision_task_id}`}>{review.revision.revision_task_id}</Link></> : null}
            {review.revision.state === "handoff_unconfirmed" && lastRevise ? (
              <button disabled={sending} onClick={() => retryHandoff(lastRevise.decision_id)} className="ml-2 rounded border border-amber-300/30 px-2 py-0.5 text-amber-100 disabled:opacity-50" data-testid="handoff-retry">Retry handoff</button>
            ) : null}
          </p> : null}

          <h4 className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-white/45">What changed</h4>
          {cur.comparison === "unavailable" ? (
            <p className="mt-1 text-xs text-white/60" data-testid="comparison-unavailable">Exact before/after comparison unavailable: the draft has no explicitly labelled before/after units. Read the full draft below.</p>
          ) : (
            <ol className="mt-1 space-y-2" data-testid="units">
              {cur.units.map((u, i) => (
                <li key={`${u.id ?? ""}-${i}`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="text-xs font-semibold text-white/80">{u.id ? `${u.id} — ` : ""}{u.title}</p>
                  {u.context ? <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] text-white/45">{u.context}</p> : null}
                  {u.pairs.map((p, j) => (
                    <div key={j} className="mt-1 grid gap-1 sm:grid-cols-2">
                      <div className="min-w-0 rounded border border-rose-400/20 bg-rose-500/5 p-1.5"><p className="text-[10px] uppercase text-rose-200/70">{p.before_label}</p><p className="whitespace-pre-wrap break-words text-xs text-white/75">{p.before}</p></div>
                      <div className="min-w-0 rounded border border-emerald-400/20 bg-emerald-500/5 p-1.5"><p className="text-[10px] uppercase text-emerald-200/70">{p.after_label}</p><p className="whitespace-pre-wrap break-words text-xs text-white/85">{p.after}</p></div>
                    </div>
                  ))}
                  {u.extra.map((x, j) => (
                    <div key={`x${j}`} className="mt-1 rounded border border-amber-300/25 bg-amber-500/5 p-1.5" data-testid="unit-extra">
                      <p className="text-[10px] uppercase text-amber-200/80">{x.label}</p><p className="whitespace-pre-wrap break-words text-xs text-white/80">{x.text}</p>
                    </div>
                  ))}
                </li>
              ))}
              {cur.unparsed_units.length ? <li className="text-[11px] text-white/50" data-testid="units-unparsed">Not extractable exactly (see full draft): {cur.unparsed_units.join("; ")}</li> : null}
            </ol>
          )}

          {cur.destinations.length ? (
            <div className="mt-2 text-xs text-white/60" data-testid="destinations">
              <span className="font-semibold text-white/75">Destinations named in the draft:</span>
              {cur.destinations.map((d) => <span key={d.url} className="block break-all">{d.label}: {d.url}</span>)}
            </div>
          ) : null}

          <div className="mt-3">
            <button onClick={() => setShowDraft((v) => !v)} className="text-xs font-semibold text-emerald-300" data-testid="toggle-draft">{showDraft ? "Hide" : "Show"} full draft{cur.primary ? ` (${cur.primary.name})` : ""}</button>
            {cur.primary ? (
              <Link href={`/tasks/${cur.task_id}/artifacts/${cur.primary.artifact_id}`} className="ml-3 text-xs text-emerald-300/80">Open in artifact viewer →</Link>
            ) : <span className="ml-3 text-xs text-white/50">No readable text draft declared.</span>}
            {showDraft && cur.primary ? <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-white/80" data-testid="full-draft">{cur.primary.text}</pre> : null}
          </div>

          {decided ? (
            <p className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-sm text-emerald-100" data-testid="output-receipt">
              {VERB[decided.decision]} for {cur.version_label} on {fmt(decided.decided_at)} · receipt <span className="font-mono text-xs">{decided.decision_id}</span>{decided.notes ? <span className="mt-1 block whitespace-pre-wrap text-xs text-emerald-100/80">Notes: {decided.notes}</span> : null}
            </p>
          ) : canDecide ? (
            <div className="mt-3" data-testid="output-controls">
              <label htmlFor={`orv-notes-${recordId}`} className="block text-[11px] font-black uppercase tracking-[0.16em] text-white/40">Notes on this draft (required to request a revision)</label>
              <textarea id={`orv-notes-${recordId}`} value={notes} disabled={locked} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="What should change in this exact draft?"
                className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-sm text-white/85 outline-none disabled:opacity-60" data-testid="output-notes" />
              <p className="mt-1 text-[11px] text-white/45">{review.boundary}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button disabled={locked || !review.controls.approve} onClick={() => decide("approve")} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-bold text-black disabled:opacity-50" data-testid="output-approve">Approve wording ({cur.version_label})</button>
                <button disabled={locked || !review.controls.revise || !meaningfulNotes(notes)} onClick={() => decide("revise")} title={review.controls.revise_unavailable ?? undefined} className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-100 disabled:opacity-50" data-testid="output-revise">Request revision</button>
                <button disabled={locked || !review.controls.reject} onClick={() => decide("reject")} className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-100 disabled:opacity-50" data-testid="output-reject">Reject this version</button>
              </div>
              {!review.controls.revise && review.controls.revise_unavailable ? <p className="mt-1 text-[11px] text-white/45" data-testid="revise-unavailable">Revision: {review.controls.revise_unavailable}</p> : null}
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-white/50" data-testid="output-no-decision">No decision available on this version ({review.controls.decide_unavailable ?? cur.not_reviewable ?? "unavailable"}).</p>
          )}

          {message ? <p role="status" data-testid="output-message" className={`mt-2 break-words rounded-lg p-2 text-sm ${message.tone === "ok" ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border border-rose-400/25 bg-rose-500/10 text-rose-100"}`}>{message.text}</p> : null}

          <details className="mt-3 text-xs text-white/55" data-testid="output-secondary">
            <summary className="cursor-pointer text-white/65">Files, earlier versions and decision history</summary>
            <ul className="mt-1 space-y-0.5">{cur.files.map((f) => <li key={f.artifact_id} className="break-all">{f.role === "shown_draft" ? "Shown draft" : "Supporting"}: {f.name} · {f.size} bytes · <span className="font-mono">{f.sha256?.slice(0, 12) ?? "unreadable"}</span></li>)}</ul>
            {review.previous.length ? <ul className="mt-1">{review.previous.map((p) => <li key={p.version_label}>{p.version_label}{p.is_revision ? " (revision)" : ""} · {p.task_id}{p.decision ? ` · ${VERB[p.decision.decision]}` : " · no decision"}</li>)}</ul> : null}
            {review.history.length ? <ul className="mt-1">{review.history.map((h) => <li key={h.decision_id}>{fmt(h.decided_at)} · {VERB[h.decision]} · {h.version_label ?? "version no longer registered"}</li>)}</ul> : null}
            {review.problems.length ? <p className="mt-1 text-amber-200/80">Unreadable linked output: {review.problems.map((p) => `${p.task_id} (${p.code})`).join(", ")}</p> : null}
            <p className="mt-1">Version digest <span className="font-mono">{cur.version_digest.slice(0, 16)}</span> · manifest {cur.manifest_artifact_id}</p>
          </details>
        </>
      ) : null}
    </section>
  );
}
