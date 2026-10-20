// Milo output review: server-side signed bridge calls (route handlers only). Pure contract lives in output-review-model.mjs.
import { bridgeGet, bridgeRequest } from "./bridge-client.mjs";
import { DECISION_ID_RE, OUTPUT_IDEM_RE, checkOutputReview, isRecordId, settleDecision, settleHandoffRetry, validateDecisionBody } from "./output-review-model.mjs";

export * from "./output-review-model.mjs";


export async function fetchOutputReview(config, recordId, options = {}) {
  if (!isRecordId(recordId)) return { ok: false, state: "error", code: "invalid_record_id" };
  const res = await bridgeGet(config, `/v0/output-reviews/${recordId}`, options);
  if (!res.ok) return res;
  const review = checkOutputReview(res.data);
  return review && review.record_id === recordId ? { ok: true, review } : { ok: false, state: "bad_payload", code: "schema_mismatch" };
}

/**
 * POST one decision. Returns { outcome: "saved"|"replayed"|"refused"|"unknown", ... }. "unknown" means the bridge may or
 * may not have recorded it: the caller retries with the SAME key and body.
 */
export async function postOutputDecision(config, recordId, body, key, options = {}) {
  const canon = validateDecisionBody(body);
  if (!isRecordId(recordId) || !canon || !OUTPUT_IDEM_RE.test(String(key))) return { outcome: "refused", code: "invalid_input" };
  const res = await bridgeRequest(config, "POST", `/v0/output-reviews/${recordId}/decision`, { ...options, body: canon, idempotencyKey: key,
    acceptStatus: [200, 201, 400, 404, 409, 413, 415, 503] });
  if (!res.ok) return { outcome: "unknown", code: res.code };
  return settleDecision(res.status, res.data);
}

export async function postHandoffRetry(config, recordId, decisionId, options = {}) {
  if (!isRecordId(recordId) || typeof decisionId !== "string" || !DECISION_ID_RE.test(decisionId)) return { outcome: "refused", code: "invalid_input" };
  const res = await bridgeRequest(config, "POST", `/v0/output-reviews/${recordId}/handoff-retry`, { ...options, body: { decision_id: decisionId },
    acceptStatus: [200, 400, 404, 409, 503] });
  if (!res.ok) return { outcome: "unknown", code: res.code };
  return settleHandoffRetry(res.status, res.data);
}
