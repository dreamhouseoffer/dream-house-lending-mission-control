"use client";
// Capability-gated task submission. The browser chooses only a server-advertised template id and a title; the
// server derives the fixed body and assignee. One random idempotency key is bound to each submission's fingerprint:
// retries and double clicks reuse it and a changed payload gets a fresh one. Once any attempt is unconfirmed the
// original key and payload are locked (sticky across later errors and refreshes, via sessionStorage) until the task
// is confirmed or the owner acknowledges checking the task list before a deliberate new-key request.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DisabledAction, StateNotice } from "@/components/mc/ui";
import { MAX_TITLE, beginSubmission, classifySubmitResponse, outcomeCopy, restorePending, settleSubmission } from "@/lib/mission-control/task-submit.mjs";

export type PublicTemplate = { id: string; label: string; description: string; assignee: string };

type Outcome = { outcome: string; message: string; next: string; code?: string; field?: string | null };
type Pending = { key: string; fp: string; templateId: string; title: string; uncertain: boolean };

const PENDING_KEY = "mc.pending-task-submission.v1";

function newKey() {
  return crypto.randomUUID();
}

function loadPending(): Pending | null {
  try {
    return restorePending(sessionStorage.getItem(PENDING_KEY));
  } catch {
    return null;
  }
}

function savePending(p: Pending | null) {
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage unavailable: the in-memory key still protects retries within this page view.
  }
}

const local = (outcome: string, code?: string): Outcome => {
  const c = outcomeCopy(outcome);
  return { outcome, message: c.title, next: c.next, code };
};

export function TaskCreateForm({ enabled, reason, templates, idPrefix = "assign" }: { enabled: boolean; reason: string | null; templates: PublicTemplate[]; idPrefix?: string }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState(templates[0]?.label ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const [restored, setRestored] = useState(false);
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false); // an earlier attempt may have created a task
  const pending = useRef<Pending | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    const p = loadPending();
    if (p && templates.some((t) => t.id === p.templateId)) {
      pending.current = p;
      setTemplateId(p.templateId);
      setTitle(p.title);
      setRestored(true);
      setLocked(true);
      setResult(local("unconfirmed"));
    }
  }, [templates]);

  if (!enabled) return <DisabledAction label="Send to Hermes" reason={reason ?? "Task creation is unavailable."} />;

  const unresolved = locked || result?.outcome === "unconfirmed" || result?.outcome === "ambiguous";
  const selected = templates.find((t) => t.id === templateId);

  async function send(acknowledged = false) {
    if (inflight.current) return; // double click: one request per key at a time
    const p: Pending = beginSubmission(pending.current, { templateId, title }, { acknowledged }, newKey);
    pending.current = p;
    savePending(p);
    inflight.current = true;
    setSending(true);
    let r;
    try {
      const res = await fetch("/api/control/tasks", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": p.key },
        body: JSON.stringify({ template_id: p.templateId, title: p.title }),
      });
      r = classifySubmitResponse({ status: res.status, data: await res.json().catch(() => null) });
    } catch {
      r = classifySubmitResponse({ status: 0, data: null, network: true }); // the request may have reached the server
    }
    const kept: Pending | null = settleSubmission(p, r);
    pending.current = kept;
    savePending(kept);
    if (r.outcome === "accepted") {
      router.push(`/tasks/${r.task_id}?submitted=1${r.deduplicated ? "&deduplicated=1" : ""}`);
      return; // stay "sending" until navigation replaces this view
    }
    let next: Outcome;
    if (r.code === "session_ended") next = { ...local("unavailable"), message: "Your session ended", next: "Sign in again, then retry. This request did not reach the Mac." };
    else if (r.code === "request_blocked") next = { ...local("unavailable"), message: "Request blocked", next: "Reload Mission Control from its own address and retry. This request did not reach the Mac." };
    else if (r.data) next = { outcome: r.outcome, message: String(r.data.reason ?? r.data.message ?? ""), next: String(r.data.next_step ?? ""), code: r.data.code, field: r.data.field };
    else next = local(r.outcome, r.code);
    inflight.current = false;
    setSending(false);
    setChecked(false);
    setRestored(false);
    setLocked(Boolean(kept?.uncertain));
    setResult(next);
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!unresolved) void send();
      }}
    >
      <fieldset className="space-y-2" disabled={sending || unresolved}>
        <legend className="text-xs font-medium text-slate-400">Safe task template</legend>
        {templates.map((t) => (
          <label key={t.id} className="flex cursor-pointer gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 has-[:checked]:border-teal-500/50">
            <input
              type="radio"
              name={`${idPrefix}-template`}
              value={t.id}
              checked={templateId === t.id}
              onChange={() => {
                setTemplateId(t.id);
                if (!title.trim() || templates.some((x) => x.label === title)) setTitle(t.label);
                setResult(null);
              }}
              className="mt-1 accent-teal-500"
            />
            <span className="min-w-0 text-sm">
              <span className="font-medium text-slate-100">{t.label}</span>
              <span className="block text-xs leading-5 text-slate-400">{t.description}</span>
              <span className="block text-[11px] text-slate-500">Runs in lane {t.assignee}</span>
            </span>
          </label>
        ))}
        <label htmlFor={`${idPrefix}-title`} className="block text-xs font-medium text-slate-400">
          Title shown on the task board
        </label>
        <input
          id={`${idPrefix}-title`}
          value={title}
          maxLength={MAX_TITLE}
          required
          aria-invalid={result?.field === "title" || undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            if (result?.outcome === "rejected" || result?.outcome === "conflict") setResult(null);
          }}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none disabled:opacity-60"
        />
      </fieldset>

      {!unresolved && (
        <button
          type="submit"
          disabled={sending || !selected || !title.trim()}
          className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-2 text-sm font-medium text-teal-100 hover:bg-teal-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send to Hermes"}
        </button>
      )}

      {result && (
        <div aria-live="polite" className="space-y-2">
          <StateNotice kind={result.outcome === "unconfirmed" || result.outcome === "ambiguous" ? "stale" : "error"} title={restored ? "A submission from this tab was not confirmed" : result.message || outcomeCopy(result.outcome).title}>
            {result.next || outcomeCopy(result.outcome).next}
            {result.code ? <span className="block text-xs text-slate-500">Code: {result.code}</span> : null}
          </StateNotice>
          {locked && result.outcome !== "unconfirmed" && result.outcome !== "ambiguous" && (
            <p className="text-xs text-amber-200/80">An earlier attempt of this submission is still unconfirmed, so its key is kept: retrying cannot create a second task.</p>
          )}
          {unresolved && result.outcome !== "ambiguous" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={sending} onClick={() => void send()} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-50">
                {sending ? "Retrying…" : "Retry same submission"}
              </button>
              {/* Checking the board keeps the pending key, so a later retry is still the same submission. */}
              <a href="/tasks" className="rounded-lg border border-slate-800 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-600">
                Check the task list
              </a>
            </div>
          )}
          {unresolved && (
            <div className="space-y-2">
              {result.outcome === "ambiguous" && (
                <a href="/tasks" className="text-xs font-medium text-teal-300 hover:text-teal-200">
                  Open the task list to check
                </a>
              )}
              <label className="flex items-start gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 accent-teal-500" />I checked the task list (including archived tasks) and no task with this title exists.
              </label>
              <button type="button" disabled={!checked || sending} onClick={() => void send(true)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50">
                Submit as a new request
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
