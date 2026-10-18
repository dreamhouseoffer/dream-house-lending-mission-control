"use client";
// Disabled-by-default owner-challenge panel: read approval -> request challenge -> show the exact signed terms ->
// owner gesture navigator.credentials.get -> challenge decision. Every gate fails closed to a disabled control
// (panelGate, approvalEligibility). The browser sends no identity claims; the signed cookie is the only identity and
// the bridge's pinned-key verifier is the only judge. An approval is permission only: nothing executes from here.
import { useEffect, useRef, useState } from "react";
import { DisabledAction, StateNotice, StatusChip } from "@/components/mc/ui";
import {
  DECISIONS,
  MAX_NOTE,
  approvalEligibility,
  buildDecideBody,
  buildIssueBody,
  classifyDecideResponse,
  classifyIssueResponse,
  classifyWebAuthnError,
  decisionResultCopy,
  normalizeNote,
  panelGate,
  requestOptions,
  serializeAssertion,
  verifyIssuedChallenge,
} from "@/lib/mission-control/owner-challenge-ui.mjs";

type Availability = { available: true; rpId: string; origin: string } | { available: false; reason: string };
type Approval = { approval_id: string; state: string; [k: string]: unknown };
type Terms = {
  decision: string; approval_id: string; row_version: number; task_id: string; requested_by: string | null;
  artifact: { id: string; version: number; sha256: string }; action: string | null; destination: string | null;
  max_cost_cents: number | null; not_before: string | null; expires_at: string; credential_id: string; rp_id: string;
  challenge_expires_at: string;
};
type Verified = { challenge: Record<string, unknown>; terms: Terms };
type Notice = { kind: "error" | "stale" | "info"; title: string; detail?: string; code?: string };

const LABEL: Record<string, string> = { approve: "Approve", reject: "Reject", revise: "Request revision" };

function readBrowserSupport() {
  return {
    secureContext: typeof window !== "undefined" && window.isSecureContext === true,
    publicKeyCredential: typeof window !== "undefined" && typeof window.PublicKeyCredential === "function",
    credentialsGet: typeof navigator !== "undefined" && typeof navigator.credentials?.get === "function",
  };
}

