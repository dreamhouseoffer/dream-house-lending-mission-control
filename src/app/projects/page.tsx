import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Flame,
  Gauge,
  LineChart,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

interface OperatingLane {
  id: string;
  label: string;
  role: "CEO" | "CFO" | "Family" | "Operators";
  score: number;
  value: string;
  target: string;
  signal: "green" | "yellow" | "red" | "blue" | "purple";
  brief: string;
}

interface ProjectTask {
  label: string;
  done: boolean;
}

interface ProjectData {
  id: string;
  name: string;
  owner: string;
  category: "Revenue" | "Operating System" | "Finance" | "Marketing" | "Health" | "Life";
  status: "Active" | "Building" | "Pending Approval" | "On Hold";
  leverage: "High" | "Medium" | "Low";
  progress: number;
  nextMove: string;
  risk: string;
  tasks: ProjectTask[];
}

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

  return `Morning command brief · ${date} · ${time}`;
}

const signalClass: Record<OperatingLane["signal"], string> = {
  green: "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-300",
  yellow: "border-amber-400/30 bg-amber-500/[0.08] text-amber-300",
  red: "border-red-400/30 bg-red-500/[0.08] text-red-300",
  blue: "border-blue-400/30 bg-blue-500/[0.08] text-blue-300",
  purple: "border-purple-400/30 bg-purple-500/[0.08] text-purple-300",
};

const statusConfig: Record<ProjectData["status"], string> = {
  Active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  Building: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  "Pending Approval": "bg-amber-500/15 text-amber-300 border-amber-500/20",
  "On Hold": "bg-zinc-500/15 text-zinc-300 border-zinc-500/20",
};

const categoryClass: Record<ProjectData["category"], string> = {
  Revenue: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  "Operating System": "text-purple-300 bg-purple-500/10 border-purple-500/20",
  Finance: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  Marketing: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  Health: "text-rose-300 bg-rose-500/10 border-rose-500/20",
  Life: "text-blue-300 bg-blue-500/10 border-blue-500/20",
};

const operatingLanes: OperatingLane[] = [
  {
    id: "rev",
    label: "Mortgage Revenue Engine",
    role: "CEO",
    score: 58,
    value: "$40K avg/mo",
    target: "$69K/mo target",
    signal: "yellow",
    brief: "Pipeline and lead-source focus matter more than another tool build.",
  },
  {
    id: "cash",
    label: "Personal CFO + Net Worth",
    role: "CFO",
    score: 42,
    value: "Needs live ledger",
    target: "Weekly cash command",
    signal: "blue",
    brief: "Tie business income, household burn, BTC DCA, reserves, and debt into one view.",
  },
  {
    id: "projects",
    label: "Active Project Load",
    role: "CEO",
    score: 64,
    value: "8 live plays",
    target: "3 critical lanes",
    signal: "red",
    brief: "Too many open loops. Kill, park, or delegate everything outside revenue + finance + health.",
  },
  {
    id: "team",
    label: "Operator Leverage",
    role: "Operators",
    score: 51,
    value: "Claudia/Nathaly + agents",
    target: "3–5 killer team",
    signal: "purple",
    brief: "Every morning should show who owns the next move — not just project status.",
  },
  {
    id: "health",
    label: "Founder Health System",
    role: "Family",
    score: 73,
    value: "Labs strong / recovery watch",
    target: "Energy without crashes",
    signal: "green",
    brief: "Track sleep, hydration, training load, and fasting risk before business output.",
  },
];

