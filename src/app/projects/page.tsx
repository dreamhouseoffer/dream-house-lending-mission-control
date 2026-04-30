import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  CalendarClock,
  HeartPulse,
  LockKeyhole,
  ShieldAlert,
  Target,
} from "lucide-react";

export const dynamic = "force-dynamic";

function getMorningBriefStamp() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  }).format(now);

  return `${date} · ${time}`;
}

const focusCards = [
  {
    title: "Make Money",
    subtitle: "Loans, leads, closings",
    line: "Focus on the one thing most likely to create revenue today.",
    icon: Target,
    className: "border-emerald-400/18 bg-emerald-500/[0.06] text-emerald-300",
  },
  {
    title: "Protect Money",
    subtitle: "Cash, bills, taxes, BTC",
    line: "Know if money is safe, tight, or ready to deploy.",
    icon: Banknote,
    className: "border-amber-400/18 bg-amber-500/[0.06] text-amber-300",
  },
  {
    title: "Protect Energy",
    subtitle: "Health, family, recovery",
    line: "Do not burn the operator running the machine.",
    icon: HeartPulse,
    className: "border-rose-400/18 bg-rose-500/[0.06] text-rose-300",
  },
];

const simpleSignals = [
  ["Revenue target", "$69K/mo"],
  ["Current avg", "~$40K/mo"],
  ["Current rule", "One play at a time"],
];

const hiddenNoise = [
  "Owner grids",
  "Next-move lists",
  "Long project cards",
  "Raw docs/tools",
];

export default function ProjectsPage() {
  const generatedAt = getMorningBriefStamp();

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.018))] p-5 shadow-2xl shadow-black/35 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
              CEO OS
            </Badge>
            <Badge className="border-white/10 bg-white/10 text-white/55">
              {generatedAt}
            </Badge>
          </div>
          <h1 className="text-4xl font-black tracking-[-0.05em] text-white sm:text-6xl">
            Simple command center.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/55">
            No owner charts. No project maze. Just the three areas that tell you if today is on track.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {focusCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className={`rounded-3xl border p-5 ${card.className}`}>
                <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-current/20 bg-black/25">
                  <Icon className="size-6" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-65">
                  {card.subtitle}
                </p>
                <h2 className="mt-3 text-2xl font-black text-white">{card.title}</h2>
                <p className="mt-3 text-sm leading-6 text-white/62">{card.line}</p>
              </article>
            );
          })}
        </section>

        <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-white/72">
            <CalendarClock className="size-5 text-purple-300" />
            <h2 className="text-sm font-black uppercase tracking-[0.18em]">Today&apos;s Question</h2>
          </div>
          <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            What needs my attention right now?
          </p>
          <p className="mt-3 text-sm leading-6 text-white/45">
            If the answer is not revenue, cash, health, or family — it waits.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-3xl border border-amber-400/15 bg-amber-500/[0.04] p-5">
            <div className="mb-4 flex items-center gap-2 text-amber-300">
              <LockKeyhole className="size-5" />
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Current Rule</h2>
            </div>
            <p className="text-xl font-black leading-8 text-white">
              Keep the board quiet until the data is real.
            </p>
            <p className="mt-3 text-sm leading-6 text-white/52">
              First: PIN. Then pipeline. Then CFO data. Then health trends. Do not add more modules just because we can.
            </p>
          </div>

          <aside className="rounded-3xl border border-red-400/15 bg-red-500/[0.035] p-5">
            <div className="mb-4 flex items-center gap-2 text-red-300">
              <ShieldAlert className="size-5" />
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Hidden for Now</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {hiddenNoise.map((item) => (
                <div key={item} className="rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3 text-sm text-white/58">
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {simpleSignals.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/28">{label}</p>
              <p className="mt-2 text-xl font-black text-white/88">{value}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
