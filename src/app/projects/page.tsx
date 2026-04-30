import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Bot,
  CircleAlert,
  Code2,
  Database,
  KeyRound,
  Megaphone,
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
  { name: "Hermes", status: "building", detail: "App + layout", icon: Code2, color: "blue" },
  { name: "Milo", status: "blocked", detail: "Needs Arive data", icon: ShieldCheck, color: "emerald" },
  { name: "Nova", status: "drafting", detail: "Video/content", icon: Megaphone, color: "purple" },
  { name: "Vega", status: "watching", detail: "Markets/CFO", icon: TrendingUp, color: "amber" },
  { name: "Jay Jay", status: "queued", detail: "Follow-up automations", icon: Bot, color: "cyan" },
];

const projects = [
  { name: "Mission Control", status: "active", pct: 80, icon: Code2 },
  { name: "PIN Access", status: "needs vercel", pct: 70, icon: KeyRound },
  { name: "Pipeline Data", status: "blocked", pct: 25, icon: Database },
  { name: "Video Studio", status: "testing", pct: 35, icon: Megaphone },
  { name: "CFO Dashboard", status: "planned", pct: 20, icon: TrendingUp },
];

const blockers = ["Vercel PIN env", "Arive/Airtable connection", "CFO inputs"];

const colorClass: Record<string, string> = {
  blue: "border-blue-400/18 bg-blue-500/[0.055] text-blue-300",
  emerald: "border-emerald-400/18 bg-emerald-500/[0.055] text-emerald-300",
  purple: "border-purple-400/18 bg-purple-500/[0.055] text-purple-300",
  amber: "border-amber-400/18 bg-amber-500/[0.055] text-amber-300",
  cyan: "border-cyan-400/18 bg-cyan-500/[0.055] text-cyan-300",
};

const statusClass: Record<string, string> = {
  active: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
  "needs vercel": "border-amber-400/20 bg-amber-500/10 text-amber-300",
  blocked: "border-red-400/20 bg-red-500/10 text-red-300",
  testing: "border-purple-400/20 bg-purple-500/10 text-purple-300",
  planned: "border-white/10 bg-white/[0.06] text-white/45",
};

export default function ProjectsPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.035] p-5 shadow-2xl shadow-black/35 sm:p-7">
          <Badge className="mb-3 border-white/10 bg-white/10 text-white/55">
            #projects · {getStamp()}
          </Badge>
          <h1 className="text-4xl font-black tracking-[-0.05em] text-white sm:text-6xl">
            Active work
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/45">
            Agents, projects, blockers. Short status only.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">Agents</h2>
              <Badge className="border-white/10 bg-white/[0.06] text-white/45">{agents.length} live</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {agents.map((agent) => {
                const Icon = agent.icon;
                return (
                  <div key={agent.name} className={`rounded-2xl border p-4 ${colorClass[agent.color]}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl border border-current/20 bg-black/25">
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-black text-white">{agent.name}</p>
                          <span className="rounded-md border border-current/20 bg-black/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-current">
                            {agent.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-white/50">{agent.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">Projects</h2>
              <Badge className="border-white/10 bg-white/[0.06] text-white/45">{projects.length} tracked</Badge>
            </div>
            <div className="space-y-3">
              {projects.map((project) => {
                const Icon = project.icon;
                return (
                  <div key={project.name} className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/55">
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-white">{project.name}</p>
                          <Badge className={statusClass[project.status]}>{project.status}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={project.pct} className="h-2 flex-1" />
                      <span className="w-10 text-right font-mono text-xs text-white/50">{project.pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-red-400/15 bg-red-500/[0.035] p-5">
          <div className="mb-4 flex items-center gap-2 text-red-300">
            <CircleAlert className="size-5" />
            <h2 className="text-sm font-black uppercase tracking-[0.18em]">Blocked</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {blockers.map((blocker) => (
              <div key={blocker} className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-center text-sm font-bold text-white/62">
                {blocker}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
