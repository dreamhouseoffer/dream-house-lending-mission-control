import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  HeartPulse,
  LockKeyhole,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

function getMorningBriefStamp() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(now);

  return `${date} · ${time}`;
}

const todayMoves = [
  {
    label: "Revenue",
    title: "Protect closings + follow-up",
    owner: "Fonz / Claudia / Nathaly",
    next: "Review stuck files, hot leads, and one lead source before touching anything else.",
    icon: Target,
    accent: "emerald",
  },
  {
    label: "CFO",
    title: "Know the money picture",
    owner: "Fonz",
    next: "Cash, reserves, bills, debt, tax set-aside, BTC DCA. No guessing.",
    icon: CircleDollarSign,
    accent: "amber",
  },
  {
    label: "Health / Family",
    title: "Do not outrun recovery",
    owner: "Fonz",
    next: "Hydration, food, WHOOP recovery, family anchors. Output is capped by energy.",
    icon: HeartPulse,
    accent: "rose",
  },
];

const moneySignals = [
  { label: "Income target", value: "$69K/mo" },
  { label: "Current avg", value: "~$40K/mo" },
  { label: "Focus", value: "1 lead source" },
  { label: "Rule", value: "No new plays" },
];

const parked = [
  "Generic task backlog",
  "Raw docs/tools/memory pages",
  "Extra content experiments",
  "New investing side quests",
];

const accentClasses = {
  emerald: "border-emerald-400/18 bg-emerald-500/[0.055] text-emerald-300",
  amber: "border-amber-400/18 bg-amber-500/[0.055] text-amber-300",
  rose: "border-rose-400/18 bg-rose-500/[0.055] text-rose-300",
};

export default function ProjectsPage() {
  const generatedAt = getMorningBriefStamp();

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.018))] p-5 shadow-2xl shadow-black/35 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                  CEO OS · Simple Mode
                </Badge>
                <Badge className="border-white/10 bg-white/10 text-white/55">
                  Updated {generatedAt}
                </Badge>
              </div>
              <h1 className="text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                Today’s Mission Board
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/52 sm:text-base">
                Three decisions only: what closes loans, what protects cash, and what protects energy. Everything else is parked.
              </p>
            </div>

            <div className="rounded-3xl border border-red-400/15 bg-red-500/[0.045] p-4 lg:w-[310px]">
              <div className="mb-2 flex items-center gap-2 text-red-300">
                <LockKeyhole className="size-4" />
                <p className="text-xs font-black uppercase tracking-[0.2em]">Rule</p>
              </div>
              <p className="text-sm leading-6 text-white/68">
                No new plays until pipeline + CFO data are clean and one lead source is locked.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {todayMoves.map((move, index) => {
            const Icon = move.icon;
            return (
              <article
                key={move.label}
                className={`rounded-3xl border p-5 ${accentClasses[move.accent as keyof typeof accentClasses]}`}
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
                      Priority 0{index + 1} · {move.label}
                    </p>
                    <h2 className="mt-2 text-xl font-black text-white">{move.title}</h2>
                  </div>
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-current/20 bg-black/25">
                    <Icon className="size-5" />
                  </div>
                </div>

                <div className="space-y-3 text-sm leading-6">
                  <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Owner</p>
                    <p className="text-white/75">{move.owner}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Next move</p>
                    <p className="text-white/75">{move.next}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center gap-2 text-white/72">
              <ArrowRight className="size-5 text-emerald-300" />
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Operating Flow</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {moneySignals.map((signal) => (
                <div key={signal.label} className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/28">{signal.label}</p>
                  <p className="mt-2 text-xl font-black text-white/88">{signal.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.045] p-4">
              <div className="mb-2 flex items-center gap-2 text-emerald-300">
                <Banknote className="size-4" />
                <p className="text-xs font-black uppercase tracking-[0.18em]">Data needed next</p>
              </div>
              <p className="text-sm leading-6 text-white/62">
                Vercel PIN first. Then Airtable/Arive pipeline, cash snapshot, monthly expenses, tax reserve, and WHOOP trend feed.
              </p>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center gap-2 text-white/72">
              <ShieldAlert className="size-5 text-red-300" />
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Parked on Purpose</h2>
            </div>
            <div className="space-y-2">
              {parked.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-3 text-sm text-white/58">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-xs font-black text-red-300">×</span>
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="rounded-3xl border border-purple-400/15 bg-purple-500/[0.04] p-5">
          <div className="mb-3 flex items-center gap-2 text-purple-200">
            <CalendarClock className="size-5" />
            <h2 className="text-sm font-black uppercase tracking-[0.18em]">Morning Question</h2>
          </div>
          <p className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            “What one thing moves revenue or protects cash today?”
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-white/45">
            <Users className="size-4" /> If it does not answer that, delegate it, park it, or delete it.
          </p>
        </section>
      </div>
    </main>
  );
}
