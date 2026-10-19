"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SOURCE_STATE_TONES, joinSourceCards } from "@/lib/mission-control/source-cards.mjs";
import { DECISION_BOUNDARY } from "@/lib/mission-control/milo-legacy-decision.mjs";

type Approval = {
  id: string;
  title: string;
  status: string;
  approvalLevel: "GREEN" | "YELLOW" | "RED" | string;
  category: string;
  businessReason: string;
  proposedChange: string;
  affectedUrl: string;
  evidence: string;
  riskNote: string;
  decision: string;
  fonzNotes: string;
  approvedAt: string;
  savedStatus?: string | null;
  savedDecision?: string | null;
};

type LinkedTask = { taskId: string; title: string | null; ui?: { state?: string } };
type Links = { ok: true; links: { recordId: string; tasks: LinkedTask[] }[]; observedAt?: string } | { ok: false; code?: string; state?: string };
type Joined = {
  card: { id: string; decision: string | null; status: string | null };
  linkedTasks: LinkedTask[];
  derived: { state: string; label: string; why: string };
  next: string;
};
type Action = "approve" | "reject" | "needs_changes" | "notes";

const TONE: Record<string, string> = {
  ok: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  warn: "border-amber-400/25 bg-amber-500/10 text-amber-200",
  bad: "border-rose-400/25 bg-rose-500/10 text-rose-200",
  info: "border-sky-400/25 bg-sky-500/10 text-sky-200",
  neutral: "border-white/10 bg-white/[0.04] text-white/60",
};

const DECISION_ORDER: Record<string, number> = { pending: 0, "needs changes": 1, approved: 2, rejected: 3 };

function levelTone(level: string) {
  return level === "RED" ? TONE.bad : level === "YELLOW" ? TONE.warn : TONE.ok;
}

function decisionTone(decision: string) {
  const d = decision.toLowerCase();
  return d === "approved" ? TONE.ok : d === "rejected" ? TONE.bad : d === "needs changes" ? TONE.warn : TONE.info;
}

function shortText(value: string, fallback = "Not provided yet") {
  return value?.trim() ? value : fallback;
}

function effectMessage(effect: string | undefined) {
  if (effect === "permission_recorded") return "Approval recorded as permission only. Nothing was started, dispatched or published.";
  if (effect === "approval_already_recorded") return "Approval was already recorded; the saved decision, time and status were kept as they were.";
  if (effect === "decision_already_recorded") return "That decision was already recorded; nothing changed.";
  if (effect === "decision_recorded") return "Decision recorded.";
  if (effect === "fields_saved") return "Notes saved.";
  return "Nothing changed.";
}

