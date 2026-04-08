"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Loan {
  primaryBorrower: string;
  loanAmount: number;
  stageName: string;
  interestRate: string;
  subjectCity: string;
  lockExpiration: string;
  estimatedClosingDate: string;
  loanOfficer: string;
  processor: string;
  lender: string;
  [key: string]: string | number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_ORDER = [
  "Loan Setup",
  "Disclosed",
  "Approved w/ Conditions",
  "Clear to Close",
  "Docs Out",
  "Funded",
];

const STAGE_COLORS: Record<string, string> = {
  "Loan Setup": "bg-blue-500/70",
  Disclosed: "bg-purple-500/70",
  "Approved w/ Conditions": "bg-yellow-500/70",
  "Clear to Close": "bg-emerald-500/70",
  "Docs Out": "bg-orange-500/70",
  Funded: "bg-green-400/70",
};

const STAGE_TEXT: Record<string, string> = {
  "Loan Setup": "text-blue-400",
  Disclosed: "text-purple-400",
  "Approved w/ Conditions": "text-yellow-400",
  "Clear to Close": "text-emerald-400",
  "Docs Out": "text-orange-400",
  Funded: "text-green-400",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000)
    return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)
    return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toLocaleString();
}

function parseDate(s: string): Date | null {
  if (!s || s.trim() === "") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(d: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function parseCSV(text: string): Loan[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  // Map header names to our fields
  function findCol(candidates: string[]): number {
    for (const c of candidates) {
      const idx = headers.findIndex(
        (h) => h.toLowerCase().includes(c.toLowerCase())
      );
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const colMap = {
    primaryBorrower: findCol(["primary borrower", "borrower"]),
    loanAmount: findCol(["loan amount", "amount"]),
    stageName: findCol(["stage name", "stage"]),
    interestRate: findCol(["interest rate", "rate"]),
    subjectCity: findCol(["subject city", "city"]),
    lockExpiration: findCol(["lock expiration", "lock exp"]),
    estimatedClosingDate: findCol(["estimated closing", "closing date", "close date"]),
    loanOfficer: findCol(["loan officer", "officer"]),
    processor: findCol(["processor"]),
    lender: findCol(["lender"]),
  };

  const loans: Loan[] = [];

  const getCell = (row: string[], idx: number): string =>
    idx >= 0 ? (row[idx] ?? "").trim().replace(/^"|"$/g, "") : "";

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted CSV fields
    const row = parseCSVRow(lines[i]);
    if (row.length < 2) continue;

    const get = (idx: number) => getCell(row, idx);

    const amountRaw = get(colMap.loanAmount).replace(/[$,]/g, "");
    const loanAmount = parseFloat(amountRaw) || 0;

    loans.push({
      primaryBorrower: get(colMap.primaryBorrower),
      loanAmount,
      stageName: get(colMap.stageName),
      interestRate: get(colMap.interestRate),
      subjectCity: get(colMap.subjectCity),
      lockExpiration: get(colMap.lockExpiration),
      estimatedClosingDate: get(colMap.estimatedClosingDate),
      loanOfficer: get(colMap.loanOfficer),
      processor: get(colMap.processor),
      lender: get(colMap.lender),
    });
  }

  return loans.filter((l) => l.primaryBorrower || l.loanAmount);
}

function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Upload Area ──────────────────────────────────────────────────────────────

function UploadArea({ onParsed }: { onParsed: (loans: Loan[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a .csv file");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const loans = parseCSV(text);
      if (loans.length === 0) {
        setError("No loans found in CSV. Check column headers.");
      } else {
        onParsed(loans);
      }
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="min-h-screen bg-[#080808] text-white/90 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-black tracking-tight mb-2">
          Pipeline <span className="text-blue-400">📊</span>
        </h1>
        <p className="text-sm text-white/35 mb-8">
          Upload your Arive export to view pipeline analytics
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-16 text-center cursor-pointer transition-all ${
            dragging
              ? "border-blue-400/60 bg-blue-500/[0.06]"
              : "border-white/[0.10] bg-white/[0.02] hover:border-white/[0.20] hover:bg-white/[0.03]"
          }`}
        >
          <p className="text-4xl mb-4">📂</p>
          <p className="text-base font-semibold text-white/70">
            Drop your Arive CSV here
          </p>
          <p className="text-sm text-white/30 mt-1">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <p className="text-xs text-white/20 mt-6 text-center">
          Data stays in your browser — nothing is uploaded to a server
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  loans,
  onReset,
}: {
  loans: Loan[];
  onReset: () => void;
}) {
  const activeStageLoanss = loans.filter((l) => l.stageName !== "Funded");
  const totalVolume = loans.reduce((s, l) => s + l.loanAmount, 0);
  const activeVolume = activeStageLoanss.reduce((s, l) => s + l.loanAmount, 0);

  // Stage counts
  const stageCounts: Record<string, { count: number; volume: number }> = {};
  for (const stage of STAGE_ORDER) {
    stageCounts[stage] = { count: 0, volume: 0 };
  }
  for (const loan of loans) {
    const stage = loan.stageName;
    if (!stageCounts[stage]) stageCounts[stage] = { count: 0, volume: 0 };
    stageCounts[stage].count++;
    stageCounts[stage].volume += loan.loanAmount;
  }

  const maxCount = Math.max(1, ...Object.values(stageCounts).map((s) => s.count));

  // Urgent items
  const today = new Date();
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  const locksExpiring = loans.filter((l) => {
    const d = parseDate(l.lockExpiration);
    if (!d) return false;
    const days = daysUntil(d);
    return days >= 0 && days <= 7;
  });

  const closingThisWeek = loans.filter((l) => {
    const d = parseDate(l.estimatedClosingDate);
    if (!d) return false;
    const days = daysUntil(d);
    return days >= 0 && days <= 7;
  });

  return (
    <div className="min-h-screen bg-[#080808] text-white/90">
      {/* Header */}
      <header className="border-b border-white/[0.05] px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
              Pipeline <span className="text-blue-400">📊</span>
            </h1>
            <p className="text-sm text-white/35 mt-0.5">
              {loans.length} loans · {formatCurrency(totalVolume)} total volume
            </p>
          </div>
          <button
            onClick={onReset}
            className="text-xs text-white/30 hover:text-white/60 border border-white/[0.07] hover:border-white/[0.15] rounded-md px-3 py-1.5 transition-colors"
          >
            Upload new CSV
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* ══ KPI Cards ══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Total Loans",
              value: loans.length.toString(),
              sub: "all stages",
              color: "text-white/90",
            },
            {
              label: "Active (not funded)",
              value: activeStageLoanss.length.toString(),
              sub: formatCurrency(activeVolume),
              color: "text-blue-400",
            },
            {
              label: "Locks Expiring",
              value: locksExpiring.length.toString(),
              sub: "within 7 days",
              color: locksExpiring.length > 0 ? "text-red-400" : "text-white/40",
            },
            {
              label: "Closing This Week",
              value: closingThisWeek.length.toString(),
              sub: closingThisWeek.length > 0
                ? formatCurrency(
                    closingThisWeek.reduce((s, l) => s + l.loanAmount, 0)
                  )
                : "none",
              color: closingThisWeek.length > 0 ? "text-emerald-400" : "text-white/40",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
            >
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">
                {card.label}
              </p>
              <p className={`text-4xl font-black ${card.color}`}>{card.value}</p>
              <p className="text-xs text-white/30 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ══ Stage Funnel ══ */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white/70 mb-5 flex items-center gap-2">
            <span>🔀</span> Pipeline by Stage
          </h2>

          <div className="space-y-3">
            {STAGE_ORDER.map((stage) => {
              const info = stageCounts[stage] ?? { count: 0, volume: 0 };
              const barPct = (info.count / maxCount) * 100;
              const color = STAGE_COLORS[stage] ?? "bg-white/30";
              const textColor = STAGE_TEXT[stage] ?? "text-white/70";
              return (
                <div key={stage} className="flex items-center gap-4">
                  <div className="w-48 shrink-0 text-[11px] text-white/50 font-medium truncate">
                    {stage}
                  </div>
                  <div className="flex-1 h-8 rounded bg-white/[0.03] overflow-hidden relative">
                    <div
                      className={`h-full rounded transition-all ${color}`}
                      style={{ width: `${barPct}%` }}
                    />
                    {info.count > 0 && (
                      <div className="absolute inset-y-0 left-3 flex items-center">
                        <span className="text-xs font-bold text-white/90">
                          {info.count}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="w-24 text-right shrink-0">
                    <span className={`text-xs font-mono font-semibold ${textColor}`}>
                      {info.count > 0 ? formatCurrency(info.volume) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ Urgent Items ══ */}
        {(locksExpiring.length > 0 || closingThisWeek.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {locksExpiring.length > 0 && (
              <div className="rounded-xl border border-red-500/15 bg-red-500/[0.03] p-5">
                <h2 className="text-sm font-semibold text-red-400/80 mb-4 flex items-center gap-2">
                  <span>🔒</span> Locks Expiring (7 days)
                </h2>
                <div className="space-y-2">
                  {locksExpiring
                    .sort((a, b) => {
                      const da = parseDate(a.lockExpiration)?.getTime() ?? 0;
                      const db = parseDate(b.lockExpiration)?.getTime() ?? 0;
                      return da - db;
                    })
                    .map((loan, i) => {
                      const d = parseDate(loan.lockExpiration);
                      const days = d ? daysUntil(d) : null;
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-white/80">
                              {loan.primaryBorrower || "—"}
                            </p>
                            <p className="text-xs text-white/35">
                              {formatCurrency(loan.loanAmount)} · {loan.stageName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-mono font-bold text-red-400">
                              {days === 0
                                ? "Today"
                                : days === 1
                                  ? "Tomorrow"
                                  : `${days}d`}
                            </p>
                            <p className="text-[10px] text-white/30">
                              {loan.lockExpiration}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {closingThisWeek.length > 0 && (
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-5">
                <h2 className="text-sm font-semibold text-emerald-400/80 mb-4 flex items-center gap-2">
                  <span>🏁</span> Closings This Week
                </h2>
                <div className="space-y-2">
                  {closingThisWeek
                    .sort((a, b) => {
                      const da =
                        parseDate(a.estimatedClosingDate)?.getTime() ?? 0;
                      const db =
                        parseDate(b.estimatedClosingDate)?.getTime() ?? 0;
                      return da - db;
                    })
                    .map((loan, i) => {
                      const d = parseDate(loan.estimatedClosingDate);
                      const days = d ? daysUntil(d) : null;
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-white/80">
                              {loan.primaryBorrower || "—"}
                            </p>
                            <p className="text-xs text-white/35">
                              {formatCurrency(loan.loanAmount)} · {loan.subjectCity}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-mono font-bold text-emerald-400">
                              {days === 0
                                ? "Today"
                                : days === 1
                                  ? "Tomorrow"
                                  : `${days}d`}
                            </p>
                            <p className="text-[10px] text-white/30">
                              {loan.estimatedClosingDate}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Loan Table ══ */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
            <span>📋</span> All Loans
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/30 border-b border-white/[0.05]">
                  <th className="text-left py-2.5 pr-4 font-medium">Borrower</th>
                  <th className="text-right py-2.5 pr-4 font-medium">Amount</th>
                  <th className="text-left py-2.5 pr-4 font-medium">Stage</th>
                  <th className="text-right py-2.5 pr-4 font-medium">Rate</th>
                  <th className="text-left py-2.5 pr-4 font-medium">City</th>
                  <th className="text-right py-2.5 pr-4 font-medium">Lock Exp.</th>
                  <th className="text-right py-2.5 font-medium">Est. Close</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan, i) => {
                  const lockDate = parseDate(loan.lockExpiration);
                  const lockDays = lockDate ? daysUntil(lockDate) : null;
                  const closeDate = parseDate(loan.estimatedClosingDate);
                  const closeDays = closeDate ? daysUntil(closeDate) : null;
                  const stageColor = STAGE_TEXT[loan.stageName] ?? "text-white/50";

                  return (
                    <tr
                      key={i}
                      className="border-b border-white/[0.03] hover:bg-white/[0.02]"
                    >
                      <td className="py-2.5 pr-4 font-medium text-white/80">
                        {loan.primaryBorrower || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-white/70">
                        {loan.loanAmount > 0 ? formatCurrency(loan.loanAmount) : "—"}
                      </td>
                      <td className={`py-2.5 pr-4 font-medium ${stageColor}`}>
                        {loan.stageName || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-white/55">
                        {loan.interestRate ? `${loan.interestRate}%` : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-white/45">
                        {loan.subjectCity || "—"}
                      </td>
                      <td
                        className={`py-2.5 pr-4 text-right font-mono ${
                          lockDays !== null && lockDays <= 7
                            ? "text-red-400 font-bold"
                            : "text-white/40"
                        }`}
                      >
                        {loan.lockExpiration || "—"}
                      </td>
                      <td
                        className={`py-2.5 text-right font-mono ${
                          closeDays !== null && closeDays <= 7
                            ? "text-emerald-400 font-bold"
                            : "text-white/40"
                        }`}
                      >
                        {loan.estimatedClosingDate || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load persisted pipeline from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("pipelineData");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLoans(parsed);
        }
      }
    } catch {}
    setLoaded(true);
  }, []);

  function handleLoans(newLoans: Loan[]) {
    setLoans(newLoans);
    try {
      localStorage.setItem("pipelineData", JSON.stringify(newLoans));
    } catch {}
  }

  function handleReset() {
    setLoans(null);
    try {
      localStorage.removeItem("pipelineData");
    } catch {}
  }

  // Avoid hydration mismatch — don't render until localStorage is checked
  if (!loaded) return null;

  if (!loans) {
    return <UploadArea onParsed={handleLoans} />;
  }

  return <Dashboard loans={loans} onReset={handleReset} />;
}
