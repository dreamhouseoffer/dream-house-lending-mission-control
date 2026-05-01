export const dynamic = "force-dynamic";

import { existsSync, readFileSync } from "fs";
import * as path from "path";

export type PipelineLoan = {
  id: string;
  borrower: string;
  loanAmount: number;
  stage: string;
  loanPurpose: string;
  loanType: string;
  interestRate: number | null;
  city: string;
  state: string;
  estimatedClosingDate: string;
  lockExpiration: string;
  loanOfficer: string;
  processor: string;
  lender: string;
  leadSource: string;
  referralSource: string;
  lastSyncedAt: string;
  active: boolean;
  closed: boolean;
  cancelled: boolean;
  priority: string;
  notes: string;
};

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type AirtableResponse = {
  records?: AirtableRecord[];
  offset?: string;
  error?: { type?: string; message?: string } | string;
};

export type PipelineData = {
  configured: boolean;
  connected: boolean;
  source: string;
  baseId?: string;
  tableId?: string;
  error?: string;
  loans: PipelineLoan[];
  stats: {
    totalLoans: number;
    activeLoans: number;
    closedLoans: number;
    cancelledLoans: number;
    totalVolume: number;
    activeVolume: number;
    closingThisWeek: number;
    closingThisMonth: number;
    locksExpiringSoon: number;
    staleFiles: number;
    lastSyncedAt: string;
  };
  stageCounts: Record<string, number>;
};

const DEFAULT_BASE_ID = "app9j7s9BTPr8UglD";
const LOANS_CURRENT_TABLE_ID = "tblIHak6HQmv6Vyhe";
const PIPELINE_TABLE_ID = "tbli44Wi5FDLn4abX";
const DEFAULT_TABLE_ID = LOANS_CURRENT_TABLE_ID;
const ARIVE_CSV_PATH = path.join(process.cwd(), "data", "arive-active-pipeline.csv");

const LOANS_CURRENT_FIELDS = [
  "borrower_full_name",
  "loan_purpose",
  "mortgage_type",
  "stage_name",
  "estimated_closing_date",
  "firm_closing_date",
  "lock_expiration",
  "loan_amount",
  "interest_rate",
  "subject_city",
  "subject_state",
  "lead_source",
  "referral_contact_name",
  "primary_loan_officer_name",
  "primary_processor_name",
  "title_company",
  "last_source_modified_at",
  "last_synced_at",
  "active_flag",
  "closed_flag",
  "cancelled_flag",
  "ops_notes",
  "follow_up_owner",
  "manual_priority_override",
];

const PIPELINE_FIELDS = [
  "Borrower Name",
  "Loan Amount",
  "Interest Rate",
  "Loan Type",
  "Loan Purpose",
  "Stage",
  "Loan Officer",
  "Processor",
  "Lender",
  "Property City",
  "Property State",
  "Lock Expiration",
  "Est Closing Date",
  "Funded Date",
  "Referral Source",
  "Notes",
];

function selectedFieldsFor(tableId: string) {
  return tableId === PIPELINE_TABLE_ID ? PIPELINE_FIELDS : LOANS_CURRENT_FIELDS;
}

function env(name: string) {
  return process.env[name]?.trim();
}

function asString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(asString(value).replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBool(value: unknown) {
  return value === true || asString(value).toLowerCase() === "true";
}

function decodeCsvFromEnv() {
  const encoded = env("ARIVE_PIPELINE_CSV_BASE64");
  if (!encoded) return "";
  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function getAriveCsvText() {
  const fromEnv = decodeCsvFromEnv();
  if (fromEnv.trim()) return fromEnv;
  if (existsSync(ARIVE_CSV_PATH)) return readFileSync(ARIVE_CSV_PATH, "utf8");
  return "";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);

  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "").trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

function parseDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(value: string) {
  const date = parseDate(value);
  if (!date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - now.getTime()) / 86_400_000);
}

