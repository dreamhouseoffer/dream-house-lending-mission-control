"use client";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const revenueMonths = [
  { month: "Jan", deals: 10, grossComp: 65366, toDH: 41497, note: "10 funded deals" },
  { month: "Feb", deals: 6, grossComp: 54229, toDH: 35920, note: "6 funded deals" },
  { month: "Mar", deals: 15, grossComp: 92415, toDH: 58593, note: "15 funded deals" },
  {
    month: "Apr",
    deals: 2,
    grossComp: 0,
    toDH: 80668,
    note: "2 funded, pipeline closes this week",
    funded: 5468,
    pipeline: 75200,
    projected: true,
  },
];

const pnlMonths = [
  { month: "Jan", revenue: 41497, expenses: 19561, loComp: 6912, net: 15024 },
  { month: "Feb", revenue: 35920, expenses: 19561, loComp: 5313, net: 11046 },
  { month: "Mar", revenue: 58593, expenses: 19561, loComp: 9698, net: 29334 },
  { month: "Apr", revenue: 80668, expenses: 19561, loComp: 23000, net: 38107, projected: true },
];

const activeExpenses = [
  ["Alfonso payroll", 5400],
  ["Claudia payroll", 4400],
  ["KW MSA", 2500],
  ["Mortgage 5301", 1700],
  ["Growth Only Coaching", 1000],
  ["CPA", 950],
  ["Arive", 874],
  ["Dropbox", 330],
  ["HOA", 300],
  ["Compliance", 250],
  ["Anthropic", 240],
  ["Homebot", 200],
  ["Insurance 5301", 183],
  ["Mercury Insurance", 162],
  ["Monday.com", 158],
  ["Replit", 150],
  ["Emails", 140],
  ["Spectrum", 120],
  ["Microsoft", 115],
  ["Slack", 108],
  ["Adobe", 85],
  ["Vivint", 55],
  ["Quo phone", 47],
  ["GoDaddy", 44],
  ["Calendly", 15],
  ["Zoom", 13],
  ["Time Doctor", 12],
  ["eFax", 10],
] as const;

const cutExpenses = [
  { label: "Advantage Credit", amount: 6600, note: "moved to free pulls via Rocket/New Wave" },
  { label: "A.V. Meal Prep", amount: 550, note: "non-business spend cut" },
  { label: "RAD CRM", amount: 519, note: "canceled" },
  { label: "Citryn marketing", amount: 435, note: "cut" },
];

const loScorecards = [
  { name: "Alfonso", deals: 17, pct: 87, dh: 93973, gross: 107674, badge: "Best margin", tone: "emerald" },
  { name: "Emmanuel", deals: 11, pct: 36, dh: 23952, gross: 65643, badge: "Worst margin", tone: "red" },
  { name: "Yanelit", deals: 4, pct: 56, dh: 20491, gross: 36675, badge: "Healthy split", tone: "amber" },
  { name: "Alex", deals: 1, pct: 27, dh: 3062, gross: 11341, badge: "Low sample", tone: "slate" },
] as const;

const alerts = [
  { level: "red", text: "Amex balance at $30,755, accruing interest, autopay too low" },
  { level: "red", text: "LO/JLO comp at ~$23K/mo exceeds business profit at average revenue" },
  { level: "yellow", text: "Emmanuel split at 36%, Dream House keeps less than he does" },
  { level: "yellow", text: "SPT Atlanta at $1,354/mo is still an unidentified recurring charge" },
  { level: "green", text: "$8,104/mo in expenses cut this month" },
  { level: "green", text: "April is projected to be the best month of the year at about $80K to DH" },
  { level: "green", text: "Credit report costs were eliminated with Rocket + New Wave free pulls" },
] as const;

const ytdToDH = 216678;
const avgMonthly = 54170;
const monthlyExpenses = 19561;
const personalBurn = 15622;

