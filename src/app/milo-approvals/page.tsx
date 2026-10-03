"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";

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
};

const columns = [
  "Drafted by Milo",
  "Hermie Reviewed",
  "Needs Fonz Approval",
  "Approved",
  "In Progress",
  "Verified / Done",
  "Rejected / Parked",
];

function levelClass(level: string) {
  if (level === "RED") return "border-rose-400/25 bg-rose-500/10 text-rose-200";
  if (level === "YELLOW") return "border-amber-400/25 bg-amber-500/10 text-amber-200";
  return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
}

function shortText(value: string, fallback = "Not provided yet") {
  return value?.trim() ? value : fallback;
}

export default function MiloApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function loadApprovals() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/milo-approvals", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    setLoading(false);

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

  const summary = useMemo(() => {
    const pending = approvals.filter((item) => item.decision === "Pending" || item.status === "Needs Fonz Approval").length;
    const red = approvals.filter((item) => item.approvalLevel === "RED" && item.status !== "Verified / Done").length;
    const approved = approvals.filter((item) => item.decision === "Approved" || item.status === "Approved").length;
    return { pending, red, approved, total: approvals.length };
  }, [approvals]);

  async function act(id: string, action: "approve" | "reject" | "needs_changes" | "notes") {
    setSavingId(id);
    setError("");
    const response = await fetch("/api/milo-approvals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, notes: notes[id] || "" }),
    });
    const data = await response.json().catch(() => null);
    setSavingId(null);

    if (!response.ok || !data?.ok) {
      setError(data?.error || "Could not update approval.");
      return;
    }

    await loadApprovals();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-5 text-white sm:px-6 lg:px-8">
      <section className="mb-5 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/25 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300/70">Milo approval board</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Approve the work before anything goes public.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              This board is where Milo and Hermie route YELLOW/RED work. Approval does <span className="font-semibold text-white">not</span> auto-publish or change the website. It authorizes Milo/Hermie to execute, then verify.
            </p>
          </div>
          <button
            onClick={loadApprovals}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.10]"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Pending" value={summary.pending} icon={<Clock3 className="size-5" />} />
          <SummaryCard label="RED risk" value={summary.red} icon={<ShieldAlert className="size-5" />} tone="red" />
          <SummaryCard label="Approved" value={summary.approved} icon={<CheckCircle2 className="size-5" />} tone="green" />
          <SummaryCard label="Total cards" value={summary.total} icon={<AlertTriangle className="size-5" />} />
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50">Loading Milo approvals...</div>
      ) : approvals.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50">No approval cards yet.</div>
      ) : (
        <div className="overflow-x-auto pb-4 [scrollbar-width:thin]">
          <div className="grid min-w-[1180px] grid-cols-7 gap-3">
            {columns.map((column) => {
              const cards = approvals.filter((item) => item.status === column);
              return (
                <section key={column} className="rounded-3xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <h2 className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{column}</h2>
                    <span className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-white/45">{cards.length}</span>
                  </div>
                  <div className="space-y-3">
                    {cards.map((approval) => (
                      <ApprovalCard
                        key={approval.id}
                        approval={approval}
                        note={notes[approval.id] || ""}
                        onNote={(value) => setNotes((current) => ({ ...current, [approval.id]: value }))}
                        onAction={(action) => act(approval.id, action)}
                        saving={savingId === approval.id}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, tone = "neutral" }: { label: string; value: number; icon: React.ReactNode; tone?: "neutral" | "red" | "green" }) {
  const toneClass = tone === "red" ? "text-rose-200 bg-rose-500/10 border-rose-400/20" : tone === "green" ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/20" : "text-white/70 bg-white/[0.04] border-white/10";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function ApprovalCard({ approval, note, onNote, onAction, saving }: { approval: Approval; note: string; onNote: (value: string) => void; onAction: (action: "approve" | "reject" | "needs_changes" | "notes") => void; saving: boolean }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#101010] p-3 shadow-xl shadow-black/20">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${levelClass(approval.approvalLevel)}`}>
          {approval.approvalLevel}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
          {approval.category || "Approval"}
        </span>
      </div>

      <h3 className="text-sm font-semibold leading-5 text-white">{approval.title}</h3>
      <p className="mt-2 text-xs leading-5 text-white/50">{shortText(approval.businessReason)}</p>

      <div className="mt-3 space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-white/48">
        <p><span className="font-semibold text-white/70">Change:</span> {shortText(approval.proposedChange)}</p>
        <p><span className="font-semibold text-white/70">Evidence:</span> {shortText(approval.evidence)}</p>
        <p><span className="font-semibold text-white/70">Risk:</span> {shortText(approval.riskNote)}</p>
        {approval.affectedUrl ? <a className="block break-all text-emerald-300/80 hover:text-emerald-200" href={approval.affectedUrl} target="_blank">{approval.affectedUrl}</a> : null}
      </div>

      <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Fonz notes</label>
      <textarea
        value={note}
        onChange={(event) => onNote(event.target.value)}
        placeholder="Add approval notes..."
        className="mt-2 min-h-20 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/80 outline-none placeholder:text-white/25 focus:border-emerald-300/40"
      />

      <div className="mt-3 grid grid-cols-1 gap-2">
        <button disabled={saving} onClick={() => onAction("approve")} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-bold text-black disabled:opacity-50">
          {saving ? "Saving..." : "Approve"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={saving} onClick={() => onAction("needs_changes")} className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-50">
            Needs changes
          </button>
          <button disabled={saving} onClick={() => onAction("reject")} className="rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100 disabled:opacity-50">
            Reject
          </button>
        </div>
        <button disabled={saving} onClick={() => onAction("notes")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/60 disabled:opacity-50">
          Save notes only
        </button>
      </div>
    </article>
  );
}
