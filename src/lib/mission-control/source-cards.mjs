// Source-card (Milo Airtable record) truth. Mirrors the bridge's lib/record-links.js sourceCardState() exactly:
// Approved is permission, not a started worker; a saved "In Progress" without an open linked native run is reported as
// saved/unverified; "running" exists only when a structurally linked native task has an open run. Linkage comes only
// from GET /v0/record-links (workspace segment approved-execution/<recordId>) — titles are never matched.

export function sourceCardState({ decision, savedStatus, linkedTasks = [] }) {
  const states = linkedTasks.map((t) => t && t.ui && t.ui.state);
  const saved = typeof savedStatus === "string" ? savedStatus : null;
  const r = (state, label, why) => ({ state, label, why, saved_status: saved, linked_tasks: linkedTasks.length });
  if (states.includes("running_unverified")) return r("native_run_open", "Running (native run open)", "a linked native task has an open run; heartbeat is unavailable so liveness is unverified");
  if (states.includes("review")) return r("native_review", "Ready for review", "a linked native task is in review");
  if (states.some((s) => ["failed", "blocked", "interrupted", "queued_after_failure"].includes(s))) return r("native_blocked", "Blocked", "a linked native task is blocked, failed or interrupted");
  if (states.some((s) => ["queued", "waiting_approval"].includes(s))) return r("native_queued", "Queued (not started)", "a linked native task is queued; no worker has an open run");
  if (states.length && states.every((s) => s === "completed" || s === "completed_unverified" || s === "archived")) {
    return r("native_done", "Work done (not proof of publication)", "all linked native tasks are done; publication needs its own provider confirmation");
  }
  if (states.length) return r("native_unknown", "Unknown", "linked native task state unrecognised");
  if (saved && /done|complete|verified/i.test(saved)) return r("saved_done_unverified", `Saved: ${saved} (no linked native task)`, "saved status only; no structured native linkage to verify it");
  if (saved && /progress|running|started/i.test(saved)) return r("saved_status_unverified", `Saved: ${saved} — not verified running`, "no linked native task or open run; the saved status is not evidence of a started worker");
  if (decision === "Approved") return r("approved_awaiting_start", "Approved — awaiting start", "approval is permission only; no linked native task exists yet");
  return r("saved_status_unverified", saved ? `Saved: ${saved}` : "No status", "saved status only; no structured native linkage");
}

export const SOURCE_STATE_TONES = {
  native_run_open: "info",
  native_review: "warn",
  native_blocked: "bad",
  native_queued: "neutral",
  native_done: "ok",
  native_unknown: "neutral",
  saved_done_unverified: "neutral",
  saved_status_unverified: "warn",
  approved_awaiting_start: "neutral",
  linkage_unknown: "neutral",
};

const NEXT = {
  native_run_open: "Follow the linked task; its run receipt decides the result.",
  native_review: "Open the linked task and review its result files.",
  native_blocked: "Open the linked task to see why it stopped.",
  native_queued: "Queued on the board; no worker has started it yet.",
  native_done: "Review the linked result. Publishing still needs its own confirmation.",
  native_unknown: "Open the linked task to check its state.",
  saved_done_unverified: "Saved as done in Airtable only; nothing in Hermes confirms it.",
  saved_status_unverified: "Not running: no Hermes task is linked. Start it as a task, or correct the Airtable status.",
  approved_awaiting_start: "Approved, but no Hermes task has been started for it yet.",
  linkage_unknown: "Task links could not be read, so whether work started is unknown.",
};

/** One short owner next-action line per state. */
export function sourceNextAction(state, decision) {
  const d = typeof decision === "string" ? decision.toLowerCase() : "";
  if (!d || d === "pending") return "Needs your decision in the Milo approvals module.";
  if (d === "rejected") return "Rejected — no action needed.";
  if (d === "needs changes") return "Waiting for Milo to revise it.";
  return NEXT[state] ?? NEXT.native_unknown;
}

/**
 * Join cards to record links by exact record id and derive each card's state. A failed record-link read never
 * upgrades or downgrades a card: it becomes "linkage_unknown" (never running). Every card is kept, in order.
 * @param {{ id: string, decision: string | null, status: string | null }[]} cards
 * @param {{ ok: boolean, links?: { recordId: string, tasks: any[] }[] }} links
 */
export function joinSourceCards(cards, links) {
  const byRecord = new Map();
  if (links && links.ok) for (const l of links.links) byRecord.set(l.recordId, l.tasks);
  return cards.map((card) => {
    if (!links || !links.ok) {
      return {
        card,
        linkedTasks: [],
        derived: { state: "linkage_unknown", label: card.status ? `Saved: ${card.status} — not verified` : "Not verified", why: "task links could not be read", saved_status: card.status, linked_tasks: 0 },
        next: sourceNextAction("linkage_unknown", card.decision),
      };
    }
    const linkedTasks = byRecord.get(card.id) ?? [];
    const derived = sourceCardState({ decision: card.decision, savedStatus: card.status, linkedTasks });
    return { card, linkedTasks, derived, next: sourceNextAction(derived.state, card.decision) };
  });
}

/** Counts per derived state; "running" can only come from native_run_open. */
export function sourceStateCounts(joined) {
  const counts = {};
  for (const j of joined) counts[j.derived.state] = (counts[j.derived.state] ?? 0) + 1;
  return counts;
}
