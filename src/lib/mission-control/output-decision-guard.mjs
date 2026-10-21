// Server owner-decision guard + forward (route handlers only, via output-review.ts). Pure of env/auth so the exact
// wrapper is testable with fake transports. Every answer carries its provenance:
//  - "pre_send_definitive": this request's own validated reads refuse the decision; the bridge was NOT called.
//  - "pre_send_unavailable": a read was missing/unreadable; the bridge was NOT called, but an earlier same-key send may
//    have been, so the outcome stays unknown and the browser keeps its pending same-key retry.
//  - "post_send": the bridge was called; its answer is settled by postOutputDecision alone (never inferred safe here).
import { fetchOutputReview, postOutputDecision } from "./output-review-client.mjs";
import { fetchMiloBoard } from "./milo-board-client.mjs";
import { decisionEligibility } from "./milo-board.mjs";
import { fetchMiloRecord, normalizeLegacyRecord } from "./milo-approvals-client.mjs";
import { approvalSignalVersion } from "./approval-signal-version.mjs";

const DIGEST_RE = /^[0-9a-f]{64}$/;

/**
 * @param {{ bridge: object, milo: object, recordId: string, body: { version_digest: string }, key: string,
 *   bridgeTransport?: Function, airtableTransport?: Function }} a
 */
export async function guardOutputDecision({ bridge, milo, recordId, body, key, bridgeTransport, airtableTransport }) {
  const bopt = bridgeTransport ? { transport: bridgeTransport } : {};
  const [card, board, review] = await Promise.all([
    fetchMiloRecord(milo, recordId, airtableTransport ? { transport: airtableTransport } : {}),
    fetchMiloBoard(bridge, bopt),
    fetchOutputReview(bridge, recordId, bopt),
  ]);
  const digest = body?.version_digest;
  const r = review.ok ? review.review : null;
  // A strictly validated review for this exact record that says "blocked", with no decision recorded on this digest, is a
  // definitive refusal whatever the other reads say: the bridge cannot record a decision on a blocked review, and with no
  // recorded decision there is nothing for a same-key retry to recover. (A recorded digest still goes to the bridge to replay.)
  if (r && r.record_id === recordId && r.state === "blocked" && typeof digest === "string" && DIGEST_RE.test(digest)
    && !(r.history ?? []).some((h) => h?.version_digest === digest)) {
    return { outcome: "refused", code: "output_blocked", provenance: "pre_send_definitive" };
  }
  if (!card.ok || !card.record || !board.ok || !review.ok) return { outcome: "unknown", code: "eligibility_unavailable", provenance: "pre_send_unavailable" };
  const approval = { ...normalizeLegacyRecord(card.record), version: approvalSignalVersion(card.record.fields) };
  const gate = decisionEligibility({ approval, board: board.board, review: r, versionDigest: digest });
  if (!gate.ok) {
    return gate.code === "not_owner_eligible"
      ? { outcome: "refused", code: "not_owner_eligible", provenance: "pre_send_definitive" }
      : { outcome: "unknown", code: "eligibility_unavailable", provenance: "pre_send_unavailable" };
  }
  return { ...(await postOutputDecision(bridge, recordId, body, key, bopt)), provenance: "post_send" };
}
