"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  APPROVAL_BOUNDARY,
  LANES,
  POLL_MS,
  boardIsStale,
  buildMiloBoard,
  decisionOp,
  effectMessage,
  isRetryable,
} from "@/lib/mission-control/milo-board.mjs";
import { DECISION_BOUNDARY } from "@/lib/mission-control/milo-approvals-client.mjs";

type Approval = {
  id: string;
  title: string;
  status: string;
  approvalLevel: string;
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
  version?: string;
};
type Blocker = { kind: string | null; reason: string | null; reason_source: string };
type LinkedFact = { task_id: string; status: string; run: string; liveness: string | null; last_outcome: string | null; has_result: boolean; has_attachments: boolean; has_failure: boolean; blocker: Blocker | null; phase?: { phase: string; evidence: string } | null };
type BlockReason = { reason: string; kind: string | null; source: string; owner: "owner" | "hermie" };
type StaleDisposition = { kind: string; why: string; superseded: boolean };
type SupervisorRecord = {
  record_id: string; version: string; class: string; read_at: string | null; read_source: string; attention_task: string | null;
  disposition: { kind: string; version: string; task: string | null; version_current: boolean; observed_matches: boolean | null } | null;
  linked: LinkedFact[];
};
type Board = { fetched_at: string; snapshot: { state: string; code: string | null; read_at: string | null }; supervisor_action: string; records: SupervisorRecord[] };
type BoardCard = {
  id: string; title: string; lane: string; kind: string; label: string; next: string; recovery: "owner" | "hermie" | null; blocker: string | null;
  unknown: boolean; notesAck: boolean; stale: boolean; staleDisposition: StaleDisposition | null; blockReason: BlockReason | null;
  taskId: string | null; linked: LinkedFact[]; supervisor: SupervisorRecord | null; question: string | null; questionFull: boolean; approval: Approval;
};
// Per card: the owner's draft plus the saved value it was seeded from. A draft equal to its base is unedited.
type NoteDraft = { draft: string; base: string };
type Built = { lanes: Record<string, BoardCard[]>; counts: Record<string, number>; anomalies: { kind: string; id?: string; detail: string }[]; total: number;
  needsYouSplit: { owner: number; hermie: number }; unknown: number; approvedPermission: number; state: string };
type Action = "approve" | "reject" | "needs_changes" | "notes";
type PendingOp = { id: string; action: Action; baseVersion: string | null; body: string };

const LANE_TONE: Record<string, string> = {
  ready: "border-sky-400/25 text-sky-200",
  working: "border-emerald-400/30 text-emerald-200",
  review: "border-violet-400/25 text-violet-200",
  needs_you: "border-amber-400/30 text-amber-200",
  done: "border-white/15 text-white/70",
};

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "unknown");
const text = (v: string | null | undefined, fallback = "Not provided") => (v && v.trim() ? v : fallback);

