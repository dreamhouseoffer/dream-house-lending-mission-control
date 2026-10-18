// Server-only Next wrapper for the Milo approvals Airtable read. Import from route handlers or server components only.
// Reads AIRTABLE_* / MILO_APPROVALS_TABLE_ID at request time; the credential never leaves this process, is never logged,
// and reads are never cached. Read-only: no write entry point exists here.
import { unstable_noStore as noStore } from "next/cache";
import { hasControlAccess } from "./bridge";
import { fetchMiloApprovals, readMiloConfig } from "./milo-approvals-client.mjs";

export type MiloCard = {
  id: string;
  createdTime: string | null;
  title: string | null;
  category: string | null;
  approvalLevel: string | null;
  decision: string | null;
  status: string | null;
  approvedAt: string | null;
};
export type MiloFeed =
  | { ok: true; cards: MiloCard[]; malformed: number; truncated: boolean; pages: number; observedAt: string }
  | { ok: false; state: string; code: string; status?: number };

export function miloConfigFromEnv() {
  return readMiloConfig({
    baseId: process.env.AIRTABLE_BASE_ID,
    tableId: process.env.MILO_APPROVALS_TABLE_ID,
    apiKey: process.env.AIRTABLE_API_KEY,
    token: process.env.AIRTABLE_TOKEN,
  });
}

export async function readMiloFeed(): Promise<MiloFeed> {
  noStore();
  if (!(await hasControlAccess())) return { ok: false, state: "unauthenticated", code: "unauthenticated" };
  return (await fetchMiloApprovals(miloConfigFromEnv())) as MiloFeed;
}
