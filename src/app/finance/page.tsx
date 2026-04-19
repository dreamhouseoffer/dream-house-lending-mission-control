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

const waterfallData = [
  { stage: "Revenue", value: 80668, color: "#34d399" },
  { stage: "OpEx", value: 19561, color: "#f59e0b" },
  { stage: "LO Comp", value: 23000, color: "#f87171" },
  { stage: "Profit", value: 38107, color: "#60a5fa" },
  { stage: "Personal Burn", value: 15622, color: "#fb7185" },
  { stage: "Net Retained", value: 22485, color: "#a78bfa" },
];

const ratioCards = [
  { label: "Revenue per deal", value: "$4,287", tone: "green" as Tone },
  { label: "Revenue per employee", value: "$20,211/mo", tone: "green" as Tone },
  { label: "Comp ratio", value: "57%", tone: "red" as Tone },
  { label: "Expense ratio", value: "48%", tone: "amber" as Tone },
  { label: "Breakeven", value: "5 deals/mo", tone: "slate" as Tone },
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
            <p className="mt-2 max-w-2xl text-sm text-white/50">Executive dashboard for company and personal cash performance, built for fast weekly CFO review.</p>
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
            <MetricCard label="Cash Position" value={fmt(23964)} meta="Last known Chase balance" tone="slate" />
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
            <SectionCard title="Monthly Cash Flow Waterfall" subtitle="How company cash flows through to household retention">
              <div className="space-y-4">
                {waterfallData.map((item) => {
                  const max = 80668;
                  return (
                    <div key={item.stage}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-white/60">{item.stage}</span>
                        <span className="text-white">{fmt(item.value)}</span>
                      </div>
                      <div className="h-3 rounded-full bg-white/[0.05]">
                        <div className="h-3 rounded-full" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <div className="space-y-6">
              <SectionCard title="Debt Tracker" subtitle="Known debt obligations and review gaps">
                <div className="space-y-3">
                  {[
                    ["Amex balance", fmt(30755), "Critical"],
                    ["Home mortgage", "TBD", "Add balance"],
                    ["HELOC", "TBD", "Add balance"],
                    ["Monthly debt service", fmt(4850), "Known mortgage + HELOC only"],
                  ].map(([label, value, note]) => (
                    <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-white/45">{label}</p>
                          <p className="mt-1 text-xl font-semibold text-white">{value}</p>
                        </div>
                        <span className="text-xs text-white/45">{note}</span>
                      </div>
                    </div>
                  ))}
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
