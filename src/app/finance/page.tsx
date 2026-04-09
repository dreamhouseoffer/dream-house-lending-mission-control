"use client";


// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpenseCategory {
  label: string;
  amount: number;
  color: string;
}

interface LoanOfficer {
  name: string;
  initials: string;
  activeLoans: number;
  totalComp: number;
  splitPct: number;
  loKeeps: number;
  companyRevenue: number;
  color: string;
}

// ─── Hardcoded March 2026 Data ────────────────────────────────────────────────

const PL = {
  revenue: 98980,
  expenses: 98953,
  net: 27,
  margin: 0.03,
  month: "March 2026",
};

const EXPENSES: ExpenseCategory[] = [
  { label: "Payroll (Gusto)", amount: 55000, color: "bg-amber-500" },
  { label: "Credit Cards (AmEx + Cap One)", amount: 16500, color: "bg-orange-500" },
  { label: "Credit Reports (Avatar)", amount: 6000, color: "bg-yellow-500" },
  { label: "Franchise Tax Board", amount: 1550, color: "bg-red-500" },
  { label: "Personal / Mixed", amount: 1500, color: "bg-pink-500" },
  { label: "Rent / Office", amount: 3000, color: "bg-purple-500" },
  { label: "Insurance", amount: 1200, color: "bg-blue-500" },
  { label: "Marketing", amount: 1000, color: "bg-emerald-500" },
  { label: "Utilities (Gas, Verizon, Internet)", amount: 1000, color: "bg-cyan-500" },
  { label: "Software / Subscriptions", amount: 500, color: "bg-indigo-500" },
  { label: "Other", amount: 11703, color: "bg-white/20" },
];

const LOAN_OFFICERS: LoanOfficer[] = [
  {
    name: "Alfonso Garza",
    initials: "AG",
    activeLoans: 25,
    totalComp: 180000,
    splitPct: 100,
    loKeeps: 180000,
    companyRevenue: 0,
    color: "amber",
  },
  {
    name: "Emmanuel Duran",
    initials: "ED",
    activeLoans: 8,
    totalComp: 45000,
    splitPct: 55,
    loKeeps: 24750,
    companyRevenue: 20250,
    color: "blue",
  },
  {
    name: "Yanelit Trujillo",
    initials: "YT",
    activeLoans: 3,
    totalComp: 22000,
    splitPct: 45,
    loKeeps: 9900,
    companyRevenue: 12100,
    color: "purple",
  },
  {
    name: "Alex Tucker",
    initials: "AT",
    activeLoans: 2,
    totalComp: 3300,
    splitPct: 70,
    loKeeps: 2310,
    companyRevenue: 990,
    color: "emerald",
  },
];

const KEY_METRICS = {
  revenuePerLoan: 7500,
  costPerLoan: 7400,
  profitPerLoan: 100,
  payrollPct: 55.6,
  payrollTarget: 40,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(decimals === 0 ? 1 : decimals) + "K";
  return "$" + n.toLocaleString();
}