const levelClasses = {
  red: "border-red-500/30 bg-red-500/5 text-red-300",
  yellow: "border-yellow-500/30 bg-yellow-500/5 text-yellow-300",
  green: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
};

const toneClasses = {
  emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  red: "bg-red-500/10 text-red-300 border-red-500/20",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  slate: "bg-white/5 text-white/60 border-white/10",
};

export default function FinancePage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Finance</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Dream House Lending, live CFO snapshot, real parsed financials as of Apr 18, 2026
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">Alerts</h2>
        {alerts.map((alert) => (
          <div
            key={alert.text}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${levelClasses[alert.level]}`}
          >
            <span className="mt-0.5 shrink-0">{alert.level === "red" ? "🔴" : alert.level === "yellow" ? "🟡" : "🟢"}</span>
            <span>{alert.text}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "YTD to DH", value: fmt(ytdToDH), color: "text-emerald-400" },
          { label: "Monthly Avg", value: `${fmt(avgMonthly)}/mo`, color: "text-blue-400" },
          { label: "Active Expenses", value: `${fmt(monthlyExpenses)}/mo`, color: "text-amber-400" },
          { label: "Personal Burn", value: `${fmt(personalBurn)}/mo`, color: "text-red-400" },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
            <p className="text-[11px] text-white/40 mb-1">{card.label}</p>
            <p className={`text-xl font-semibold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.25fr,0.95fr]">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">YTD Revenue</h2>
            <span className="text-xs text-white/35">Monday.com fundings, hardcoded latest snapshot</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-white/40 text-xs uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Month</th>
                  <th className="px-4 py-3 text-left font-medium">Deals</th>
                  <th className="px-4 py-3 text-right font-medium">Gross comp</th>
                  <th className="px-4 py-3 text-right font-medium">To DH</th>
                </tr>
              </thead>
              <tbody>
                {revenueMonths.map((row, i) => (
                  <tr key={row.month} className={i % 2 ? "bg-white/[0.01]" : ""}>
                    <td className="px-4 py-3 text-white">
                      <div className="flex items-center gap-2">
                        <span>{row.month}</span>
                        {row.projected ? (
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-300">
                            Projected
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/35 mt-1">{row.note}</div>
                    </td>
                    <td className="px-4 py-3 text-white/70">{row.deals}</td>
                    <td className="px-4 py-3 text-right font-mono text-white/70">{row.grossComp ? fmt(row.grossComp) : "Pipeline"}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-300">{fmt(row.toDH)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-xs uppercase tracking-widest text-white/30">April detail</p>
              <p className="text-lg font-semibold text-white mt-2">{fmt(5468)} funded</p>
              <p className="text-sm text-white/55 mt-1">{fmt(75200)} closing this week</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-xs uppercase tracking-widest text-white/30">YTD total</p>
              <p className="text-lg font-semibold text-emerald-400 mt-2">{fmt(ytdToDH)}</p>
              <p className="text-sm text-white/55 mt-1">Trend is improving with April</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-xs uppercase tracking-widest text-white/30">Monthly average</p>
              <p className="text-lg font-semibold text-blue-400 mt-2">{fmt(avgMonthly)}</p>
              <p className="text-sm text-white/55 mt-1">Up meaningfully vs prior run rate</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">Credit Card Tracker</h2>
            <span className="text-xs text-white/35">Amex summary plus Spark review</span>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-white font-medium">Amex Delta SkyMiles</p>
                <p className="text-sm text-red-200/80 mt-1">Balance is trending up fast, this is the red flag on the page.</p>
              </div>
              <p className="text-2xl font-semibold text-red-300">{fmt(30755)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3">
                <p className="text-white/40 text-xs uppercase tracking-widest">Balance history</p>
                <p className="text-white/80 mt-2">$1,902 → $10,087 → $22,755 → $30,755</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3">
                <p className="text-white/40 text-xs uppercase tracking-widest">Interest</p>
                <p className="text-white/80 mt-2">$897 YTD, about $545/mo current pace</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3">
                <p className="text-white/40 text-xs uppercase tracking-widest">Autopay</p>
                <p className="text-white/80 mt-2">$500/week, about $2,000/mo</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3">
                <p className="text-white/40 text-xs uppercase tracking-widest">Call</p>
                <p className="text-white/80 mt-2">Increase to $1,000/week minimum</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-4">
            <p className="text-white font-medium">Spark Capital One</p>
            <p className="text-sm text-white/65 mt-2">Used for mixed business and personal spend.</p>
            <p className="text-sm text-yellow-300 mt-1">Gray area: about $52K needs CPA review.</p>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">Monthly P&amp;L</h2>
          <span className="text-xs text-white/35">Revenue | Expenses | LO Comp | Net</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {pnlMonths.map((month) => (
            <div key={month.month} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-white">{month.month}</p>
                {month.projected ? (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-300">
                    Projected
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-white/65"><span>Revenue</span><span className="font-mono text-emerald-300">{fmt(month.revenue)}</span></div>
                <div className="flex justify-between text-white/65"><span>Expenses</span><span className="font-mono">{fmt(month.expenses)}</span></div>
                <div className="flex justify-between text-white/65"><span>LO Comp</span><span className="font-mono">~{fmt(month.loComp)}</span></div>
                <div className="h-px bg-white/10" />
                <div className="flex justify-between text-white"><span>Net</span><span className="font-mono text-blue-300">{fmt(month.net)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.05fr,0.95fr]">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">Active Business Expenses</h2>
            <span className="text-xs text-white/35">{fmt(monthlyExpenses)}/mo post-cuts</span>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {activeExpenses.map(([label, amount], i) => (
                  <tr key={label} className={i % 2 ? "bg-white/[0.01]" : ""}>
                    <td className="px-4 py-2.5 text-white/70">{label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white">{fmt(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">Recently Cut Expenses</h2>
            <span className="text-xs text-emerald-300">{fmt(8104)}/mo saved</span>
          </div>
          <div className="space-y-3">
            {cutExpenses.map((item) => (
              <div key={item.label} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{item.label} <span className="ml-1">✂️</span></p>
                    <p className="text-sm text-white/55 mt-1">{item.note}</p>
                  </div>
                  <p className="text-lg font-semibold text-emerald-300">{fmt(item.amount)}</p>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-xs uppercase tracking-widest text-white/30">Total savings</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold text-emerald-400">{fmt(8104)}/mo</p>
                <p className="text-sm text-white/55">{fmt(97248)}/yr</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">LO Scorecards</h2>
          <span className="text-xs text-white/35">Updated with parsed YTD split data</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loScorecards.map((lo) => (
            <div key={lo.name} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{lo.name}</p>
                  <p className="text-sm text-white/45 mt-1">{lo.deals} deals funded</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${toneClasses[lo.tone]}`}>
                  {lo.badge}
                </span>
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/35 mb-1">
                  <span>To DH</span>
                  <span>{lo.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full ${lo.tone === "red" ? "bg-red-400/70" : lo.tone === "emerald" ? "bg-emerald-400/70" : lo.tone === "amber" ? "bg-amber-400/70" : "bg-white/40"}`} style={{ width: `${lo.pct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-white/30">Gross</p>
                  <p className="text-white/80 font-medium mt-1">{fmt(lo.gross)}</p>
                </div>
                <div>
                  <p className="text-white/30">To DH</p>
                  <p className="text-amber-300 font-medium mt-1">{fmt(lo.dh)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-white/30 uppercase tracking-widest font-medium">Personal Monthly Burn</p>
          <p className="text-2xl font-semibold text-red-400 mt-1">{fmt(personalBurn)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/30">Owner pressure on business cash flow</p>
          <p className="text-sm text-white/55 mt-1">Keep this visible against DH monthly profit, not just revenue.</p>
        </div>
      </section>
    </div>
  );
}