export default function MiloApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [links, setLinks] = useState<Links>({ ok: false, code: "not_loaded" });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function loadApprovals() {
    setLoading(true);
    setError("");
    const [response, linkResponse] = await Promise.all([
      fetch("/api/milo-approvals", { cache: "no-store" }),
      fetch("/api/control/record-links", { cache: "no-store" }).catch(() => null),
    ]);
    const data = await response.json().catch(() => null);
    const linkData = linkResponse ? await linkResponse.json().catch(() => null) : null;
    setLoading(false);
    setLinks(linkResponse?.ok && linkData?.ok && Array.isArray(linkData.links) ? linkData : { ok: false, code: linkData?.code || linkData?.state || "unavailable" });

    if (!response.ok || !data?.ok) {
      setError(data?.error || "Could not load Milo approvals.");
      return;
    }

    const nextApprovals = data.approvals || [];
    setApprovals(nextApprovals);
    setNotes(Object.fromEntries(nextApprovals.map((approval: Approval) => [approval.id, approval.fonzNotes || ""])));
  }

  useEffect(() => {
    loadApprovals();
  }, []);

  // Evidence-backed status: raw saved values joined to structured record links by exact id (never by title).
  const joined = useMemo(() => {
    const cards = approvals.map((a) => ({ id: a.id, decision: a.savedDecision ?? null, status: a.savedStatus ?? null }));
    const byId = new Map((joinSourceCards(cards, links) as unknown as Joined[]).map((j) => [j.card.id, j]));
    return [...approvals]
      .sort((a, b) => (DECISION_ORDER[a.decision.toLowerCase()] ?? 4) - (DECISION_ORDER[b.decision.toLowerCase()] ?? 4))
      .map((approval) => ({ approval, view: byId.get(approval.id) as Joined }));
  }, [approvals, links]);

  const summary = useMemo(() => {
    const pending = approvals.filter((item) => item.decision === "Pending").length;
    const approved = approvals.filter((item) => item.decision === "Approved").length;
    const running = joined.filter((j) => j.view?.derived.state === "native_run_open").length;
    return { pending, approved, running, total: approvals.length };
  }, [approvals, joined]);

  async function act(approval: Approval, action: Action) {
    const note = notes[approval.id] ?? "";
    let clearNotes = false;
    if (action === "notes" && !note && approval.fonzNotes) {
      if (!window.confirm("Clear the saved notes on this card?")) return;
      clearNotes = true;
    }
    setSavingId(approval.id);
    setError("");
    setMessage("");
    const response = await fetch("/api/milo-approvals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: approval.id, action, notes: note, clearNotes }),
    });
    const data = await response.json().catch(() => null);
    setSavingId(null);

    if (!response.ok || !data?.ok) {
      setError(data?.error || "Could not update approval.");
      return;
    }

    setMessage(`${approval.title || "Card"}: ${effectMessage(data.effect)}`);
    await loadApprovals();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-5 text-white sm:px-6 lg:px-8">
      <section className="mb-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300/70">Milo approvals</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Record owner decisions on Milo cards</h1>
            <p className="mt-2 text-sm leading-6 text-white/60">
              <span className="font-semibold text-white">{DECISION_BOUNDARY}</span> Recording a decision here does not start, dispatch or publish anything.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href="/approvals" className="text-emerald-300 hover:text-emerald-200">Core Approvals →</Link>
              <Link href="/content" className="text-emerald-300 hover:text-emerald-200">Content review →</Link>
            </div>
          </div>
          <button
            onClick={loadApprovals}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/[0.10]"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Pending decision" value={summary.pending} />
          <Stat label="Approved (permission)" value={summary.approved} />
          <Stat label="Linked run open" value={links.ok ? summary.running : "unknown"} />
          <Stat label="Total cards" value={summary.total} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-white/45">
          {links.ok
            ? "Work status comes from Hermes tasks linked to each card by record id. A saved Airtable status alone is not evidence of a running worker."
            : `Task links could not be read (${links.code ?? "unavailable"}), so whether any work started is unknown. No card is shown as running.`}
        </p>
      </section>

      {error ? <div className="mb-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
      {message ? <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50">Loading Milo approvals...</div>
      ) : approvals.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50">No approval cards yet.</div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {joined.map(({ approval, view }) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              view={view}
              note={notes[approval.id] ?? ""}
              onNote={(value) => setNotes((current) => ({ ...current, [approval.id]: value }))}
              onAction={(action) => act(approval, action)}
              saving={savingId === approval.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
}

function ApprovalCard({ approval, view, note, onNote, onAction, saving }: { approval: Approval; view: Joined; note: string; onNote: (value: string) => void; onAction: (action: Action) => void; saving: boolean }) {
  const alreadyApproved = approval.decision === "Approved";
  const tone = TONE[(SOURCE_STATE_TONES as Record<string, string>)[view.derived.state] ?? "neutral"];
  return (
    <li className="min-w-0 rounded-2xl border border-white/10 bg-[#101010] p-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
        <span className={`rounded-full border px-2 py-0.5 ${levelTone(approval.approvalLevel)}`}>{approval.approvalLevel}</span>
        <span className={`rounded-full border px-2 py-0.5 ${decisionTone(approval.decision)}`}>Decision: {approval.decision}</span>
        <span className={`rounded-full border px-2 py-0.5 normal-case tracking-normal ${tone}`} title={view.derived.why}>{view.derived.label}</span>
      </div>

      <h2 className="mt-2 break-words text-base font-semibold leading-6">{approval.title || "Untitled card"}</h2>
      <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-white/60">{shortText(approval.businessReason, "No summary provided.")}</p>
      <p className="mt-1 break-words text-sm leading-5 text-white/80"><span className="text-white/45">Next:</span> {view.next}</p>

      <details className="group mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-white/70 hover:text-white">
          Details, notes &amp; decision <span className="text-white/35 group-open:hidden">▸</span><span className="hidden text-white/35 group-open:inline">▾</span>
        </summary>
        <div className="space-y-3 border-t border-white/[0.06] p-3 text-sm leading-5 text-white/60">
          <dl className="grid gap-1 sm:grid-cols-[9rem_1fr]">
            <dt className="text-white/40">Saved status</dt>
            <dd className="break-words">{approval.savedStatus ?? "not set"} <span className="text-white/35">(Airtable label, not execution evidence)</span></dd>
            <dt className="text-white/40">Saved decision</dt>
            <dd>{approval.savedDecision ?? "not set"}</dd>
            <dt className="text-white/40">Approved at</dt>
            <dd>{approval.approvedAt || "—"}</dd>
            <dt className="text-white/40">Category</dt>
            <dd>{approval.category || "—"}</dd>
            <dt className="text-white/40">Linked tasks</dt>
            <dd className="break-words">
              {view.derived.state === "linkage_unknown"
                ? "Unknown (task links could not be read)"
                : view.linkedTasks.length
                  ? view.linkedTasks.map((t) => (
                      <Link key={t.taskId} href={`/tasks/${t.taskId}`} className="mr-2 font-mono text-emerald-300 hover:text-emerald-200">{t.taskId}</Link>
                    ))
                  : "None linked"}
            </dd>
          </dl>
          <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-white/75">Change:</span> {shortText(approval.proposedChange)}</p>
          <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-white/75">Evidence:</span> {shortText(approval.evidence)}</p>
          <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-white/75">Risk:</span> {shortText(approval.riskNote)}</p>
          {approval.affectedUrl ? <a className="block break-all text-emerald-300/80 hover:text-emerald-200" href={approval.affectedUrl} target="_blank" rel="noreferrer">{approval.affectedUrl}</a> : null}

          <label className="block text-[11px] font-black uppercase tracking-[0.16em] text-white/40" htmlFor={`notes-${approval.id}`}>Fonz notes</label>
          <textarea
            id={`notes-${approval.id}`}
            value={note}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Add approval notes..."
            className="min-h-20 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80 outline-none placeholder:text-white/25 focus:border-emerald-300/40"
          />

          <p className="text-xs text-white/45">{DECISION_BOUNDARY} There is no execute button here.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button disabled={saving || alreadyApproved} onClick={() => onAction("approve")} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-bold text-black disabled:opacity-50 sm:col-span-2">
              {saving ? "Saving..." : alreadyApproved ? "Approval already recorded" : "Record approval (permission only)"}
            </button>
            <button disabled={saving} onClick={() => onAction("needs_changes")} className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-100 disabled:opacity-50">
              Needs changes
            </button>
            <button disabled={saving} onClick={() => onAction("reject")} className="rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-100 disabled:opacity-50">
              Reject
            </button>
            <button disabled={saving || note === (approval.fonzNotes || "")} onClick={() => onAction("notes")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white/60 disabled:opacity-50 sm:col-span-2">
              Save notes only
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}