const projects: ProjectData[] = [
  {
    id: "p1",
    name: "Mission Control — CEO Operating System",
    owner: "Hermes",
    category: "Operating System",
    status: "Building",
    leverage: "High",
    progress: 72,
    nextMove: "Turn this page into the daily source of truth, then wire automated data feeds.",
    risk: "Overbuilding before the revenue cadence is locked.",
    tasks: [
      { label: "Linear command visual", done: true },
      { label: "CEO/CFO project map", done: true },
      { label: "Morning refresh automation", done: false },
      { label: "Live finance data feeds", done: false },
    ],
  },
  {
    id: "p2",
    name: "Dream House Lending — Revenue Engine",
    owner: "Fonz / Claudia / Nathaly",
    category: "Revenue",
    status: "Active",
    leverage: "High",
    progress: 58,
    nextMove: "Pick one lead source for 30 days and run the same follow-up scorecard daily.",
    risk: "Splitting energy across SEO, agents, content, and systems at the same time.",
    tasks: [
      { label: "Pipeline visibility", done: true },
      { label: "One lead source locked", done: false },
      { label: "Daily follow-up rhythm", done: false },
      { label: "Weekly conversion review", done: false },
    ],
  },
  {
    id: "p3",
    name: "Vega — Personal CFO / Investing Brain",
    owner: "Vega",
    category: "Finance",
    status: "Active",
    leverage: "High",
    progress: 46,
    nextMove: "Connect net worth, cash reserves, debt, business income, Kraken/BTC, and monthly burn.",
    risk: "Good market intelligence without a personal balance-sheet command center.",
    tasks: [
      { label: "Market brief live", done: true },
      { label: "Net worth model", done: true },
      { label: "Live account balances", done: false },
      { label: "Weekly cash allocation rule", done: false },
    ],
  },
  {
    id: "p4",
    name: "Milo — Operations + Pipeline Intelligence",
    owner: "Milo",
    category: "Operating System",
    status: "Active",
    leverage: "High",
    progress: 41,
    nextMove: "Convert pipeline data into daily exceptions: locks, docs, closings, stuck files.",
    risk: "Dashboard looks useful but does not force action by owner/date.",
    tasks: [
      { label: "Daily pipeline brief", done: true },
      { label: "Arive/API path", done: false },
      { label: "Owner/date exception list", done: false },
      { label: "Processor accountability view", done: false },
    ],
  },
  {
    id: "p5",
    name: "DHL SEO + Agent Lead Gen",
    owner: "Mike / Jay Jay",
    category: "Marketing",
    status: "Pending Approval",
    leverage: "Medium",
    progress: 64,
    nextMove: "Approve or park the KW campaign. Pending approval is not a strategy.",
    risk: "Content gets created but not shipped into a measurable lead loop.",
    tasks: [
      { label: "SEO fixes live", done: true },
      { label: "GSC verified", done: true },
      { label: "KW campaign built", done: true },
      { label: "Approval / send decision", done: false },
    ],
  },
  {
    id: "p6",
    name: "Nova — Social Content Engine",
    owner: "Nova",
    category: "Marketing",
    status: "Building",
    leverage: "Medium",
    progress: 35,
    nextMove: "Ship one week of posts only if tied to a mortgage offer and lead capture path.",
    risk: "Brand activity without conversion math.",
    tasks: [
      { label: "Content calendar", done: true },
      { label: "Queue page", done: true },
      { label: "Account access", done: false },
      { label: "First measurable post", done: false },
    ],
  },
  {
    id: "p7",
    name: "Founder Health Dashboard",
    owner: "Hermes / Fonz",
    category: "Health",
    status: "Building",
    leverage: "High",
    progress: 28,
    nextMove: "Add WHOOP recovery/sleep, hydration, training load, and lab watch items.",
    risk: "Pushing output while recovery is under-managed.",
    tasks: [
      { label: "Lab baseline captured", done: true },
      { label: "WHOOP data feed", done: false },
      { label: "Syncope risk guardrails", done: false },
      { label: "Doctor-question tracker", done: false },
    ],
  },
  {
    id: "p8",
    name: "Family / Faith / Life Priorities",
    owner: "Fonz",
    category: "Life",
    status: "Active",
    leverage: "High",
    progress: 55,
    nextMove: "Protect the calendar before the business fills every gap.",
    risk: "Building a machine that wins money but steals presence.",
    tasks: [
      { label: "Kids/coaching visible", done: true },
      { label: "Church/family anchors", done: true },
      { label: "Weekly non-negotiables", done: false },
      { label: "Calendar scoring", done: false },
    ],
  },
];

const morningOrders = [
  "Revenue: what closes this week, what is stuck, who owns it?",
  "CFO: cash, reserves, BTC DCA, bills, debt, net-worth delta.",
  "People: Claudia/Nathaly/agent assignments with one next move each.",
  "Health: sleep/recovery/training/hydration risk before output.",
  "Kill list: what gets parked today so the main play wins?",
];