function fmtFull(n: number): string {
  return "$" + n.toLocaleString();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[13px] font-semibold tracking-widest text-white/40 uppercase">
        {title}
      </h2>
      {subtitle && <p className="text-[11px] text-white/25 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function PLCard() {
  const isProfit = PL.net >= 0;
  return (
    <div className={`rounded-xl border p-6 ${isProfit ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-red-500/20 bg-red-500/[0.03]"}`}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-white/40 uppercase mb-1">
            Monthly P&amp;L — {PL.month}
          </p>
          <p className="text-[12px] text-white/30">Dream House Lending · Bank Statement Snapshot</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isProfit ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
          {isProfit ? "Profitable" : "Loss"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Revenue</p>
          <p className="text-3xl font-black text-white/90">{fmtFull(PL.revenue)}</p>
          <p className="text-[11px] text-white/30 mt-0.5">March deposits</p>
        </div>
        <div>
          <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Expenses</p>
          <p className="text-3xl font-black text-white/90">{fmtFull(PL.expenses)}</p>
          <p className="text-[11px] text-white/30 mt-0.5">March withdrawals</p>
        </div>
        <div>
          <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Net Income</p>
          <p className={`text-3xl font-black ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
            {PL.net >= 0 ? "+" : ""}{fmtFull(PL.net)}
          </p>
          <p className="text-[11px] text-white/30 mt-0.5">Bottom line</p>
        </div>
        <div>
          <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Net Margin</p>
          <p className={`text-3xl font-black ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
            {PL.margin.toFixed(2)}%
          </p>
          <p className="text-[11px] text-white/30 mt-0.5">Basically breakeven</p>
        </div>
      </div>

      {/* Visual bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-[11px] text-white/30 mb-1.5">
          <span>Expenses vs Revenue</span>
          <span>{((PL.expenses / PL.revenue) * 100).toFixed(1)}% of revenue spent</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-500/70 transition-all"
            style={{ width: `${Math.min((PL.expenses / PL.revenue) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ExpenseBreakdown() {
  const total = EXPENSES.reduce((s, e) => s + e.amount, 0);
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
      <SectionHeader title="Expense Breakdown" subtitle="March 2026 — hardcoded snapshot" />
      <div className="space-y-3">
        {EXPENSES.map((exp) => {
          const pct = (exp.amount / total) * 100;
          return (
            <div key={exp.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-white/70">{exp.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/40">{pct.toFixed(1)}%</span>
                  <span className="text-[12px] font-semibold text-white/80 w-20 text-right">
                    {fmtFull(exp.amount)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-full ${exp.color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between">
        <span className="text-[12px] text-white/40">Total Expenses</span>
        <span className="text-[14px] font-bold text-white/80">{fmtFull(total)}</span>
      </div>
    </div>
  );
}

const LO_COLORS: Record<string, { ring: string; bg: string; text: string; badge: string }> = {
  amber: {
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    badge: "bg-amber-500/10 text-amber-400",
  },
  blue: {
    ring: "ring-blue-500/30",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    badge: "bg-blue-500/10 text-blue-400",
  },
  purple: {
    ring: "ring-purple-500/30",
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    badge: "bg-purple-500/10 text-purple-400",
  },
  emerald: {
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-400",
  },
};

function LOScorecard({ lo }: { lo: LoanOfficer }) {
  const c = LO_COLORS[lo.color];
  return (
    <div className={`rounded-xl border border-white/[0.05] bg-white/[0.015] p-5 ring-1 ${c.ring}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-[13px] font-bold ${c.bg} ${c.text} shrink-0`}>
          {lo.initials}
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white/85">{lo.name}</p>
          <p className="text-[11px] text-white/35">{lo.activeLoans} active loans</p>
        </div>
        <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>
          {lo.splitPct}% split
        </span>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/40">Total Comp (pipeline)</span>
          <span className="text-[13px] font-bold text-white/80">{fmt(lo.totalComp)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/40">LO keeps</span>
          <span className={`text-[13px] font-bold ${c.text}`}>{fmt(lo.loKeeps)}</span>
        </div>
        {lo.companyRevenue > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Company revenue</span>
            <span className="text-[13px] font-bold text-emerald-400">{fmt(lo.companyRevenue)}</span>
          </div>
        )}
        {lo.companyRevenue === 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Company revenue</span>
            <span className="text-[11px] text-white/25 italic">Owner — covers own costs</span>
          </div>
        )}
      </div>

      {/* Split bar */}
      <div className="mt-4">
        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className={`h-full rounded-full ${c.bg.replace("/10", "/60")} transition-all`}
            style={{ width: `${lo.splitPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/25 mt-1">
          <span>LO: {lo.splitPct}%</span>
          {lo.companyRevenue > 0 && <span>Company: {100 - lo.splitPct}%</span>}
        </div>
      </div>
    </div>
  );
}

function CreditROICard() {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
      <SectionHeader title="Credit Report ROI" subtitle="Avatar Credit — invoice upload pending" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <p className="text-[11px] text-white/35 mb-1">Monthly Cost</p>
          <p className="text-xl font-bold text-white/70">$5–7K</p>
          <p className="text-[10px] text-white/25 mt-0.5">Estimated</p>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <p className="text-[11px] text-white/35 mb-1">Funded Loans</p>
          <p className="text-xl font-bold text-white/30">TBD</p>
          <p className="text-[10px] text-white/25 mt-0.5">Need invoices</p>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <p className="text-[11px] text-white/35 mb-1">Cost / Funded Loan</p>
          <p className="text-xl font-bold text-white/30">TBD</p>
          <p className="text-[10px] text-white/25 mt-0.5">Need invoices</p>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <p className="text-[11px] text-white/35 mb-1">Conversion Rate</p>
          <p className="text-xl font-bold text-white/30">TBD</p>
          <p className="text-[10px] text-white/25 mt-0.5">Pulls → funded</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
        <span className="text-lg">📄</span>
        <div>
          <p className="text-[12px] font-medium text-amber-400/80">Upload Avatar Credit invoices to unlock full breakdown</p>
          <p className="text-[11px] text-white/30 mt-0.5">Cost per pull · total pulls · funded conversion · ROI per loan</p>
        </div>
      </div>
    </div>
  );
}

function KeyMetricsCard() {
  const payrollOver = KEY_METRICS.payrollPct > KEY_METRICS.payrollTarget;
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
      <SectionHeader title="Key Metrics" subtitle="March 2026 averages" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <p className="text-[11px] text-white/35 mb-1">Revenue / Loan</p>
          <p className="text-xl font-bold text-white/80">{fmt(KEY_METRICS.revenuePerLoan)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">Avg comp</p>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <p className="text-[11px] text-white/35 mb-1">Cost / Loan</p>
          <p className="text-xl font-bold text-white/80">{fmt(KEY_METRICS.costPerLoan)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">Estimated</p>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
          <p className="text-[11px] text-white/35 mb-1">Profit / Loan</p>
          <p className="text-xl font-bold text-red-400">{fmt(KEY_METRICS.profitPerLoan)}</p>
          <p className="text-[10px] text-red-400/50 mt-0.5">The problem</p>
        </div>
        <div className={`rounded-lg border p-3 ${payrollOver ? "border-red-500/20 bg-red-500/[0.03]" : "border-white/[0.05] bg-white/[0.02]"}`}>
          <p className="text-[11px] text-white/35 mb-1">Payroll % Revenue</p>
          <p className={`text-xl font-bold ${payrollOver ? "text-red-400" : "text-emerald-400"}`}>
            {KEY_METRICS.payrollPct.toFixed(1)}%
          </p>
          <p className={`text-[10px] mt-0.5 ${payrollOver ? "text-red-400/50" : "text-white/25"}`}>
            Target: &lt;{KEY_METRICS.payrollTarget}%
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <p className="text-[11px] text-white/35 mb-1">Payroll Target</p>
          <p className="text-xl font-bold text-white/40">&lt;{KEY_METRICS.payrollTarget}%</p>
          <p className="text-[10px] text-white/25 mt-0.5">Of revenue</p>
        </div>
      </div>
    </div>
  );
}

interface Alert {
  level: "red" | "yellow";
  message: string;
}

const ALERTS: Alert[] = [
  { level: "red", message: "Net margin is 0% — you're breaking even. Every unexpected expense = a loss month." },
  { level: "red", message: "Payroll is 56% of revenue — target is <40%. Either grow revenue or restructure comp." },
  { level: "yellow", message: "Personal expenses mixed with business — hard to see true P&L. Separate accounts ASAP." },
  { level: "yellow", message: "Credit report ROI unknown — upload Avatar Credit invoices to analyze cost per funded loan." },
];

function AlertsCard() {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
      <SectionHeader title="Alerts & Recommendations" />
      <div className="space-y-2.5">
        {ALERTS.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-lg px-4 py-3 border ${
              alert.level === "red"
                ? "border-red-500/20 bg-red-500/[0.04]"
                : "border-amber-500/20 bg-amber-500/[0.04]"
            }`}
          >
            <span className="text-base shrink-0 mt-0.5">
              {alert.level === "red" ? "🔴" : "🟡"}
            </span>
            <p className={`text-[12px] leading-relaxed ${alert.level === "red" ? "text-red-300/80" : "text-amber-300/80"}`}>
              {alert.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Personal Burn Rate Data ──────────────────────────────────────────────────

const PERSONAL_EXPENSES = [
  { label: "Mortgage", amount: 4500, color: "bg-blue-500" },
  { label: "Kids / School", amount: 3041, color: "bg-purple-500" },
  { label: "Other", amount: 2800, color: "bg-white/20" },
  { label: "Groceries / Food", amount: 1200, color: "bg-emerald-500" },
  { label: "HELOC", amount: 850, color: "bg-orange-500" },
  { label: "Gas", amount: 400, color: "bg-yellow-500" },
  { label: "Insurance", amount: 300, color: "bg-cyan-500" },
  { label: "Subscriptions", amount: 300, color: "bg-pink-500" },
  { label: "Landscape", amount: 200, color: "bg-teal-500" },
];

const PERSONAL_BURN_TOTAL = 15600;

function PersonalBurnRateCard() {
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-5">
      <SectionHeader title="Personal Burn Rate" subtitle="Monthly personal expenses the business must cover" />

      <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <p className="text-[13px] font-semibold text-amber-300/90 mb-0.5">
              Business must generate $15,600/month above expenses to cover personal costs
            </p>
            <p className="text-[11px] text-white/35">
              Current net income: $27 · Shortfall: ~$15,573 · This must come from owner draws or Alfonso&apos;s comp
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Breakdown bars */}
        <div>
          <p className="text-[11px] text-white/35 uppercase tracking-wider mb-3">Monthly Breakdown</p>
          <div className="space-y-3">
            {PERSONAL_EXPENSES.map((exp) => {
              const pct = (exp.amount / PERSONAL_BURN_TOTAL) * 100;
              return (
                <div key={exp.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-white/65">{exp.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white/35">{pct.toFixed(1)}%</span>
                      <span className="text-[12px] font-semibold text-white/75 w-16 text-right">
                        {fmtFull(exp.amount)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${exp.color} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between">
            <span className="text-[12px] text-white/40">Total Personal Burn</span>
            <span className="text-[15px] font-bold text-white/80">{fmtFull(PERSONAL_BURN_TOTAL)}<span className="text-[11px] text-white/35">/mo</span></span>
          </div>
        </div>

        {/* Break-even math */}
        <div>
          <p className="text-[11px] text-white/35 uppercase tracking-wider mb-3">Break-Even Math</p>
          <div className="space-y-3">
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
              <p className="text-[11px] text-white/35 mb-0.5">Business Expenses (Mar)</p>
              <p className="text-xl font-bold text-white/75">{fmtFull(PL.expenses)}</p>
            </div>
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3">
              <p className="text-[11px] text-white/35 mb-0.5">Personal Burn Rate</p>
              <p className="text-xl font-bold text-blue-400">+ {fmtFull(PERSONAL_BURN_TOTAL)}</p>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
              <p className="text-[11px] text-white/35 mb-0.5">Revenue Needed to Break Even</p>
              <p className="text-2xl font-black text-red-400">{fmtFull(PL.expenses + PERSONAL_BURN_TOTAL)}</p>
            </div>
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
              <p className="text-[11px] text-white/35 mb-0.5">Actual Revenue (Mar)</p>
              <p className="text-xl font-bold text-white/60">{fmtFull(PL.revenue)}</p>
              <p className="text-[11px] text-red-400/70 mt-0.5">
                Gap: {fmtFull(Math.abs(PL.revenue - (PL.expenses + PERSONAL_BURN_TOTAL)))} short
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const totalCompanyRevenue = LOAN_OFFICERS.reduce((s, lo) => s + lo.companyRevenue, 0);
  const totalActiveLoans = LOAN_OFFICERS.reduce((s, lo) => s + lo.activeLoans, 0);
  const totalPipelineComp = LOAN_OFFICERS.reduce((s, lo) => s + lo.totalComp, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white/90">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-white/[0.05] bg-[#0A0A0A]/90 backdrop-blur-sm px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">💰</span>
            <div>
              <h1 className="text-[15px] font-semibold text-white/85">Finance</h1>
              <p className="text-[11px] text-white/30">Dream House Lending · CFO Dashboard · March 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] text-white/35">Snapshot · Mar 2026</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-7xl">
        {/* Top summary pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-white/35 mb-0.5">Active Loans (pipeline)</p>
            <p className="text-2xl font-black text-white/85">{totalActiveLoans}</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-white/35 mb-0.5">Total Pipeline Comp</p>
            <p className="text-2xl font-black text-white/85">{fmt(totalPipelineComp)}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-4 py-3">
            <p className="text-[11px] text-white/35 mb-0.5">Company Revenue (splits)</p>
            <p className="text-2xl font-black text-emerald-400">{fmt(totalCompanyRevenue)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-white/35 mb-0.5">Loan Officers</p>
            <p className="text-2xl font-black text-white/85">{LOAN_OFFICERS.length}</p>
          </div>
        </div>

        {/* Section 1: P&L */}
        <div>
          <SectionHeader title="Monthly P&L Overview" subtitle="Bank statement data — March 2026" />
          <PLCard />
        </div>

        {/* Section 2: Expense Breakdown */}
        <ExpenseBreakdown />

        {/* Section 3: LO Scorecards */}
        <div>
          <SectionHeader title="Loan Officer Scorecards" subtitle="Pipeline data — active loans &amp; comp splits" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {LOAN_OFFICERS.map((lo) => (
              <LOScorecard key={lo.name} lo={lo} />
            ))}
          </div>
        </div>

        {/* Section 4: Credit Report ROI */}
        <CreditROICard />

        {/* Section 5: Key Metrics */}
        <KeyMetricsCard />

        {/* Section 6: Personal Burn Rate */}
        <PersonalBurnRateCard />

        {/* Section 7: Alerts */}
        <AlertsCard />

        {/* Footer note */}
        <div className="rounded-lg border border-white/[0.03] bg-white/[0.01] px-4 py-3">
          <p className="text-[11px] text-white/25 text-center">
            Data is hardcoded from March 2026 bank statement and pipeline snapshot · Upload invoices to refine credit report costs · Connect accounting software for real-time P&amp;L
          </p>
        </div>
      </div>
    </div>
  );
}