async function postJson(path: string, body: string) {
  const res = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body });
  return { status: res.status, data: await res.json().catch(() => null) };
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-xs text-slate-200">{children}</dd>
    </div>
  );
}

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function OwnerChallengePanel({ approvalId, availability }: { approvalId: string; availability: Availability }) {
  const [gate, setGate] = useState<ReturnType<typeof panelGate> | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decision, setDecision] = useState("approve");
  const [note, setNote] = useState("");
  const [verified, setVerified] = useState<Verified | null>(null);
  const [usedNote, setUsedNote] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string | null>(null); // signed decision body kept for exact retry
  const [busy, setBusy] = useState<"" | "issuing" | "signing" | "deciding">("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<{ approval: Approval; replay: boolean } | null>(null);
  const inflight = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const g = panelGate({ server: availability, location: { origin: window.location.origin, hostname: window.location.hostname }, browser: readBrowserSupport() });
    setGate(g);
    if (!g.enabled) return;
    let live = true;
    fetch(`/api/control/approvals/${encodeURIComponent(approvalId)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }))
      .then(({ status, data }) => {
        if (!live) return;
        if (status === 200 && data?.ok === true && data.approval?.approval_id === approvalId) setApproval(data.approval);
        else setLoadError(typeof data?.code === "string" ? data.code : `http_${status}`);
      })
      .catch(() => live && setLoadError("network"));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, [approvalId, availability]);

  if (!gate) return <DisabledAction label="Decide with passkey" reason="Checking whether owner approval is available…" />;
  if (!gate.enabled) return <DisabledAction label="Decide with passkey" reason={gate.message} />;
  if (loadError) return <DisabledAction label="Decide with passkey" reason={`The approval could not be read (${loadError}).`} />;
  if (!approval) return <DisabledAction label="Decide with passkey" reason="Reading the approval…" />;

  if (result) {
    const copy = decisionResultCopy(result.approval);
    return (
      <div aria-live="polite" className="space-y-2">
        <StateNotice kind={copy.tone === "warn" ? "stale" : "info"} title={copy.title}>
          {copy.detail}
          {result.replay ? <span className="block text-xs text-slate-500">This decision was already recorded; the bridge returned the same result.</span> : null}
        </StateNotice>
      </div>
    );
  }

  const eligibility = approvalEligibility(approval);
  if (!eligibility.eligible) return <DisabledAction label="Decide with passkey" reason={eligibility.message} />;

  async function requestChallenge() {
    if (inflight.current || !approval) return;
    const n = normalizeNote(decision, note);
    if (!n.ok) {
      setNotice({ kind: "error", title: n.code === "revision_note_required" ? "A revision request needs a note." : "The note is not valid.", code: n.code });
      return;
    }
    inflight.current = true;
    setBusy("issuing");
    setNotice(null);
    let r;
    try {
      r = classifyIssueResponse(await postJson(`/api/control/approvals/${approvalId}/challenge`, buildIssueBody(approval, decision, n.note)));
    } catch {
      r = classifyIssueResponse({ status: 0, data: null, network: true });
    }
    if (r.outcome === "issued") {
      const v = await verifyIssuedChallenge(r.challenge, { approval, decision, note: n.note, rpId: gate && gate.enabled ? gate.rpId : "" });
      if (v.ok) {
        setVerified(v as Verified);
        setUsedNote(n.note);
      } else setNotice({ kind: "error", title: "The issued challenge did not match the terms shown. Nothing was signed.", code: v.code });
    } else {
      setNotice({ kind: r.outcome === "stale" ? "stale" : "error", title: r.message, code: r.code, detail: r.retryAfter ? `Retry after ${r.retryAfter}s.` : undefined });
    }
    inflight.current = false;
    setBusy("");
  }

  async function sendDecision(body: string) {
    setBusy("deciding");
    let r;
    try {
      r = classifyDecideResponse(await postJson(`/api/control/approvals/${approvalId}/decision`, body));
    } catch {
      r = classifyDecideResponse({ status: 0, data: null, network: true });
    }
    if (r.outcome === "decided") {
      setPendingBody(null);
      setResult({ approval: r.approval, replay: r.replay });
    } else if (r.outcome === "unconfirmed") {
      setNotice({ kind: "stale", title: r.message, code: r.code });
    } else {
      // Definite refusal: the signed body is spent; a new challenge is needed.
      setPendingBody(null);
      setVerified(null);
      setNotice({ kind: r.outcome === "stale" ? "stale" : "error", title: r.message, code: r.code });
    }
  }

  async function signAndDecide() {
    // Called directly from the click so the WebAuthn prompt keeps the owner's user activation.
    if (inflight.current || !verified) return;
    inflight.current = true;
    setNotice(null);
    if (pendingBody) {
      await sendDecision(pendingBody); // exact retry of an unconfirmed signed decision; the bridge deduplicates
    } else {
      setBusy("signing");
      const ctrl = new AbortController();
      abort.current = ctrl;
      let cred: unknown = null;
      try {
        cred = await navigator.credentials.get({ publicKey: requestOptions(verified) as PublicKeyCredentialRequestOptions, signal: ctrl.signal });
      } catch (e) {
        const w = classifyWebAuthnError(e);
        setNotice({ kind: w.outcome === "cancelled" ? "info" : "error", title: w.message, code: w.outcome });
      }
      abort.current = null;
      if (cred) {
        const s = serializeAssertion(cred, verified.terms.credential_id);
        if (!s.ok) setNotice({ kind: "error", title: "The authenticator answer was not usable. Nothing was sent.", code: s.code });
        else {
          const body = buildDecideBody(verified.challenge, usedNote, s.assertion);
          setPendingBody(body);
          await sendDecision(body);
        }
      }
    }
    inflight.current = false;
    setBusy("");
  }

  function discardChallenge() {
    abort.current?.abort();
    setVerified(null);
    setPendingBody(null);
    setNotice(null);
  }

  const t = verified?.terms;
  return (
    <div className="space-y-3">
      {!verified ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void requestChallenge();
          }}
        >
          <fieldset className="space-y-2" disabled={busy !== ""}>
            <legend className="text-xs font-medium text-slate-400">Owner decision</legend>
            <div className="flex flex-wrap gap-3">
              {DECISIONS.map((d: string) => (
                <label key={d} className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="radio" name="owner-decision" value={d} checked={decision === d} onChange={() => setDecision(d)} className="accent-teal-500" />
                  {LABEL[d]}
                </label>
              ))}
            </div>
            <label htmlFor="owner-note" className="block text-xs font-medium text-slate-400">
              Note {decision === "revise" ? "(required)" : "(optional)"}
            </label>
            <textarea
              id="owner-note"
              value={note}
              maxLength={MAX_NOTE}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none disabled:opacity-60"
            />
          </fieldset>
          <button type="submit" disabled={busy !== ""} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "issuing" ? "Preparing…" : "Prepare challenge"}
          </button>
          <p className="text-xs text-slate-500">Preparing a challenge signs nothing. You will see the exact terms before the passkey prompt.</p>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3">
            <p className="text-sm font-medium text-slate-100">
              Your passkey will sign exactly these terms: <StatusChip tone="accent">{LABEL[t!.decision] ?? t!.decision}</StatusChip>
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Term label="Approval / row version">{t!.approval_id} · v{t!.row_version}</Term>
              <Term label="Task">{t!.task_id}</Term>
              <Term label="Artifact">{t!.artifact.id} · version {t!.artifact.version}</Term>
              <Term label="Artifact sha256">{t!.artifact.sha256}</Term>
              <Term label="Action">{show(t!.action)}</Term>
              <Term label="Destination">{show(t!.destination)}</Term>
              <Term label="Max cost (cents)">{show(t!.max_cost_cents)}</Term>
              <Term label="Requested by">{show(t!.requested_by)}</Term>
              <Term label="Window">{show(t!.not_before)} → {show(t!.expires_at)}</Term>
              <Term label="Note">{usedNote === null ? "none" : usedNote}</Term>
              <Term label="Site (rp_id)">{t!.rp_id}</Term>
              <Term label="Challenge expires">{t!.challenge_expires_at}</Term>
            </dl>
            <p className="mt-3 text-xs text-slate-400">Approving authorizes only. It does not execute, send or publish anything; external execution is not connected.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== ""}
              onClick={() => void signAndDecide()}
              className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-2 text-sm font-medium text-teal-100 hover:bg-teal-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "signing" ? "Waiting for passkey…" : busy === "deciding" ? "Sending decision…" : pendingBody ? "Retry same signed decision" : `${LABEL[t!.decision] ?? "Decide"} with passkey`}
            </button>
            {busy === "signing" ? (
              <button type="button" onClick={() => abort.current?.abort()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500">
                Cancel passkey prompt
              </button>
            ) : (
              !pendingBody && (
                <button type="button" disabled={busy !== ""} onClick={discardChallenge} className="rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-400 hover:border-slate-600 disabled:opacity-50">
                  Discard challenge
                </button>
              )
            )}
          </div>
        </div>
      )}
      {notice && (
        <div aria-live="polite">
          <StateNotice kind={notice.kind} title={notice.title}>
            {notice.detail}
            {notice.code ? <span className="block text-xs text-slate-500">Code: {notice.code}</span> : null}
          </StateNotice>
        </div>
      )}
    </div>
  );
}
