"use client";

import { useMemo, useState } from "react";

type ViewMode = "company" | "personal";
type Tone = "green" | "amber" | "red" | "slate";

const fmt = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);

const pct = (n: number) => `${n.toFixed(1)}%`;

const companyRevenue = [
  { month: "Jan", revenue: 41497 },
  { month: "Feb", revenue: 35920 },
  { month: "Mar", revenue: 58593 },
  { month: "Apr", revenue: 80668, projected: true },
];

const pnlRows = [
  { month: "Jan", revenue: 41497, expenses: 19561, loComp: 24189, net: -2253 },
  { month: "Feb", revenue: 35920, expenses: 19561, loComp: 18579, net: -2220 },
  { month: "Mar", revenue: 58593, expenses: 19561, loComp: 33953, net: 5079 },
  { month: "Apr*", revenue: 80668, expenses: 19561, loComp: 23000, net: 38107 },
];

const loPerformance = [
  { name: "Alfonso Garza", deals: 17, ytdDeals: 17, revenueGenerated: 93973, comp: 107700, retention: 87, avgDeal: 6332, tone: "green" as Tone, note: "The standard" },
  { name: "Emmanuel Duran", deals: 11, ytdDeals: 11, revenueGenerated: 23952, comp: 65600, retention: 36, avgDeal: 5964, tone: "red" as Tone, note: "Red flag" },
  { name: "Yanelit Trujillo", deals: 4, ytdDeals: 4, revenueGenerated: 20491, comp: 36700, retention: 56, avgDeal: 9188, tone: "amber" as Tone, note: "Watch split" },
  { name: "Alex Tucker", deals: 1, ytdDeals: 1, revenueGenerated: 3062, comp: 11300, retention: 27, avgDeal: 11300, tone: "red" as Tone, note: "Worst margin" },
];

const loPnlRows = [
  {
    name: "Emmanuel Duran",
    revenue: 29955.43,
    directComp: 19633.48,
    grossContribution: 10449.75,
    retention: 34.9,
    deals: 5,
    revenuePerDeal: 5991,
    reimbursements: 933,
    status: "Profitable before overhead, split is rich",
    action: "April file-level P&L: 5 primary funded files plus 1 JLO split. Dream House retained $10,449.75 before allocated overhead. The $933 in pass-through fees is reimbursement collected for credit pulls, not a cost. True credit cost still needs Advantage pull matching.",
    tone: "amber" as Tone,
  },
  {
    name: "Yanelit Trujillo",
    revenue: 8063.73,
    directComp: 3628.68,
    grossContribution: 4435.05,
    retention: 55.0,
    deals: 1,
    revenuePerDeal: 8064,
    reimbursements: 132,
    status: "Clean split, needs more volume",
    action: "April file-level P&L: 1 primary funded file. Dream House retained $4,435.05 before allocated overhead. The $132 in pass-through fees is reimbursement collected for credit pulls, not a cost. Split is healthier than Emmanuel, but one funded file is not enough to judge capacity.",
    tone: "green" as Tone,
  },
];

const loPnlNeeds = [
  "Revenue by funded file and LO, not just company deposits. April workbook now supplies this for funded files.",
  "LO comp paid/accrued by file and month. April workbook now supplies Due to LO / Due to JLO.",
  "Credit report pulls/vendor costs by borrower/file/LO — pass-through fees are reimbursements, so match Advantage invoice costs against reimbursements to find net leakage.",
  "Lead source cost by LO: realtor, KW, self-gen, paid, repeat/referral.",
  "Processor/admin allocation: Claudia/Nataly time or flat cost per active file.",
  "Fallout count: credit pulls/apps/docs reviewed that never funded.",
];

const companyExpenseCategories = [
  { name: "Payroll", value: 9800, color: "#34d399" },
  { name: "Office", value: 2313, color: "#60a5fa" },
  { name: "Technology", value: 1127, color: "#a78bfa" },
  { name: "Operations", value: 1654, color: "#f59e0b" },
  { name: "Marketing", value: 3500, color: "#f87171" },
  { name: "Professional", value: 950, color: "#94a3b8" },
  { name: "Insurance", value: 217, color: "#22c55e" },
];