const financeCards = [
  { label: "Income target", value: "$69K/mo", icon: Target, note: "North-star, not vanity" },
  { label: "Current avg", value: "~$40K/mo", icon: TrendingUp, note: "Close the gap with focus" },
  { label: "BTC plan", value: "Weekly DCA", icon: LineChart, note: "Long-term, no day trading" },
  { label: "Cash command", value: "Needed", icon: Banknote, note: "Reserves + burn + debt" },
];

function completedCount(project: ProjectData) {
  return project.tasks.filter((task) => task.done).length;
}

export default function ProjectsPage() {
  const generatedAt = getMorningBriefStamp();
  const activeProjects = projects.filter((p) => p.status !== "On Hold");
  const highLeverage = projects.filter((p) => p.leverage === "High").length;
  const avgProgress = Math.round(
    projects.reduce((sum, project) => sum + project.progress, 0) / projects.length
  );

  return (
    <div className="min-h-screen overflow-hidden bg-[#070707] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative p-5 md:p-8 lg:p-10">
        <section className="mb-8 rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-2xl shadow-black/40 md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-white/10 bg-white/10 text-white/60">CEO / CFO Command Center</Badge>
                <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">Morning-updated operating view</Badge>
              </div>
              <h1 className="max-w-5xl text-4xl font-black tracking-[-0.05em] text-white md:text-6xl lg:text-7xl">
                Fonz Operating System
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-white/50 md:text-base">
                One linear view for the whole machine: revenue, active projects, team leverage,
                personal CFO, investing, health, and family priorities. This is designed to make
                the next move obvious every morning — not become another pretty dashboard.
              </p>
            </div>
            <div className="min-w-[240px] rounded-2xl border border-white/[0.07] bg-black/30 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-white/30">
                <CalendarClock className="size-4" /> Brief Stamp
              </div>
              <p className="mt-3 text-sm font-semibold text-white/75">{generatedAt}</p>
              <p className="mt-2 text-xs leading-5 text-white/35">
                Next phase: automate the data file push each morning so Vercel publishes a fresh command brief.
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-widest text-white/30">Active Projects</p>
              <p className="mt-2 text-4xl font-black tracking-tight">{activeProjects.length}</p>
              <p className="mt-1 text-xs text-red-300/70">Too many — reduce to 3 priority lanes</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-widest text-white/30">High Leverage</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-emerald-300">{highLeverage}</p>
              <p className="mt-1 text-xs text-white/35">Keep these moving, delegate the rest</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-widest text-white/30">Avg Momentum</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-blue-300">{avgProgress}%</p>
              <p className="mt-1 text-xs text-white/35">Good motion, needs fewer fronts</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-widest text-white/30">Decision Rule</p>
              <p className="mt-2 text-lg font-black tracking-tight text-amber-300">Revenue first</p>
              <p className="mt-1 text-xs text-white/35">Then CFO, health, family anchors</p>
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-3xl border border-white/[0.08] bg-black/30 p-5 md:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-purple-300/60">Linear Life Map</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">From founder energy → family wealth</h2>
            </div>
            <Gauge className="hidden size-8 text-white/20 md:block" />
          </div>

          <div className="relative overflow-x-auto pb-4">
            <div className="absolute left-8 right-8 top-[39px] hidden h-px bg-gradient-to-r from-emerald-400/40 via-amber-400/40 to-purple-400/40 md:block" />
            <div className="grid min-w-[900px] grid-cols-5 gap-4">
              {operatingLanes.map((lane, index) => (
                <div key={lane.id} className="relative">
                  <div className="mb-4 flex items-center gap-2">
                    <div className={`z-10 flex size-20 flex-col items-center justify-center rounded-full border bg-black ${signalClass[lane.signal]}`}>
                      <span className="text-2xl font-black leading-none">{lane.score}</span>
                      <span className="text-[9px] uppercase tracking-widest opacity-60">score</span>
                    </div>
                    {index < operatingLanes.length - 1 && <ArrowRight className="size-4 text-white/20" />}
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <Badge className="border-white/10 bg-white/10 text-white/50">{lane.role}</Badge>
                      <span className="text-[10px] text-white/25">0{index + 1}</span>
                    </div>
                    <h3 className="text-sm font-bold leading-5 text-white/90">{lane.label}</h3>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between gap-2"><span className="text-white/35">Now</span><span className="text-right text-white/70">{lane.value}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-white/35">Target</span><span className="text-right text-white/70">{lane.target}</span></div>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-white/40">{lane.brief}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-7">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/60">Active Project Command</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">Owner → Next Move → Risk</h2>
              </div>
              <p className="max-w-md text-xs leading-5 text-white/40">
                Anything without an owner and next move is not a project — it is mental clutter.
              </p>
            </div>

            <div className="space-y-3">
              {projects.map((project) => {
                const done = completedCount(project);
                return (
                  <article key={project.id} className="group rounded-2xl border border-white/[0.07] bg-black/25 p-4 transition-colors hover:border-white/[0.14]">
                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_160px] lg:items-center">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge className={statusConfig[project.status]}>{project.status}</Badge>
                          <Badge className={categoryClass[project.category]}>{project.category}</Badge>
                          {project.leverage === "High" && <Badge className="border-red-500/20 bg-red-500/10 text-red-300"><Flame className="mr-1 size-3" />High leverage</Badge>}
                        </div>
                        <h3 className="text-base font-bold text-white/90">{project.name}</h3>
                        <div className="mt-2 flex items-center gap-2 text-xs text-white/35">
                          <Users className="size-3.5" /> Owner: <span className="text-white/60">{project.owner}</span>
                        </div>
                      </div>

                      <div className="space-y-3 text-xs leading-5">
                        <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] p-3">
                          <div className="mb-1 flex items-center gap-2 text-emerald-300/80"><CheckCircle2 className="size-3.5" /> Next move</div>
                          <p className="text-white/60">{project.nextMove}</p>
                        </div>
                        <div className="rounded-xl border border-red-500/10 bg-red-500/[0.04] p-3">
                          <div className="mb-1 flex items-center gap-2 text-red-300/80"><ShieldAlert className="size-3.5" /> Risk</div>
                          <p className="text-white/50">{project.risk}</p>
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between text-xs text-white/35">
                          <span>Momentum</span>
                          <span className="font-mono text-white/70">{project.progress}%</span>
                        </div>
                        <Progress value={project.progress} className="mb-3" />
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/25">Checklist {done}/{project.tasks.length}</p>
                          <ul className="space-y-1.5">
                            {project.tasks.map((task) => (
                              <li key={task.label} className="flex gap-2 text-xs">
                                <span className={task.done ? "text-emerald-300" : "text-white/20"}>{task.done ? "✓" : "○"}</span>
                                <span className={task.done ? "text-white/35 line-through" : "text-white/55"}>{task.label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-amber-500/15 bg-amber-500/[0.04] p-5 md:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                  <CircleDollarSign className="size-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-amber-300/60">CFO Dashboard</p>
                  <h2 className="text-lg font-black">Money Command</h2>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {financeCards.map((card) => (
                  <div key={card.label} className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <card.icon className="size-4 text-amber-300/70" />
                      <span className="text-[10px] uppercase tracking-widest text-white/25">{card.label}</span>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-white/90">{card.value}</p>
                    <p className="mt-1 text-xs text-white/35">{card.note}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-400/10 text-purple-300">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-purple-300/60">Morning Orders</p>
                  <h2 className="text-lg font-black">What Hermes should update</h2>
                </div>
              </div>
              <ol className="space-y-3">
                {morningOrders.map((order, index) => (
                  <li key={order} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-3 text-sm leading-5 text-white/60">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/60">{index + 1}</span>
                    <span>{order}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-3xl border border-red-500/15 bg-red-500/[0.04] p-5 md:p-6">
              <div className="mb-3 flex items-center gap-2 text-red-300">
                <LockKeyhole className="size-4" />
                <h2 className="font-black">Hard Rule</h2>
              </div>
              <p className="text-sm leading-6 text-white/55">
                No new plays until Phase 1 is locked: delegate consults, lock one lead source,
                automate only what closes loans, and keep the CFO view current.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
