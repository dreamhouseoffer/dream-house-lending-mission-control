"use client";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;

// YTD 2026 actuals (Jan – Apr 16) from fundings data
const los = [
  { name: "Alfonso Garza",    loans: 17, gross: 107674, toDH: 93973 },
  { name: "Emmanuel Duran",   loans: 11, gross: 65643,  toDH: 23952 },
  { name: "Yanelit Trujillo", loans: 4,  gross: 36675,  toDH: 20491 },
  { name: "Alex Tucker",      loans: 1,  gross: 11341,  toDH: 3062  },
];

const YTD_GROSS   = 221333;
const YTD_TO_DH   = 141478;
const YTD_DEALS   = 33;
const MONTHS      = 3.5; // Jan–mid Apr
const AVG_MONTHLY = Math.round(YTD_TO_DH / MONTHS);

// Monthly expense run-rate (unchanged from prior period)
const expenses = [
  { label: "Payroll (allocated)",   amount: 43547 },
  { label: "Personal draws",        amount: 12388 },
  { label: "Credit card payments",  amount: 11977 },
  { label: "Office",                amount: 2300  },
  { label: "Insurance",             amount: 2262  },
  { label: "FTB",                   amount: 1552  },
  { label: "CPA",                   amount: 950   },
  { label: "Marketing",             amount: 500   },
  { label: "Utilities",             amount: 500   },
  { label: "Software",              amount: 350   },
];
const MONTHLY_EXPENSES = expenses.reduce((s, e) => s + e.amount, 0);
const REVENUE_TARGET   = 69000;

const alerts = [
  { level: "red"    as const, text: "Credit cards consuming $12K/month" },
  { level: "red"    as const, text: "Personal $12.4K running through business" },
  { level: "red"    as const, text: `Revenue gap: need ${fmt(REVENUE_TARGET)}/mo, averaging ${fmt(AVG_MONTHLY)}/mo YTD` },
  { level: "yellow" as const, text: "LO comp splits vary widely — review retention vs growth trade-off" },
  { level: "green"  as const, text: "33 deals funded YTD · $221K gross comp generated" },
];

export default function FinancePage() {
  const ytdProfit = YTD_TO_DH - MONTHLY_EXPENSES * MONTHS;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Finance</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Dream House Lending · YTD 2026 Actuals · Jan 1 – Apr 16 ({YTD_DEALS} deals funded)
        </p>
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">Alerts</h2>
        {alerts.map((a) => (
          <div
            key={a.text}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              a.level === "red"
                ? "border-red-500/30 bg-red-500/5 text-red-300"
                : a.level === "yellow"
                ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-300"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
            }`}
          >
            <span className="shrink-0 mt-0.5">{a.level === "red" ? "⚠" : a.level === "yellow" ? "◎" : "✓"}</span>
            {a.text}
          </div>
        ))}
      </div>

      {/* YTD Summary Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">YTD 2026 Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Gross Comp Generated",  value: fmt(YTD_GROSS),           color: "text-blue-400"   },
            { label: "Revenue (Due to DH)",   value: fmt(YTD_TO_DH),           color: "text-emerald-400"},
            { label: "Monthly Avg to DH",     value: `${fmt(AVG_MONTHLY)}/mo`, color: "text-amber-400"  },
            { label: "Est. YTD Profit",       value: fmt(Math.max(0, ytdProfit)), color: ytdProfit > 0 ? "text-emerald-400" : "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-[11px] text-white/40 mb-1">{s.label}</p>
              <p className={`text-xl font-semibold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Monthly expense run-rate table */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-baseline justify-between">
            <span className="text-xs text-white/30 font-medium uppercase tracking-widest">Monthly Expense Run-Rate</span>
            <span className="text-xs text-white/40">Total: {fmt(MONTHLY_EXPENSES)}/mo</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {expenses.map((e, i) => (
                <tr key={e.label} className={i % 2 !== 0 ? "bg-white/[0.01]" : ""}>
                  <td className="px-4 py-2 text-white/60">{e.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-white/80">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LO Scorecards */}
      <div className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">LO Scorecards</h2>
          <span className="text-xs text-white/25">YTD Jan–Apr 16 · {YTD_DEALS} total deals · {fmt(YTD_TO_DH)} to DH</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {los.map((lo) => {
            const dhPct    = Math.round((lo.toDH / lo.gross) * 100);
            const loPct    = 100 - dhPct;
            const loComp   = lo.gross - lo.toDH;
            const barPct   = Math.round((lo.toDH / YTD_TO_DH) * 100);
            return (
              <div
                key={lo.name}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{lo.name}</span>
                  <span className="text-xs text-white/40">{lo.loans} deal{lo.loans !== 1 ? "s" : ""}</span>
                </div>

                {/* Gross → split row */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-white/30">Gross Comp</p>
                    <p className="text-white/80 font-medium mt-0.5">{fmt(lo.gross)}</p>
                  </div>
                  <div>
                    <p className="text-white/30">To DH ({dhPct}%)</p>
                    <p className="text-amber-400 font-medium mt-0.5">{fmt(lo.toDH)}</p>
                  </div>
                  <div>
                    <p className="text-white/30">LO Comp ({loPct}%)</p>
                    <p className="text-white/60 font-medium mt-0.5">{fmt(loComp)}</p>
                  </div>
                </div>

                {/* Bar: share of total DH revenue */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>Share of DH revenue</span>
                    <span>{barPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${barPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Personal Burn + Target */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/30 uppercase tracking-widest font-medium">Personal Monthly Burn</p>
          <p className="text-2xl font-semibold text-red-400 mt-1">$15,600</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/30">Revenue target to break even</p>
          <p className="text-lg font-medium text-white/60 mt-1">{fmt(REVENUE_TARGET)} / mo</p>
          <p className="text-xs text-white/25 mt-0.5">YTD avg: {fmt(AVG_MONTHLY)} / mo ({fmt(REVENUE_TARGET - AVG_MONTHLY)} gap)</p>
        </div>
      </div>
    </div>
  );
}