const companyExpenseGroups = [
  {
    category: "Payroll",
    total: 9800,
    items: [["Alfonso", 5400], ["Claudia", 4400]],
  },
  {
    category: "Office",
    total: 2313,
    items: [["Mortgage 5301", 1700], ["HOA 5301", 300], ["Insurance 5301", 183], ["Spectrum", 120], ["eFax", 10]],
  },
  {
    category: "Technology",
    total: 1127,
    items: [["Anthropic", 240], ["Replit", 150], ["Monday.com", 158], ["Microsoft", 115], ["Adobe", 85], ["Slack", 108], ["Emails", 140], ["GoDaddy", 44], ["Zoom", 13], ["Time Doctor", 12], ["Calendly", 15], ["Quo Phone", 47]],
  },
  {
    category: "Operations",
    total: 1654,
    items: [["Arive", 874], ["Homebot", 200], ["Compliance", 250], ["Dropbox", 330]],
  },
  {
    category: "Marketing / Biz Dev",
    total: 3500,
    items: [["KW MSA", 2500], ["Coaching", 1000]],
  },
  {
    category: "Professional Services",
    total: 950,
    items: [["CPA", 950]],
  },
  {
    category: "Insurance",
    total: 217,
    items: [["Mercury", 162], ["Vivint", 55]],
  },
];

const savingsCuts = [
  { name: "Advantage Credit", monthly: 6600, note: "Replaced with Rocket + New Wave pulls" },
  { name: "A.V. Meal Prep", monthly: 550, note: "Non-core spend removed" },
  { name: "RAD CRM", monthly: 519, note: "Canceled" },
  { name: "Citryn marketing", monthly: 435, note: "Cut" },
];

const amexTrend = [1900, 10000, 22800, 30755];

const personalCategories = [
  { name: "Housing", value: 5435, color: "#60a5fa" },
  { name: "Kids", value: 3203, color: "#f59e0b" },
  { name: "Food", value: 2386, color: "#34d399" },
  { name: "Transportation", value: 1544, color: "#f87171" },
  { name: "Health / Fitness", value: 854.2, color: "#a78bfa" },
  { name: "Subscriptions", value: 413.84, color: "#94a3b8" },
  { name: "Personal Care", value: 516, color: "#fb7185" },
  { name: "Kids Activities", value: 226, color: "#facc15" },
  { name: "Phone", value: 150, color: "#22c55e" },
];

const personalExpenseGroups = [
  { category: "Housing", total: 5435, items: [["Home mortgage", 4000], ["HELOC", 850], ["Water", 100], ["Internet", 100], ["Landscape", 200], ["Pest control", 185]] },
  { category: "Kids", total: 3203, items: [["Enzo school", 950], ["Enzo lunches", 90], ["Gianni school", 1080], ["Romeo daycare", 1083]] },
  { category: "Food", total: 2386, items: [["Groceries", 1516], ["Eating out", 870]] },
  { category: "Transportation", total: 1544, items: [["Gas driving", 1100], ["Car insurance", 168], ["Car wash", 216], ["Car maintenance", 50], ["Car tags", 10]] },
  { category: "Health / Fitness", total: 854.2, items: [["Gym trainer", 725], ["CLTV", 100], ["BodyXchange", 20], ["MyFitnessPal", 6.7], ["Sleep tracker", 2.5]] },
  { category: "Subscriptions", total: 413.84, items: [["Disney", 16], ["ESPN", 12], ["Netflix", 18], ["Peacock", 17], ["Hulu", 10], ["YouTube Premium", 19], ["Amazon Prime", 8.99], ["MLS Season Pass", 6.6], ["Apple Fitness", 10], ["ChatGPT", 20], ["Plaud AI", 8.25], ["Facebook Meta", 15], ["Instagram Meta", 15], ["iCloud", 10], ["Costco", 11], ["Sam's Club", 11], ["Holders Gold", 55], ["Storage", 90], ["Gearhead Blackbox", 35]] },
  { category: "Personal Care", total: 516, items: [["Barber", 216], ["Northwestern Insurance", 300]] },
  { category: "Kids Activities", total: 226, items: [["Child ref fees", 91], ["Enzo club", 100], ["Gianni club", 35]] },
  { category: "Phone", total: 150, items: [["Verizon", 150]] },
];