function isThisMonth(value: string) {
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function stageIncludes(stage: string, terms: string[]) {
  const normalized = stage.toLowerCase().replace(/[_-]/g, " ");
  return terms.some((term) => normalized.includes(term));
}

function normalize(record: AirtableRecord): PipelineLoan {
  const f = record.fields;
  const stage = asString(f.stage_name) || asString(f.stage_name_raw) || asString(f.Stage) || "Unstaged";
  const fundedDate = asString(f["Funded Date"]);
  const closed =
    asBool(f.closed_flag) ||
    Boolean(fundedDate) ||
    stageIncludes(stage, ["funded", "closed", "commission paid"]);
  const cancelled =
    asBool(f.cancelled_flag) ||
    stageIncludes(stage, ["adverse", "denied", "withdrawn", "cancel", "lost"]);
  const hasExplicitActiveFlag = f.active_flag !== undefined;
  const active = hasExplicitActiveFlag ? asBool(f.active_flag) && !closed && !cancelled : !closed && !cancelled;

  return {
    id: record.id,
    borrower: asString(f.borrower_full_name) || asString(f["Borrower Name"]) || "Unknown borrower",
    loanAmount: asNumber(f.loan_amount ?? f["Loan Amount"]),
    stage,
    loanPurpose: asString(f.loan_purpose ?? f["Loan Purpose"]),
    loanType: asString(f.mortgage_type ?? f["Loan Type"]),
    interestRate: f.interest_rate === undefined && f["Interest Rate"] === undefined ? null : asNumber(f.interest_rate ?? f["Interest Rate"]),
    city: asString(f.subject_city ?? f["Property City"]),
    state: asString(f.subject_state ?? f["Property State"]),
    estimatedClosingDate: asString(f.firm_closing_date) || asString(f.estimated_closing_date) || asString(f["Est Closing Date"]),
    lockExpiration: asString(f.lock_expiration ?? f["Lock Expiration"]),
    loanOfficer: asString(f.primary_loan_officer_name ?? f["Loan Officer"]),
    processor: asString(f.primary_processor_name ?? f.Processor),
    lender: asString(f.title_company ?? f.Lender),
    leadSource: asString(f.lead_source),
    referralSource: asString(f.referral_contact_name ?? f["Referral Source"]),
    lastSyncedAt: asString(f.last_synced_at) || asString(f.last_source_modified_at) || record.createdTime || "",
    active,
    closed,
    cancelled,
    priority: asString(f.manual_priority_override),
    notes: asString(f.ops_notes ?? f.Notes),
  };
}

function normalizeAriveCsvRow(row: Record<string, string>, index: number): PipelineLoan {
  const fundedDate = asString(row["Loan Funded"]);
  const stage = asString(row["Stage Name"]) || "Unstaged";
  const closed = Boolean(fundedDate) || stageIncludes(stage, ["funded", "closed"]);
  const cancelled = stageIncludes(stage, ["adverse", "denied", "withdrawn", "cancel", "lost"]);

  return {
    id: asString(row["ARIVE Loan Id"]) || `arive-csv-${index}`,
    borrower: asString(row["Primary Borrower"]) || "Unknown borrower",
    loanAmount: asNumber(row["Total Loan Amount"] || row["Base Loan Amount"]),
    stage,
    loanPurpose: asString(row["Loan Purpose"]),
    loanType: asString(row["Lien Position"]),
    interestRate: row["Interest Rate"] ? asNumber(row["Interest Rate"]) : null,
    city: asString(row["Subject City"]),
    state: asString(row["Subject State"]),
    estimatedClosingDate: asString(row["Estimated Closing Date"]),
    lockExpiration: asString(row["Lock Expiration"]),
    loanOfficer: asString(row["Primary Loan Officer Name"]),
    processor: asString(row["Primary Loan Processor Name"]),
    lender: asString(row.Lender),
    leadSource: "Arive export",
    referralSource: asString(row["Referral Contact Name"]),
    lastSyncedAt: asString(row["Loan Status Date"]) || new Date().toISOString(),
    active: !closed && !cancelled,
    closed,
    cancelled,
    priority: "",
    notes: asString(row["Registration Status"]),
  };
}

function emptyData(overrides: Partial<PipelineData> = {}): PipelineData {
  return {
    configured: false,
    connected: false,
    source: "Airtable · Arive sync",
    loans: [],
    stats: {
      totalLoans: 0,
      activeLoans: 0,
      closedLoans: 0,
      cancelledLoans: 0,
      totalVolume: 0,
      activeVolume: 0,
      closingThisWeek: 0,
      closingThisMonth: 0,
      locksExpiringSoon: 0,
      staleFiles: 0,
      lastSyncedAt: "",
    },
    stageCounts: {},
    ...overrides,
  };
}

function buildPipelineData(loans: PipelineLoan[], source: string, baseId?: string, tableId?: string): PipelineData {
  const sortedLoans = loans.sort((a, b) => {
    const ad = parseDate(a.estimatedClosingDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = parseDate(b.estimatedClosingDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  const activeLoans = sortedLoans.filter((loan) => loan.active);
  const closedLoans = sortedLoans.filter((loan) => loan.closed);
  const cancelledLoans = sortedLoans.filter((loan) => loan.cancelled);
  const stageCounts = activeLoans.reduce<Record<string, number>>((acc, loan) => {
    acc[loan.stage] = (acc[loan.stage] ?? 0) + 1;
    return acc;
  }, {});
  const lastSyncedAt = sortedLoans
    .map((loan) => parseDate(loan.lastSyncedAt)?.getTime() ?? 0)
    .sort((a, b) => b - a)[0];

  return {
    configured: true,
    connected: true,
    source,
    baseId,
    tableId,
    loans: sortedLoans,
    stats: {
      totalLoans: sortedLoans.length,
      activeLoans: activeLoans.length,
      closedLoans: closedLoans.length,
      cancelledLoans: cancelledLoans.length,
      totalVolume: sortedLoans.reduce((sum, loan) => sum + loan.loanAmount, 0),
      activeVolume: activeLoans.reduce((sum, loan) => sum + loan.loanAmount, 0),
      closingThisWeek: activeLoans.filter((loan) => {
        const days = daysUntil(loan.estimatedClosingDate);
        return days !== null && days >= 0 && days <= 7;
      }).length,
      closingThisMonth: activeLoans.filter((loan) => isThisMonth(loan.estimatedClosingDate)).length,
      locksExpiringSoon: activeLoans.filter((loan) => {
        const days = daysUntil(loan.lockExpiration);
        return days !== null && days >= 0 && days <= 10;
      }).length,
      staleFiles: activeLoans.filter((loan) => {
        const synced = parseDate(loan.lastSyncedAt);
        if (!synced) return false;
        return Date.now() - synced.getTime() > 1000 * 60 * 60 * 24 * 7;
      }).length,
      lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : "",
    },
    stageCounts,
  };
}

export async function getPipelineData(): Promise<PipelineData> {
  const ariveCsvText = getAriveCsvText();
  if (ariveCsvText.trim()) {
    const loans = parseCsv(ariveCsvText).map(normalizeAriveCsvRow);
    return buildPipelineData(loans, "Arive CSV export · Active Pipeline Comp");
  }

  const token = env("AIRTABLE_API_KEY") || env("AIRTABLE_TOKEN");
  const baseId = env("AIRTABLE_BASE_ID") || DEFAULT_BASE_ID;
  const tableId = env("AIRTABLE_TABLE_ID") || DEFAULT_TABLE_ID;

  if (!token) {
    return emptyData({
      configured: false,
      baseId,
      tableId,
      error: "Missing AIRTABLE_API_KEY / AIRTABLE_TOKEN in the deployment environment.",
    });
  }

  const records: AirtableRecord[] = [];
  let offset = "";

  try {
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (offset) params.set("offset", offset);
      for (const field of selectedFieldsFor(tableId)) params.append("fields[]", field);

      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json()) as AirtableResponse;

      if (!res.ok) {
        const message = typeof json.error === "string" ? json.error : json.error?.message || res.statusText;
        return emptyData({
          configured: true,
          connected: false,
          baseId,
          tableId,
          error: `Airtable ${res.status}: ${message}`,
        });
      }

      records.push(...(json.records ?? []));
      offset = json.offset ?? "";
    } while (offset);
  } catch (error) {
    return emptyData({
      configured: true,
      connected: false,
      baseId,
      tableId,
      error: error instanceof Error ? error.message : "Unknown Airtable error",
    });
  }

  const loans = records
    .map(normalize)
    .sort((a, b) => {
      const ad = parseDate(a.estimatedClosingDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bd = parseDate(b.estimatedClosingDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });

  const activeLoans = loans.filter((loan) => loan.active);
  const closedLoans = loans.filter((loan) => loan.closed);
  const cancelledLoans = loans.filter((loan) => loan.cancelled);
  const stageCounts = activeLoans.reduce<Record<string, number>>((acc, loan) => {
    acc[loan.stage] = (acc[loan.stage] ?? 0) + 1;
    return acc;
  }, {});

  const lastSyncedAt = loans
    .map((loan) => parseDate(loan.lastSyncedAt)?.getTime() ?? 0)
    .sort((a, b) => b - a)[0];

  const stats = {
    totalLoans: loans.length,
    activeLoans: activeLoans.length,
    closedLoans: closedLoans.length,
    cancelledLoans: cancelledLoans.length,
    totalVolume: loans.reduce((sum, loan) => sum + loan.loanAmount, 0),
    activeVolume: activeLoans.reduce((sum, loan) => sum + loan.loanAmount, 0),
    closingThisWeek: activeLoans.filter((loan) => {
      const days = daysUntil(loan.estimatedClosingDate);
      return days !== null && days >= 0 && days <= 7;
    }).length,
    closingThisMonth: activeLoans.filter((loan) => isThisMonth(loan.estimatedClosingDate)).length,
    locksExpiringSoon: activeLoans.filter((loan) => {
      const days = daysUntil(loan.lockExpiration);
      return days !== null && days >= 0 && days <= 10;
    }).length,
    staleFiles: activeLoans.filter((loan) => {
      const synced = parseDate(loan.lastSyncedAt);
      if (!synced) return false;
      return Date.now() - synced.getTime() > 1000 * 60 * 60 * 24 * 7;
    }).length,
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : "",
  };

  return {
    configured: true,
    connected: true,
    source: tableId === PIPELINE_TABLE_ID ? "Airtable · ARIVE Company Pipeline · Pipeline" : "Airtable · ARIVE Company Pipeline · Loans_Current",
    baseId,
    tableId,
    loans,
    stats,
    stageCounts,
  };
}

export function formatMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

export function formatDate(value: string) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date);
}