export default function MiloGrowthBoardPage() {
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(NaN);
  const [loading, setLoading] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState("needs_you");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, NoteDraft>>({});
  const [pending, setPending] = useState<Record<string, PendingOp & { error?: string }>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const [feedRes, boardRes] = await Promise.all([
        fetch("/api/milo-approvals", { cache: "no-store" }).catch(() => null),
        fetch("/api/control/milo-board", { cache: "no-store" }).catch(() => null),
      ]);
      const feed = feedRes ? await feedRes.json().catch(() => null) : null;
      const sup = boardRes ? await boardRes.json().catch(() => null) : null;
      if (feedRes?.ok && feed?.ok && Array.isArray(feed.approvals)) {
        const next = feed.approvals as Approval[];
        setApprovals(next);
        setTruncated(feed.truncated === true);
        setFeedError("");
        // Unedited drafts follow the freshly saved notes; edited drafts and drafts behind an unresolved save are kept.
        setNotes((cur) => Object.fromEntries(next.map((a) => [a.id, mergeNote(cur[a.id], a.fonzNotes || "", Boolean(pendingRef.current[a.id]))])));
        if (boardRes?.ok && sup?.ok && sup.board) {
          setBoard(sup.board);
          setBoardError(null);
        } else {
          setBoard(null);
          setBoardError(sup?.code || sup?.state || (boardRes ? `http_${boardRes.status}` : "unreachable"));
        }
        setFetchedAt(Date.now());
        setRefreshFailed(false);
      } else {
        setFeedError(feed?.error || "The Milo card feed could not be read.");
        setRefreshFailed(true);
      }
    } finally {
      inflight.current = false;
      setLoading(false);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    load();
    // Foreground-only polling; a hidden tab makes no requests and refreshes when it becomes visible again.
    const timer = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const built = useMemo(() => (approvals ? (buildMiloBoard({ approvals, board: board as never, boardError: boardError as never, truncated }) as unknown as Built) : null), [approvals, board, boardError, truncated]);
  const stale = approvals !== null && boardIsStale(fetchedAt, now);
  const open = built && openId ? Object.values(built.lanes).flat().find((c) => c.id === openId) ?? null : null;

  async function send(op: PendingOp, title: string) {
    setSavingId(op.id);
    setPending((cur) => ({ ...cur, [op.id]: op }));
    setMessage((cur) => ({ ...cur, [op.id]: "" }));
    let status = 0;
    let data: { ok?: boolean; error?: string; effect?: string; signal?: { state?: string; code?: string } } | null = null;
    try {
      const res = await fetch("/api/milo-approvals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: op.body });
      status = res.status;
      data = await res.json().catch(() => null);
    } catch {
      status = 0;
    }
    setSavingId(null);
    if (status >= 200 && status < 300 && data?.ok) {
      setPending((cur) => { const n = { ...cur }; delete n[op.id]; return n; });
      const sig = data.signal && data.signal.state !== "sent" ? ` The decision is saved, but the supervisor was not notified (${data.signal.code || data.signal.state || "bridge"}); Hermie picks it up at the next full read.` : "";
      setMessage((cur) => ({ ...cur, [op.id]: `${title}: ${effectMessage(data?.effect, op.action)}${sig}` }));
      await load();
      return;
    }
    const error = data?.error || (status === 0 ? "Network error — the save may not have happened." : `Save failed (${status}).`);
    if (isRetryable(status)) setPending((cur) => ({ ...cur, [op.id]: { ...op, error } }));
    else setPending((cur) => { const n = { ...cur }; delete n[op.id]; return n; });
    setMessage((cur) => ({ ...cur, [op.id]: error }));
  }

  function act(approval: Approval, action: Action) {
    const draft = notes[approval.id]?.draft ?? approval.fonzNotes ?? "";
    let r = decisionOp(approval, action, draft);
    if (!r.ok && r.code === "confirm_clear") {
      if (!window.confirm("Clear the saved notes on this card?")) return;
      r = decisionOp(approval, action, draft, { confirmClear: true });
    }
    if (r.ok) send(r.op as PendingOp, approval.title || "Card");
  }

  return (
    <div className="min-h-screen max-w-full overflow-x-clip bg-[#0a0a0a] px-3 py-4 text-white sm:px-6 lg:px-8">
      <header className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Milo Growth Board</h1>
          <p className="mt-1 text-sm text-white/55">{APPROVAL_BOUNDARY}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            <Link href="/approvals" className="text-emerald-300 hover:text-emerald-200">Core Approvals →</Link>
            <Link href="/content" className="text-emerald-300 hover:text-emerald-200">Content review →</Link>
          </div>
          <p className="mt-1 text-xs text-white/40" data-testid="board-meta">
            {built ? `${built.total} cards · approved (permission): ${built.approvedPermission}` : "—"} · fetched {Number.isFinite(fetchedAt) ? fmt(new Date(fetchedAt).toISOString()) : "never"}
            {board?.snapshot?.read_at ? ` · supervisor read ${fmt(board.snapshot.read_at)}` : ""}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white/75 hover:bg-white/[0.1] disabled:opacity-50">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> {loading ? "Refreshing" : "Refresh"}
        </button>
      </header>

      {feedError ? <Banner tone="bad" testId="feed-error">{feedError}{approvals ? ` Showing the last good read from ${fmt(new Date(fetchedAt).toISOString())}.` : ""}</Banner> : null}
      {stale || refreshFailed ? <Banner tone="warn" testId="stale-banner">Stale: this board was last refreshed {Number.isFinite(fetchedAt) ? fmt(new Date(fetchedAt).toISOString()) : "never"}. Refresh before acting.</Banner> : null}
      {built && built.state !== "ok" ? (
        <Banner tone="bad" testId="supervisor-unknown">Supervisor state unreadable ({boardError}). Approved cards are marked Unknown in Needs You until Hermie restores the read — none are shown as ready or running.</Banner>
      ) : null}
      {built?.anomalies.length ? (
        <Banner tone="warn" testId="anomalies"><span className="font-semibold">Source anomalies:</span> {built.anomalies.map((a) => a.detail).join(" ")}</Banner>
      ) : null}

      {!approvals ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/50" data-testid="board-loading">{feedError ? "The board cannot be shown without the card feed." : "Loading the board…"}</div>
      ) : built ? (
        <>
          <nav className="mb-3 grid grid-cols-5 gap-1 lg:hidden" role="tablist" aria-label="Board lanes">
            {LANES.map((l) => (
              <button key={l.id} role="tab" aria-selected={tab === l.id} data-testid={`tab-${l.id}`} onClick={() => setTab(l.id)}
                className={`min-w-0 rounded-lg border px-1 py-2 text-center text-[11px] font-semibold leading-tight ${tab === l.id ? `bg-white/[0.08] ${LANE_TONE[l.id]}` : "border-white/10 text-white/50"}`}>
                <span className="block truncate">{l.label}</span>
                <span className="block text-base">{built.counts[l.id]}</span>
              </button>
            ))}
          </nav>
          <div className="grid gap-3 lg:grid-cols-5">
            {LANES.map((l) => (
              <section key={l.id} data-testid={`lane-${l.id}`} aria-label={l.label} className={`min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[0.025] ${tab === l.id ? "flex" : "hidden"} lg:flex`}>
                <div className={`border-b border-white/10 px-3 py-2 ${LANE_TONE[l.id]}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-bold">{l.label}</h2>
                    <span className="text-lg font-semibold" data-testid={`count-${l.id}`}>{built.counts[l.id]}</span>
                  </div>
                  <p className="text-[11px] text-white/45">
                    {l.id === "needs_you" ? `${built.needsYouSplit.owner} for you · ${built.needsYouSplit.hermie} Hermie${built.unknown ? ` · ${built.unknown} unknown` : ""}` : l.hint}
                  </p>
                </div>
                <ul className="flex flex-col gap-2 p-2 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
                  {built.lanes[l.id].length === 0 ? <li className="px-1 py-3 text-xs text-white/35">Nothing here.</li> : null}
                  {built.lanes[l.id].map((c) => (
                    <CardTile key={c.id} c={c} onOpen={() => setOpenId(c.id)} pending={Boolean(pending[c.id])} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}

      {open ? (
        <Details
          c={open}
          note={notes[open.id]?.draft ?? open.approval.fonzNotes ?? ""}
          onNote={(v) => setNotes((cur) => ({ ...cur, [open.id]: { draft: v, base: cur[open.id]?.base ?? open.approval.fonzNotes ?? "" } }))}
          onAction={(a) => act(open.approval, a)}
          onRetry={() => pending[open.id] && send(pending[open.id], open.title)}
          pending={pending[open.id] ?? null}
          saving={savingId === open.id}
          message={message[open.id] ?? ""}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function mergeNote(cur: NoteDraft | undefined, saved: string, locked: boolean): NoteDraft {
  if (!cur) return { draft: saved, base: saved };
  if (locked || cur.draft !== cur.base) return { draft: cur.draft, base: locked ? cur.base : saved };
  return { draft: saved, base: saved };
}

function Banner({ tone, children, testId }: { tone: "bad" | "warn"; children: React.ReactNode; testId: string }) {
  const cls = tone === "bad" ? "border-rose-400/25 bg-rose-500/10 text-rose-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100";
  return <div data-testid={testId} role="status" className={`mb-3 break-words rounded-xl border p-3 text-sm ${cls}`}>{children}</div>;
}

function CardTile({ c, onOpen, pending }: { c: BoardCard; onOpen: () => void; pending: boolean }) {
  return (
    <li data-testid={`card-${c.id}`} data-kind={c.kind} className={`min-w-0 rounded-xl border bg-[#101010] p-2.5 ${c.unknown ? "border-rose-400/40" : "border-white/10"}`}>
      <button onClick={onOpen} className="block w-full min-w-0 text-left" aria-label={`Open details for ${c.title}`}>
        <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
          <span className={`rounded-full border px-1.5 py-0.5 ${c.unknown ? "border-rose-400/40 text-rose-200" : "border-white/15 text-white/65"}`}>{c.label}</span>
          {c.recovery ? <span className={`rounded-full px-1.5 py-0.5 ${c.recovery === "owner" ? "bg-amber-400/15 text-amber-200" : "bg-white/[0.06] text-white/55"}`}>{c.recovery === "owner" ? "You" : "Hermie"}</span> : null}
          {c.stale ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-200">stale</span> : null}
          {c.staleDisposition?.superseded ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-200" data-testid="stale-disposition">old “{c.staleDisposition.kind}” superseded</span> : null}
          {c.notesAck ? <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200" data-testid="notes-badge">notes saved</span> : null}
          {pending ? <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-rose-200">unsaved</span> : null}
        </div>
        <h3 className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5">{c.title}</h3>
        <p className="mt-0.5 line-clamp-3 break-words text-xs leading-4 text-white/60" data-testid="card-next">{c.blocker ? <span className="text-amber-200/80">{c.blocker}. </span> : null}{c.next}</p>
        {c.question ? <p className="mt-1 line-clamp-2 break-words text-xs leading-4 text-amber-100/80" data-testid="card-question">{c.questionFull ? "Request: " : "Request (first line): "}{c.question}</p> : null}
      </button>
      {c.taskId ? <Link href={`/tasks/${c.taskId}`} className="mt-1 inline-block font-mono text-[11px] text-emerald-300 hover:text-emerald-200" data-testid="task-link">Task {c.taskId} →</Link> : null}
    </li>
  );
}

function Details({ c, note, onNote, onAction, onRetry, pending, saving, message, onClose }: {
  c: BoardCard; note: string; onNote: (v: string) => void; onAction: (a: Action) => void; onRetry: () => void;
  pending: (PendingOp & { error?: string }) | null; saving: boolean; message: string; onClose: () => void;
}) {
  const a = c.approval;
  const approved = (a.decision || "").toLowerCase() === "approved";
  const locked = saving || Boolean(pending);
  const sup = c.supervisor;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`Card details: ${c.title}`} data-testid="details"
        className="h-full w-full max-w-xl overflow-y-auto overscroll-contain border-l border-white/10 bg-[#0d0d0d] p-4 text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold">{c.title}</h2>
          <button onClick={onClose} aria-label="Close details" className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/70 hover:bg-white/[0.08]"><X className="size-4" /></button>
        </div>
        <p className="mt-1 text-white/80"><span className="font-semibold">{c.label}.</span> {c.blocker ? `${c.blocker}. ` : ""}{c.next}</p>
        {c.question ? <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-amber-100" data-testid="input-question"><span className="font-semibold">{c.questionFull ? "Request on the card:" : "Request on the card (first line; full text under Change):"}</span> {c.question}</p> : null}
        {c.notesAck ? <p className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2 text-emerald-100" data-testid="notes-ack">
          {c.kind === "notes_saved" ? "Your saved notes are on the card. Hermie has not read this version yet; no re-approval is needed." : "Saved notes present. Hermie reads them before asking you to repeat anything; no re-approval is needed."}
        </p> : null}
        {c.blockReason ? <p className="mt-2 break-words rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-amber-100" data-testid="block-reason">
          <span className="font-semibold">Native block reason{c.blockReason.kind ? ` (${c.blockReason.kind})` : ""}:</span> {c.blockReason.reason}
          <span className="mt-1 block text-xs text-amber-100/70">{c.blockReason.owner === "owner" ? "Owner input may be needed — Hermie confirms first." : "Hermie recovery — no owner input needed."} Source: {c.blockReason.source === "blocked_event" ? "task block event" : "task failure excerpt"}. Full output on the task page.</span>
        </p> : null}
        {c.staleDisposition ? <p className="mt-2 break-words rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-amber-100" data-testid="stale-disposition-detail">
          Hermie’s earlier “{c.staleDisposition.kind}” decision is stale ({c.staleDisposition.why}). {c.staleDisposition.superseded ? "New linked work takes precedence; the old decision is not applied." : "Not settled until Hermie reconciles it."}
        </p> : null}

        <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1 text-white/65">
          <dt className="text-white/40">Decision</dt><dd>{a.savedDecision ?? "not set"}</dd>
          <dt className="text-white/40">Saved status</dt><dd className="break-words">{a.savedStatus ?? "not set"} <span className="text-white/35">(label, not execution evidence)</span></dd>
          <dt className="text-white/40">Approved at</dt><dd>{a.approvedAt || "—"}</dd>
          <dt className="text-white/40">Level / category</dt><dd>{a.approvalLevel || "—"} · {a.category || "—"}</dd>
          <dt className="text-white/40">Card version</dt><dd className="font-mono text-xs">{a.version ?? "unknown"}</dd>
          <dt className="text-white/40">Supervisor</dt>
          <dd className="break-words text-xs" data-testid="supervisor-facts">
            {sup ? `${sup.class} · read v${sup.version.slice(0, 8)} at ${fmt(sup.read_at)} (${sup.read_source === "fresh_record" ? "fresh card read" : "snapshot"})${sup.version !== a.version ? " · OLDER than the card" : ""}${sup.disposition ? ` · Hermie: ${sup.disposition.kind}${sup.disposition.version_current ? "" : " (stale)"}${sup.disposition.observed_matches === false ? " (task state changed since)" : ""}` : ""}` : "not read"}
          </dd>
          <dt className="text-white/40">Linked tasks</dt>
          <dd className="break-words">
            {c.linked.length ? c.linked.map((t) => (
              <span key={t.task_id} className="mr-2 block">
                <Link href={`/tasks/${t.task_id}`} className="font-mono text-emerald-300 hover:text-emerald-200">{t.task_id}</Link>{" "}
                <span className="text-xs text-white/45">{t.status}{t.liveness ? ` · worker ${t.liveness}` : ""}{t.phase ? ` · ${t.phase.phase === "review" ? "reviewer run" : t.phase.phase === "implementation" ? "author run" : "phase unknown"}${t.phase.evidence === "prior_outcome" ? " (from last outcome)" : ""}` : ""}{t.last_outcome && t.last_outcome !== "none" ? ` · last ${t.last_outcome}` : ""}{t.has_result ? " · result" : ""}{t.has_attachments ? " · files" : ""}</span>
              </span>
            )) : "None linked"}
          </dd>
        </dl>

        <div className="mt-3 space-y-2 text-white/65">
          <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-white/80">Why:</span> {text(a.businessReason)}</p>
          <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-white/80">Change:</span> {text(a.proposedChange)}</p>
          <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-white/80">Evidence:</span> {text(a.evidence)}</p>
          <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-white/80">Risk:</span> {text(a.riskNote)}</p>
          {a.affectedUrl ? <a className="block break-all text-emerald-300/80 hover:text-emerald-200" href={a.affectedUrl} target="_blank" rel="noreferrer">{a.affectedUrl}</a> : null}
        </div>

        <label className="mt-4 block text-[11px] font-black uppercase tracking-[0.16em] text-white/40" htmlFor={`notes-${a.id}`}>Fonz notes</label>
        <textarea id={`notes-${a.id}`} value={note} disabled={locked} onChange={(e) => onNote(e.target.value)} placeholder="Add notes or answer the request…"
          className="mt-1 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/85 outline-none focus:border-emerald-300/40 disabled:opacity-60" />

        {message ? <p className="mt-2 break-words rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white/80" data-testid="action-message" role="status">{message}</p> : null}
        {pending && !saving ? (
          <div className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-rose-100" data-testid="retry-panel">
            <p>Unsaved: <span className="font-mono">{pending.action}</span> on this card{pending.baseVersion ? ` (card v${pending.baseVersion.slice(0, 8)})` : ""}. Retry sends the same request.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={onRetry} className="rounded-lg bg-rose-200 px-3 py-1.5 text-sm font-bold text-black">Retry {pending.action}</button>
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-xs text-white/45">{DECISION_BOUNDARY} There is no execute button here.</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button disabled={locked || approved} onClick={() => onAction("approve")} className="rounded-xl bg-emerald-300 px-3 py-2 font-bold text-black disabled:opacity-50 sm:col-span-2">
            {saving ? "Saving…" : approved ? "Approval already recorded" : "Record approval (permission only)"}
          </button>
          <button disabled={locked} onClick={() => onAction("needs_changes")} className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 font-bold text-amber-100 disabled:opacity-50">Needs changes</button>
          <button disabled={locked} onClick={() => onAction("reject")} className="rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 font-bold text-rose-100 disabled:opacity-50">Reject</button>
          <button disabled={locked || note === (a.fonzNotes || "")} onClick={() => onAction("notes")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-bold text-white/70 disabled:opacity-50 sm:col-span-2">Save notes only</button>
        </div>
      </aside>
    </div>
  );
}