const ratioCards = [
  { label: "Revenue per deal", value: "$4,287", tone: "green" as Tone },
  { label: "Revenue per employee", value: "$20,211/mo", tone: "green" as Tone },
  { label: "Comp ratio", value: "36%", tone: "amber" as Tone },
  { label: "Expense ratio", value: "48%", tone: "amber" as Tone },
  { label: "Breakeven", value: "5 deals/mo", tone: "slate" as Tone },
];

const aprilStatementSnapshot = [
  { label: "Chase business checking", value: 51307.35, meta: "Ending balance 4/30 • deposits $173,494.56 • withdrawals $146,150.98 incl. checks/debit/ACH/fees", tone: "green" as Tone },
  { label: "Amex Delta Reserve", value: 30755.24, meta: "Due 5/2 • min $1,056 • interest $545.45 • new charges $17,454.77", tone: "red" as Tone },
  { label: "Capital One Spark", value: 2823.52, meta: "Due 5/3 • min $28 • new charges $13,459.50 • paid $18,201.04", tone: "amber" as Tone },
  { label: "Advantage credit reports", value: 7122.0, meta: "4/30 invoices paid/zero due: $4,178.50 + $2,943.50", tone: "amber" as Tone },
];

const aprilCfoFindings = [
  "Business checking ended April at $51,307.35 after $173,494.56 deposits. Strong cash inflow, but withdrawals were heavy.",
  "Amex is the pressure point: $30,755.24 balance and $545.45 interest charged. Minimum payment thinking is not acceptable here.",
  "Capital One Spark is manageable at $2,823.52, but charges were still $13,459.50 for the period.",
  "Advantage report invoices total $7,122.00 and show $0 due, but this needs categorization by LO/person for true cost-to-originate.",
];

const aprilCloseChecklist = [
  { owner: "Fonz", task: "Confirm funded April files + expected gross comp per file", status: "Needed before CFO signs off" },
  { owner: "CFO", task: "Separate revenue received vs April commissions still pending", status: "Month-close item" },
  { owner: "CFO", task: "Review payroll, LO comp, Claudia/Nataly pay, bonuses, and reimbursements", status: "Required" },
  { owner: "Fonz", task: "Explain uncategorized, personal, or gray-area business charges", status: "Only exceptions" },
  { owner: "CFO", task: "Calculate tax set-aside, owner draw capacity, and debt-paydown order", status: "Decision output" },
];

const cfoOrders = [
  "Close April first: revenue received, pending comp, payroll, owner draws, and tax set-aside.",
  "Do not spend from projected revenue until it is received and categorized.",
  "Attack high-interest cards before adding new plays; Amex balance is the pressure point.",
  "Use Mission Control as the monthly close dashboard, not a bookkeeping replacement.",
];

const revenuePerLoan = [
  { month: "Jan", value: 4150 },
  { month: "Feb", value: 5987 },
  { month: "Mar", value: 3906 },
  { month: "Apr*", value: 8067 },
];

const costToOriginate = [
  { month: "Jan", value: 1956 },
  { month: "Feb", value: 3260 },
  { month: "Mar", value: 1304 },
  { month: "Apr*", value: 1956 },
];

const productMix = [
  { name: "FHA", deals: 15, pct: 45, color: "#60a5fa" },
  { name: "CONV", deals: 8, pct: 24, color: "#34d399" },
  { name: "Non-QM / Hard Money", deals: 7, pct: 21, color: "#f59e0b" },
  { name: "HELOC", deals: 2, pct: 6, color: "#a78bfa" },
  { name: "VA", deals: 1, pct: 3, color: "#f87171" },
];

const lenderDistribution = [
  { name: "UWM", deals: 8, pct: 24 },
  { name: "Pennymac", deals: 4, pct: 12 },
  { name: "Valley Mortgage Investment", deals: 4, pct: 12 },
  { name: "Flexpoint", deals: 3, pct: 9 },
  { name: "Other", deals: 14, pct: 42 },
];

