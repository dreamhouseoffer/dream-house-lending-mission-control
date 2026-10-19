// Server-only (node:crypto): never import from a client component. Same content version as the private
// approved_queue_source.mjs (VERSION_KEYS over verbatim strings, else JSON, else null), so the monitor can tell whether
// its snapshot already reflects this decision.
import { createHash } from "node:crypto";

const SIGNAL_VERSION_FIELDS = ["Decision", "Status", "Approval Level", "Proposed Change", "Affected URL", "Evidence", "Fonz Notes", "Approved At"];
export function approvalSignalVersion(fields) {
  const values = SIGNAL_VERSION_FIELDS.map((name) => {
    const v = fields?.[name];
    return typeof v === "string" ? v : v === undefined || v === null ? null : JSON.stringify(v);
  });
  return createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 16);
}
