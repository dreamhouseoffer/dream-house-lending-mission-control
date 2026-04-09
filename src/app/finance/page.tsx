"use client";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const los = [
  { name: "Alfonso", loans: 15, toDH: 87000, keepPct: 100 },
  { name: "Emmanuel", loans: 11, toDH: 24000, keepPct: 55 },
  { name: "Yanelit", loans: 4, toDH: 20500, keepPct: 45 },
  { name: "Alex", loans: 1, toDH: 3000, keepPct: 70 },
];

const expenses = [
  { label: "Payroll (allocated)", amount: 43547 },
  { label: "Personal draws", amount: 12388 },
  { label: "Credit card payments", amount: 11977 },
  { label: "Office", amount: 2300 },
  { label: "Insurance", amount: 2262 },
  { label: "FTB", amount: 1552 },
  { label: "CPA", amount: 950 },
  { label: "Marketing", amount: 500 },
  { label: "Utilities", amount: 500 },
  { label: "Software", amount: 350 },
];

const alerts = [
  { level: "red" as const, text: "Credit cards consuming $12K/month" },
  { level: "red" as const, text: "Personal $12.4K running through business" },
  { level: "red" as const, text: "Revenue gap: need $69K/month, averaging $44K" },
  { level: "yellow" as const, text: "10 approved loans need to move to CTC" },
  { level: "green" as const, text: "Rocket Pro free pulls can save $3–5K/month" },
];

export default function FinancePage() {
  const totalDH = los.reduce((s, lo) => s + lo.toDH, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Finance</h1>
        <p className="text-sm text-white/40 mt-0.5">Dream House Lending · March 2026 P&amp;L + YTD Scorecards (Jan–Apr 8)</p>
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

      {/* P&L Summary Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/30">March 2026 P&amp;L</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Revenue (Due to DH)", value: "$49,534", color: "text-emerald-400" },
            { label: "Business Expenses", value: "$27,860", color: "text-red-400" },
            { label: "Business Profit", value: "$21,674", color: "text-amber-400" },
            { label: "Net Cash Flow", value: "~$437", color: "text-white/60" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-[11px] text-white/40 mb-1">{s.label}</p>
              <p className={`text-xl font-semibold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Expense table */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-2.5 text-xs text-white/30 font-medium">Expense</th>
                <th className="text-right px-4 py-2.5 text-xs text-white/30 font-medium">Amount</th>
              </tr>
            </thead>
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
          <span className="text-xs text-white/25">YTD Jan–Apr 8 · Total to DH: {fmt(totalDH)}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {los.map((lo) => {
            const kept = Math.round(lo.toDH * (lo.keepPct / 100));
            const barPct = Math.round((lo.toDH / totalDH) * 100);
            return (
              <div
                key={lo.name}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{lo.name}</span>
                  <span className="text-xs text-white/40">{lo.loans} loan{lo.loans !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">To DH</span>
                    <span className="text-amber-400 font-medium">{fmt(lo.toDH)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${barPct}%` }} />
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">DH keeps {lo.keepPct}%</span>
                  <span className="text-white/60">{fmt(kept)} retained</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Personal Burn */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/30 uppercase tracking-widest font-medium">Personal Monthly Burn</p>
          <p className="text-2xl font-semibold text-red-400 mt-1">$15,600</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/30">Revenue target to break even</p>
          <p className="text-lg font-medium text-white/60 mt-1">$69,000 / mo</p>
        </div>
      </div>
    </div>
  );
}