const processorWorkload = [
  { name: "Mariana Gonzalez", files: "TBD", cycleTime: "Data coming soon" },
  { name: "Claudia Melendez", files: "TBD", cycleTime: "Data coming soon" },
  { name: "Raquel Ramos", files: "TBD", cycleTime: "Data coming soon" },
  { name: "Will Rypkema", files: "TBD", cycleTime: "Data coming soon" },
];

const personalWaterfall = [
  { stage: "Business Revenue", value: 40422, tone: "green" },
  { stage: "Expenses", value: -19561, tone: "amber" },
  { stage: "LO Comp", value: -23022, tone: "red" },
  { stage: "Business Profit", value: -2161, tone: "slate" },
  { stage: "Personal Burn", value: -15622, tone: "red" },
  { stage: "Net Retained", value: -17783, tone: "red" },
] as const;

const debtScenarios = [
  { label: "$2K/mo payments", payment: 2000, balanceInSixMonths: 21632, status: "Still too high after 6 months", shrinking: false },
  { label: "$4K/mo payments", payment: 4000, balanceInSixMonths: 9087, status: "Meaningful shrink after 6 months", shrinking: true },
];

const totalPersonalBurn = 15622;
const netAfterBusiness = 38107 - totalPersonalBurn;
const savingsRate = (netAfterBusiness / 38107) * 100;
const profitMargin = (38107 / 80668) * 100;
const revenueGrowth = ((80668 - 58593) / 58593) * 100;
const totalSavingsAnnual = 97248;

const toneMap: Record<Tone, string> = {
  green: "border-emerald-500/20 bg-emerald-500/8 text-emerald-300",
  amber: "border-amber-500/20 bg-amber-500/8 text-amber-300",
  red: "border-red-500/20 bg-red-500/8 text-red-300",
  slate: "border-white/10 bg-white/[0.03] text-white/70",
};

