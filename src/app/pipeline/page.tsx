import { formatDate, formatMoney, getPipelineData, type PipelineLoan } from "@/lib/airtable-pipeline";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string) {
  if (!value) return "not synced yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(new Date(value));
}

function daysUntil(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - now.getTime()) / 86_400_000);
}

function StatCard({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.03] text-white",
    good: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200",
    warn: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
    danger: "border-red-400/25 bg-red-400/[0.06] text-red-200",
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-white/40">{detail}</p>
    </div>
  );
}

function SetupBlock({ error }: { error?: string }) {
  return (
    <main className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-3xl border border-amber-400/20 bg-amber-400/[0.05] p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-200/60">#pipeline · blocked</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Airtable is not connected in this deployment.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
          Local Hermes can see the Airtable base now. Vercel still needs the same environment variables before the phone/live app can show real loan data.
        </p>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
          <p className="font-semibold text-white/80">Needed in Vercel Production env:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><code>AIRTABLE_API_KEY</code></li>
            <li><code>AIRTABLE_BASE_ID</code></li>
            <li><code>AIRTABLE_TABLE_ID</code></li>
            <li><code>MISSION_CONTROL_PIN</code></li>
          </ul>
          {error ? <p className="mt-4 text-amber-200/80">Current error: {error}</p> : null}
        </div>
      </div>
    </main>
  );
}

function LoanRow({ loan }: { loan: PipelineLoan }) {
  const lockDays = daysUntil(loan.lockExpiration);
  const closeDays = daysUntil(loan.estimatedClosingDate);
  const lockRisk = lockDays !== null && lockDays >= 0 && lockDays <= 10;
  const closeSoon = closeDays !== null && closeDays >= 0 && closeDays <= 7;

  return (
    <tr className="border-b border-white/[0.05] align-top hover:bg-white/[0.025]">
      <td className="py-3 pr-4">
        <p className="font-semibold text-white/85">{loan.borrower}</p>
        <p className="text-xs text-white/35">{loan.city || "—"}{loan.state ? `, ${loan.state}` : ""}</p>
      </td>
      <td className="py-3 pr-4 text-right font-mono text-white/75">{formatMoney(loan.loanAmount)}</td>
      <td className="py-3 pr-4">
        <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-2 py-1 text-xs font-semibold text-blue-200">{loan.stage}</span>
      </td>
      <td className="py-3 pr-4 text-white/55">{loan.processor || loan.loanOfficer || "—"}</td>
      <td className={`py-3 pr-4 text-right font-mono ${lockRisk ? "text-red-300" : "text-white/45"}`}>{formatDate(loan.lockExpiration)}</td>
      <td className={`py-3 text-right font-mono ${closeSoon ? "text-emerald-300" : "text-white/45"}`}>{formatDate(loan.estimatedClosingDate)}</td>
    </tr>
  );
}

export default async function PipelinePage() {
  const data = await getPipelineData();

  if (!data.connected) {
    return <SetupBlock error={data.error} />;
  }

  const activeLoans = data.loans.filter((loan) => loan.active);
  const urgentClosings = activeLoans
    .filter((loan) => {
      const days = daysUntil(loan.estimatedClosingDate);
      return days !== null && days >= 0 && days <= 14;
    })
    .slice(0, 6);
  const lockRisks = activeLoans
    .filter((loan) => {
      const days = daysUntil(loan.lockExpiration);
      return days !== null && days >= 0 && days <= 10;
    })
    .slice(0, 6);
  const stageEntries = Object.entries(data.stageCounts).sort((a, b) => b[1] - a[1]);

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-blue-200/55">#pipeline · live from Airtable</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Loan pipeline</h1>
              <p className="mt-2 text-sm text-white/45">Source: {data.source}. Last sync: {formatTimestamp(data.stats.lastSyncedAt)}.</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100">
              Connected: {data.stats.totalLoans} records
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Active loans" value={data.stats.activeLoans} detail={`${formatMoney(data.stats.activeVolume)} active volume`} tone="good" />
          <StatCard label="Total records" value={data.stats.totalLoans} detail={`${data.stats.closedLoans} closed · ${data.stats.cancelledLoans} cancelled`} />
          <StatCard label="Closing this month" value={data.stats.closingThisMonth} detail="active files with close dates" tone="good" />
          <StatCard label="Closing 7 days" value={data.stats.closingThisWeek} detail="watch daily" tone={data.stats.closingThisWeek ? "warn" : "neutral"} />
          <StatCard label="Lock risk" value={data.stats.locksExpiringSoon} detail="locks expiring within 10 days" tone={data.stats.locksExpiringSoon ? "danger" : "neutral"} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/55">Stage mix</h2>
            <div className="mt-4 space-y-3">
              {stageEntries.length ? stageEntries.map(([stage, count]) => {
                const pct = data.stats.activeLoans ? Math.round((count / data.stats.activeLoans) * 100) : 0;
                return (
                  <div key={stage}>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/75">{stage}</span>
                      <span className="font-mono text-white/45">{count}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-blue-400/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              }) : <p className="text-sm text-white/35">No active stage data.</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/55">Next closings</h2>
            <div className="mt-4 space-y-3">
              {urgentClosings.length ? urgentClosings.map((loan) => (
                <div key={loan.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-white/80">{loan.borrower}</p>
                    <p className="shrink-0 font-mono text-sm text-emerald-300">{formatDate(loan.estimatedClosingDate)}</p>
                  </div>
                  <p className="mt-1 text-xs text-white/35">{loan.stage} · {formatMoney(loan.loanAmount)}</p>
                </div>
              )) : <p className="text-sm text-white/35">No closings in the next 14 days.</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-red-400/15 bg-red-400/[0.035] p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-red-100/65">Lock / blocker watch</h2>
            <div className="mt-4 space-y-3">
              {lockRisks.length ? lockRisks.map((loan) => (
                <div key={loan.id} className="rounded-2xl border border-red-400/15 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-white/80">{loan.borrower}</p>
                    <p className="shrink-0 font-mono text-sm text-red-200">{formatDate(loan.lockExpiration)}</p>
                  </div>
                  <p className="mt-1 text-xs text-white/35">{loan.processor || "No processor"} · {loan.notes || "No ops note"}</p>
                </div>
              )) : <p className="text-sm text-white/35">No locks expiring within 10 days.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/55">Active files</h2>
              <p className="mt-1 text-xs text-white/35">Compact phone-safe loan board. Same data will feed #live-room.</p>
            </div>
            <p className="text-xs text-white/30">Top {Math.min(activeLoans.length, 35)} shown</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-white/35">
                <tr>
                  <th className="py-2 pr-4">Borrower</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Stage</th>
                  <th className="py-2 pr-4">Owner</th>
                  <th className="py-2 pr-4 text-right">Lock</th>
                  <th className="py-2 text-right">Close</th>
                </tr>
              </thead>
              <tbody>{activeLoans.slice(0, 35).map((loan) => <LoanRow key={loan.id} loan={loan} />)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
