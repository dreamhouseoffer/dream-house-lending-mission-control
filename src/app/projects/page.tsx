import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Code2,
  FileText,
  Megaphone,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export const dynamic = "force-dynamic";

function getStamp() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  }).format(new Date());
}

const agents = [
  {
    name: "Hermes",
    role: "Build agent",
    status: "Working",
    doing: "Simplifying Mission Control and shipping app changes.",
    icon: Code2,
    accent: "border-blue-400/20 bg-blue-500/[0.06] text-blue-300",
  },
  {
    name: "Milo",
    role: "Pipeline agent",
    status: "Waiting on data",
    doing: "Needs Arive/Airtable connection before it can show real active files.",
    icon: ShieldCheck,
    accent: "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-300",
  },
  {
    name: "Nova",
    role: "Content agent",
    status: "Drafting",
    doing: "Building mortgage video ideas and content prompts for lead generation.",
    icon: Megaphone,
    accent: "border-purple-400/20 bg-purple-500/[0.06] text-purple-300",
  },
  {
    name: "Vega",
    role: "Finance agent",
    status: "Monitoring",
    doing: "Tracks finance/market context; needs clean CFO inputs for personal dashboard.",
    icon: TrendingUp,
    accent: "border-amber-400/20 bg-amber-500/[0.06] text-amber-300",
  },
  {
    name: "Mike",
    role: "SEO agent",
    status: "Parked",
    doing: "SEO work stays secondary until one lead source is locked.",
    icon: Search,
    accent: "border-pink-400/20 bg-pink-500/[0.06] text-pink-300",
  },
  {
    name: "Jay Jay",
    role: "Automation agent",
    status: "Queued",
    doing: "Lead follow-up and email automation after pipeline data is connected.",
    icon: Bot,
    accent: "border-cyan-400/20 bg-cyan-500/[0.06] text-cyan-300",
  },
];

const activeProjects = [
  {
    name: "Mission Control App",
    state: "Active",
    progress: 78,
    summary: "Private dashboard, simplified projects board, Vercel deployment, mobile access.",
    current: "Clean up Projects tab into an actual work board.",
  },
  {
    name: "PIN / Private Access",
    state: "Needs Vercel",
    progress: 70,
    summary: "Login gate exists. Live protection needs Vercel environment variable set and redeploy.",
    current: "Add MISSION_CONTROL_PIN in Vercel Production env.",
  },
  {
    name: "Pipeline Data",
    state: "Blocked",
    progress: 25,
    summary: "Pipeline page exists, but real Arive/Airtable data is not connected yet.",
    current: "Need Airtable base/table/token or Arive data path.",
  },
  {
    name: "Video Studio",
    state: "Testing",
    progress: 35,
    summary: "Content page has first mortgage scripts and a rough draft video workflow.",
    current: "Decide if this becomes real Fonz-on-camera content or stays parked.",
  },
  {
    name: "CFO Dashboard",
    state: "Planned",
    progress: 20,
    summary: "Finance page exists; needs cash, expenses, debt, tax reserve, and net-worth inputs.",
    current: "Connect data after privacy gate is active.",
  },
];

const blockers = [
  "Vercel PIN env var not set yet on Production.",
  "Airtable/Arive pipeline credentials not connected.",
  "CFO dashboard needs real personal/business finance inputs.",
];

const stateClass: Record<string, string> = {
  Active: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
  "Needs Vercel": "border-amber-400/20 bg-amber-500/10 text-amber-300",
  Blocked: "border-red-400/20 bg-red-500/10 text-red-300",
  Testing: "border-purple-400/20 bg-purple-500/10 text-purple-300",
  Planned: "border-white/10 bg-white/[0.06] text-white/50",
};

export default function ProjectsPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.035] p-5 shadow-2xl shadow-black/35 sm:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge className="mb-3 border-white/10 bg-white/10 text-white/55">
                Projects · Updated {getStamp()}
              </Badge>
              <h1 className="text-4xl font-black tracking-[-0.05em] text-white sm:text-6xl">
                Active work board
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-base">
                What the agents are doing, what projects are active, and what is blocked. No CEO philosophy.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.045] p-4 text-sm text-white/60 md:w-[260px]">
              <p className="font-bold text-emerald-300">Current app focus</p>
              <p className="mt-1 leading-6">Make Mission Control useful on your phone before adding more modules.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300/70">Agents</p>
                <h2 className="mt-1 text-2xl font-black">What they are doing</h2>
              </div>
              <Bot className="size-6 text-white/22" />
            </div>
            <div className="space-y-3">
              {agents.map((agent) => {
                const Icon = agent.icon;
                return (
                  <article key={agent.name} className={`rounded-2xl border p-4 ${agent.accent}`}>
                    <div className="flex gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-black/25">
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-white">{agent.name}</h3>
                          <Badge className="border-current/20 bg-black/20 text-current">{agent.status}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-white/35">{agent.role}</p>
                        <p className="mt-2 text-sm leading-6 text-white/65">{agent.doing}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300/70">Projects</p>
                <h2 className="mt-1 text-2xl font-black">Actively working on</h2>
              </div>
              <FileText className="size-6 text-white/22" />
            </div>
            <div className="space-y-3">
              {activeProjects.map((project) => (
                <article key={project.name} className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black text-white">{project.name}</h3>
                      <p className="mt-1 text-sm leading-6 text-white/45">{project.summary}</p>
                    </div>
                    <Badge className={stateClass[project.state]}>{project.state}</Badge>
                  </div>
                  <div className="mb-3 flex items-center justify-between text-xs text-white/35">
                    <span>Progress</span>
                    <span className="font-mono text-white/65">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} />
                  <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                    <p className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/28">
                      <Clock3 className="size-3" /> Current item
                    </p>
                    <p className="text-sm leading-6 text-white/65">{project.current}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-red-400/15 bg-red-500/[0.035] p-5">
          <div className="mb-4 flex items-center gap-2 text-red-300">
            <CircleAlert className="size-5" />
            <h2 className="text-sm font-black uppercase tracking-[0.18em]">Blocked / needs input</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {blockers.map((blocker) => (
              <div key={blocker} className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-sm leading-6 text-white/62">
                {blocker}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.035] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" />
            <div>
              <h2 className="font-black text-white">What this board is for</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">
                A quick status page: agents, active projects, blockers. The CEO/CFO thinking belongs in Finance or Briefs, not here.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