function MetricCard({ label, value, meta, tone = "slate" }: { label: string; value: string; meta?: string; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      {meta ? <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs ${toneMap[tone]}`}>{meta}</div> : null}
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0f141a] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/45">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function MiniBarChart({ data, target }: { data: typeof companyRevenue; target: number }) {
  const max = Math.max(...data.map((d) => d.revenue), target);
  const lineTop = `${100 - (target / max) * 100}%`;
  return (
    <div className="relative h-80">
      <div className="absolute inset-x-0 border-t border-dashed border-amber-400/60" style={{ top: lineTop }} />
      <div className="absolute right-0 -translate-y-1/2 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300" style={{ top: lineTop }}>
        Breakeven {fmt(target)}
      </div>
      <div className="flex h-full items-end gap-4 pt-8">
        {data.map((item) => {
          const height = (item.revenue / max) * 100;
          return (
            <div key={item.month} className="flex flex-1 flex-col justify-end gap-3">
              <div className="relative flex-1 rounded-2xl bg-white/[0.03] p-2">
                <div
                  className={`absolute inset-x-2 bottom-2 rounded-xl ${item.projected ? "bg-blue-400/80" : "bg-emerald-400/80"}`}
                  style={{ height: `${Math.max(height, 10)}%` }}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">{item.month}</p>
                <p className="text-xs text-white/45">{fmt(item.revenue)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonutChart({ data, size = 220, strokeWidth = 28 }: { data: Array<{ name: string; value: number; color: string }>; size?: number; strokeWidth?: number }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {data.map((item) => {
          const length = (item.value / total) * circumference;
          const dasharray = `${length} ${circumference - length}`;
          const circle = (
            <circle
              key={item.name}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += length;
          return circle;
        })}
      </g>
      <text x="50%" y="47%" textAnchor="middle" className="fill-white text-[14px] font-medium">
        {fmt(total)}
      </text>
      <text x="50%" y="57%" textAnchor="middle" className="fill-[rgba(255,255,255,0.45)] text-[10px] uppercase tracking-[0.2em]">
        monthly total
      </text>
    </svg>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 240;
  const height = 80;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * width;
      const y = height - ((v - min) / range) * (height - 10) - 5;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <polyline fill="none" stroke={color} strokeWidth="4" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HorizontalBarList({ items, valueLabel }: { items: Array<{ name: string; pct: number; deals: number; color?: string }>; valueLabel?: string }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.name}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-medium text-white">{item.name}</p>
              <p className="text-xs text-white/45">{item.deals} deals</p>
            </div>
            <span className="text-white/70">{valueLabel ? `${item.pct}${valueLabel}` : `${item.pct}%`}</span>
          </div>
          <div className="h-3 rounded-full bg-white/[0.05]">
            <div className="h-3 rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.color ?? "#60a5fa" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendCard({ title, rows, lowerIsBetter = false }: { title: string; rows: Array<{ month: string; value: number }>; lowerIsBetter?: boolean }) {
  const current = rows[rows.length - 1]?.value ?? 0;
  const prior = rows[rows.length - 2]?.value ?? 0;
  const improved = lowerIsBetter ? current <= prior : current >= prior;
  return (
    <SectionCard title={title} subtitle={lowerIsBetter ? "Lower is better" : "Higher is better"}>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-white/35">Current</p>
            <p className="mt-2 text-3xl font-semibold text-white">{fmt(current)}</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs ${improved ? toneMap.green : toneMap.red}`}>
            {improved ? "Trending right" : "Trending wrong"}
          </span>
        </div>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.month} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-sm">
              <span className="text-white/65">{row.month}</span>
              <span className="font-medium text-white">{fmt(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

export default function FinancePage() {
  const [view, setView] = useState<ViewMode>("company");
  const currentViewLabel = useMemo(() => (view === "company" ? "Company CFO View" : "Personal CFO View"), [view]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,26,34,0.96),rgba(10,14,20,0.98))] p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/35">Dream House Lending</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Finance Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/50">Hermes CFO mode: close the month, protect cash, flag debt/tax risk, and tell Fonz what financial decision actually matters.</p>
          </div>
          <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            {([
              ["company", "Company"],
              ["personal", "Personal"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${view === key ? "bg-white text-slate-950 shadow-sm" : "text-white/55 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/45">
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">April projection active</span>
          <span>{currentViewLabel}</span>
          <span>Updated from hardcoded April snapshot</span>
        </div>
      </div>

      {view === "company" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Monthly Revenue" value={fmt(80668)} meta={`↑ ${pct(revenueGrowth)} vs Mar`} tone="green" />
            <MetricCard label="Monthly Profit" value={fmt(38107)} meta="Best month in current run-rate" tone="green" />
            <MetricCard label="Profit Margin" value={pct(profitMargin)} meta={profitMargin > 40 ? "Healthy margin" : profitMargin > 20 ? "Watch margin" : "Below target"} tone={profitMargin > 40 ? "green" : profitMargin > 20 ? "amber" : "red"} />
            <MetricCard label="Cash Position" value={fmt(51307.35)} meta="Chase business checking 4/30" tone="green" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            <MetricCard label="Cost to Originate" value={fmt(1956)} meta="Apr projected • target < $2.5K/file" tone="green" />
            <MetricCard label="Revenue per Loan" value={fmt(8067)} meta="Apr projected • strongest month" tone="green" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionCard title="April CFO Closeout" subtitle="What I need before I can call April closed">
              <div className="space-y-3">
                {aprilCloseChecklist.map((item) => (
                  <div key={item.task} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/35">{item.owner}</p>
                        <p className="mt-1 text-sm font-medium text-white">{item.task}</p>
                      </div>
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/8 px-2.5 py-1 text-xs text-amber-300">{item.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Hermes CFO Orders" subtitle="The rules until April is clean">
              <div className="space-y-3">
                {cfoOrders.map((order, index) => (
                  <div key={order} className="flex gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/8 p-4 text-sm text-white/75">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-xs font-bold text-emerald-300">{index + 1}</span>
                    <p>{order}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-white/55">
                  CFO output each month: gross revenue, net profit, tax reserve, owner draw capacity, debt paydown, and uncategorized transaction list.
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionCard title="April Statement Snapshot" subtitle="Uploaded PDFs: Chase, Amex, Capital One, Advantage">
              <div className="grid gap-3 sm:grid-cols-2">
                {aprilStatementSnapshot.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/35">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{fmt(item.value, item.value % 1 ? 2 : 0)}</p>
                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${toneMap[item.tone]}`}>{item.meta}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="CFO Readout From PDFs" subtitle="What changed after reading the April documents">
              <div className="space-y-3">
                {aprilCfoFindings.map((finding, index) => (
                  <div key={finding} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-sm text-white/75">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-400/15 text-xs font-bold text-blue-300">{index + 1}</span>
                    <p>{finding}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
            <SectionCard title="Revenue Trend" subtitle="Monthly revenue to Dream House with breakeven reference">
              <MiniBarChart data={companyRevenue} target={69000} />
            </SectionCard>

            <SectionCard title="Monthly P&L" subtitle="Actual LO comp applied for Jan through Mar">
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.18em] text-white/40">
                    <tr>
                      <th className="px-4 py-3 font-medium">Month</th>
                      <th className="px-4 py-3 text-right font-medium">Revenue</th>
                      <th className="px-4 py-3 text-right font-medium">Expenses</th>
                      <th className="px-4 py-3 text-right font-medium">LO Comp</th>
                      <th className="px-4 py-3 text-right font-medium">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnlRows.map((row, i) => (
                      <tr key={row.month} className={i % 2 ? "bg-white/[0.02]" : "bg-transparent"}>
                        <td className="px-4 py-3 text-white">{row.month}</td>
                        <td className="px-4 py-3 text-right text-emerald-300">{fmt(row.revenue)}</td>
                        <td className="px-4 py-3 text-right text-white/70">{fmt(row.expenses)}</td>
                        <td className="px-4 py-3 text-right text-white/70">{fmt(row.loComp)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${row.net >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmt(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <TrendCard title="Cost to Originate Trend" rows={costToOriginate} lowerIsBetter />
            <TrendCard title="Revenue per Loan Trend" rows={revenuePerLoan} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {loPerformance.map((lo) => (
              <div key={lo.name} className="rounded-2xl border border-white/10 bg-[#11161d] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">{lo.name}</h3>
                    <p className="mt-1 text-sm text-white/45">{lo.note}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${toneMap[lo.tone]}`}>{lo.retention}% to DH</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-white/35">Deals</p>
                    <p className="mt-1 text-lg font-semibold text-white">{lo.deals}</p>
                    <p className="text-xs text-white/40">YTD {lo.ytdDeals}</p>
                  </div>
                  <div>
                    <p className="text-white/35">Revenue generated</p>
                    <p className="mt-1 text-lg font-semibold text-white">{fmt(lo.revenueGenerated)}</p>
                  </div>
                  <div>
                    <p className="text-white/35">Comp</p>
                    <p className="mt-1 text-white/80">{fmt(lo.comp)}</p>
                  </div>
                  <div>
                    <p className="text-white/35">Avg deal size</p>
                    <p className="mt-1 text-white/80">{fmt(lo.avgDeal)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SectionCard title="Loan Officer P&L" subtitle="Unit economics by LO — this is where we decide who is profitable, who needs coaching, and who gets more resources">
            <div className="grid gap-4 xl:grid-cols-2">
              {loPnlRows.map((lo) => (
                <div key={lo.name} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{lo.name}</h3>
                      <p className="mt-1 text-sm text-white/45">{lo.status}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${toneMap[lo.tone]}`}>{lo.retention.toFixed(1)}% retention</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-white/35">Revenue</p>
                      <p className="mt-1 font-semibold text-emerald-300">{fmt(lo.revenue)}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-white/35">Direct comp</p>
                      <p className="mt-1 font-semibold text-white/80">{fmt(lo.directComp)}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-white/35">Contribution</p>
                      <p className={`mt-1 font-semibold ${lo.grossContribution >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmt(lo.grossContribution)}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-white/35">Reimbursements</p>
                      <p className="mt-1 font-semibold text-orange-200">{fmt(lo.reimbursements)}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-white/35">Rev / deal</p>
                      <p className="mt-1 font-semibold text-white/80">{fmt(lo.revenuePerDeal)}</p>
                    </div>
                  </div>
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${toneMap[lo.tone]}`}>{lo.action}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-400/8 p-4">
              <p className="text-sm font-semibold text-blue-200">To make this a real LO P&L, Mission Control needs:</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {loPnlNeeds.map((item) => (
                  <div key={item} className="flex gap-2 text-sm text-white/70">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-blue-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Product Mix" subtitle="Funded mix by loan type from Monday.com data">
              <HorizontalBarList items={productMix} />
            </SectionCard>
            <SectionCard title="Lender Distribution" subtitle="Track concentration before it becomes a risk">
              <HorizontalBarList items={lenderDistribution} />
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-4">
            {processorWorkload.map((processor) => (
              <SectionCard key={processor.name} title={processor.name} subtitle="Processor workload placeholder">
                <div className="space-y-3 text-sm">
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                    <p className="text-white/45">Files handled YTD</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{processor.files}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                    <p className="text-white/45">Avg cycle time</p>
                    <p className="mt-1 text-white">{processor.cycleTime}</p>
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <SectionCard title="Expense Breakdown" subtitle="Monthly operating load by category">
              <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                <div className="mx-auto h-72 w-72">
                  <DonutChart data={companyExpenseCategories} />
                </div>
                <div className="space-y-3">
                  {companyExpenseCategories.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 text-white/70">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </div>
                      <span className="font-medium text-white">{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Expense Detail" subtitle="Grouped for cleaner budget control">
              <div className="space-y-4">
                {companyExpenseGroups.map((group) => (
                  <div key={group.category} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">{group.category}</h3>
                      <span className="text-sm text-white/60">{fmt(group.total)}/mo</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map(([label, amount]) => (
                        <div key={label} className="flex items-center justify-between text-sm text-white/65">
                          <span>{label}</span>
                          <span className="text-white">{fmt(Number(amount))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionCard title="Savings & Alerts" subtitle="Cuts already made plus what still needs attention">
              <div className="space-y-3">
                {savingsCuts.map((cut) => (
                  <div key={cut.name} className="rounded-2xl border border-emerald-500/15 bg-emerald-500/8 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{cut.name}</p>
                        <p className="mt-1 text-sm text-white/50">{cut.note}</p>
                      </div>
                      <span className="text-emerald-300">{fmt(cut.monthly)}/mo</span>
                    </div>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/35">Annual savings</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-300">{fmt(totalSavingsAnnual)}/yr</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Credit Card Health" subtitle="Debt pressure and recommended action">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-white">Amex Delta SkyMiles</p>
                      <p className="mt-1 text-sm text-red-200/85">Status: Critical</p>
                    </div>
                    <p className="text-2xl font-semibold text-red-300">{fmt(30755)}</p>
                  </div>
                  <div className="mt-4 h-24">
                    <Sparkline values={amexTrend} color="#f87171" />
                  </div>
                  <p className="text-xs text-white/45">$1.9K → $10K → $22.8K → $30.8K</p>
                  <div className="mt-4 space-y-2 text-sm text-white/70">
                    <div className="flex justify-between"><span>Interest this month</span><span className="text-white">{fmt(545)}</span></div>
                    <div className="flex justify-between"><span>Charges vs payments</span><span className="text-red-300">Gap widening</span></div>
                    <div className="flex justify-between"><span>Recommendation</span><span className="text-white">Increase autopay</span></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-white">Capital One Spark</p>
                      <p className="mt-1 text-sm text-amber-200/85">Status: Review needed</p>
                    </div>
                    <p className="text-2xl font-semibold text-amber-300">{fmt(52000)}</p>
                  </div>
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/65">
                    Gray area spend needs CPA review before treating as clean business debt.
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {ratioCards.map((ratio) => (
              <div key={ratio.label} className="rounded-2xl border border-white/10 bg-[#11161d] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/35">{ratio.label}</p>
                <p className={`mt-3 text-2xl font-semibold ${ratio.tone === "green" ? "text-emerald-300" : ratio.tone === "amber" ? "text-amber-300" : ratio.tone === "red" ? "text-red-300" : "text-white"}`}>{ratio.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Monthly Burn" value={fmt(totalPersonalBurn)} meta="Current household run-rate" tone="red" />
            <MetricCard label="Biggest Categories" value="Housing / Kids / Food" meta="5.4k / 3.2k / 2.4k" tone="amber" />
            <MetricCard label="Net After Business" value={fmt(netAfterBusiness)} meta="Business profit less personal burn" tone={netAfterBusiness > 0 ? "green" : "red"} />
            <MetricCard label="Savings Rate" value={pct(savingsRate)} meta={savingsRate > 25 ? "Retaining cash" : "Too thin"} tone={savingsRate > 25 ? "green" : "amber"} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <SectionCard title="Personal Expense Breakdown" subtitle="Monthly household categories">
              <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                <div className="mx-auto h-72 w-72">
                  <DonutChart data={personalCategories} />
                </div>
                <div className="space-y-3">
                  {personalCategories.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 text-white/70">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </div>
                      <span className="font-medium text-white">{fmt(item.value, item.value % 1 ? 2 : 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Personal Expense Detail" subtitle="Exact line items from the household budget snapshot">
              <div className="space-y-4">
                {personalExpenseGroups.map((group) => (
                  <div key={group.category} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">{group.category}</h3>
                      <span className="text-sm text-white/60">{fmt(group.total, group.total % 1 ? 2 : 0)}/mo</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map(([label, amount]) => (
                        <div key={label} className="flex items-center justify-between text-sm text-white/65">
                          <span>{label}</span>
                          <span className="text-white">{fmt(Number(amount), Number(amount) % 1 ? 2 : 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard title="Monthly Cash Flow Waterfall" subtitle="Business revenue to personal retention using current average month">
              <div className="space-y-4">
                {personalWaterfall.map((item) => {
                  const width = Math.min((Math.abs(item.value) / 40422) * 100, 100);
                  const color = item.tone === "green" ? "#34d399" : item.tone === "amber" ? "#f59e0b" : item.tone === "red" ? "#f87171" : "#94a3b8";
                  return (
                    <div key={item.stage}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-white/60">{item.stage}</span>
                        <span className={item.value >= 0 ? "text-white" : "text-red-300"}>{item.value >= 0 ? fmt(item.value) : `-${fmt(Math.abs(item.value))}`}</span>
                      </div>
                      <div className="h-3 rounded-full bg-white/[0.05]">
                        <div className="h-3 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <div className="space-y-6">
              <SectionCard title="Debt Paydown Tracker" subtitle="Amex path is red at current pace, healthier at higher payments">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-white/45">Current Amex balance</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{fmt(30755)}</p>
                      </div>
                      <span className="rounded-full border border-red-500/20 bg-red-500/8 px-2.5 py-1 text-xs text-red-300">{fmt(545)}/mo interest</span>
                    </div>
                  </div>
                  {debtScenarios.map((scenario) => {
                    const width = (scenario.balanceInSixMonths / 30755) * 100;
                    return (
                      <div key={scenario.label} className={`rounded-2xl border p-4 ${scenario.shrinking ? "border-emerald-500/20 bg-emerald-500/8" : "border-red-500/20 bg-red-500/8"}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-white">{scenario.label}</p>
                            <p className="mt-1 text-sm text-white/60">Balance in 6 months: {fmt(scenario.balanceInSixMonths)}</p>
                          </div>
                          <span className={`text-sm ${scenario.shrinking ? "text-emerald-300" : "text-red-300"}`}>{scenario.status}</span>
                        </div>
                        <div className="mt-3 h-3 rounded-full bg-white/[0.06]">
                          <div className="h-3 rounded-full" style={{ width: `${width}%`, backgroundColor: scenario.shrinking ? "#34d399" : "#f87171" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Net Worth Snapshot" subtitle="Placeholders for a fuller balance sheet later">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {[
                    ["Crypto", "~$1,150", "Kraken BTC"],
                    ["Real estate equity", "TBD", "Needs updated equity calc"],
                    ["Business value", "TBD", "Needs valuation method"],
                    ["Total", "TBD", "Incomplete snapshot"],
                  ].map(([label, value, note]) => (
                    <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                      <p className="text-sm text-white/45">{label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                      <p className="mt-1 text-xs text-white/40">{note}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
