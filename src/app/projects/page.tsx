"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ProjectTask {
  label: string;
  done: boolean;
}

interface ProjectData {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Building" | "Pending Approval" | "On Hold";
  progress: number;
  agent: string;
  tasks: ProjectTask[];
}

const statusConfig: Record<
  ProjectData["status"],
  { className: string }
> = {
  Active: {
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  Building: {
    className: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  "Pending Approval": {
    className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  },
  "On Hold": {
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  },
};

const projects: ProjectData[] = [
  {
    id: "p1",
    name: "Mission Control",
    description:
      "Internal command center for managing all agents, campaigns, and operations",
    status: "Active",
    progress: 65,
    agent: "Claude Code",
    tasks: [
      { label: "Sidebar labels", done: true },
      { label: "Cloudflare permanent URL", done: false },
      { label: "Vega net worth dashboard", done: false },
      { label: "DreamFlow integration", done: false },
    ],
  },
  {
    id: "p2",
    name: "Dream House Lending — SEO & Lead Gen",
    description:
      "Full SEO overhaul and inbound lead generation system for dreamhouselending.com",
    status: "Active",
    progress: 40,
    agent: "Mike, Jay Jay",
    tasks: [
      { label: "SEO fixes live", done: true },
      { label: "Google Search Console verified", done: true },
      { label: "FHA/VA pages published", done: true },
      { label: "8 blog posts written (pending publish)", done: false },
      { label: "8 city pages written (pending publish)", done: false },
      { label: "Lead capture form", done: false },
      { label: "Email sequence loaded", done: false },
      { label: "Agent outreach email (pending approval)", done: false },
    ],
  },
  {
    id: "p3",
    name: "Dream House Lending — Operations (Milo)",
    description:
      "Automated pipeline intelligence, agent briefings, and operational efficiency",
    status: "Active",
    progress: 35,
    agent: "Milo",
    tasks: [
      { label: "Daily pipeline brief", done: true },
      { label: "KW MSA cancellation", done: false },
      { label: "Credit report optimization", done: false },
      { label: "Arrive API integration (on hold)", done: false },
      { label: "Email setup", done: false },
    ],
  },
  {
    id: "p4",
    name: "Agent Email Campaign — KW Bakersfield",
    description:
      "Monday outreach email to 107 KW Bakersfield agents via Mailchimp",
    status: "Pending Approval",
    progress: 80,
    agent: "Jay Jay",
    tasks: [
      { label: "107 contacts uploaded to Mailchimp", done: true },
      { label: "Email drafted", done: true },
      { label: "Campaign created in Mailchimp", done: true },
      { label: "Awaiting Fonz approval to schedule", done: false },
    ],
  },
  {
    id: "p5",
    name: "DreamFlow Call Intelligence",
    description:
      "Automated mortgage sales call analysis — transcription, objection detection, coaching insights",
    status: "Building",
    progress: 20,
    agent: "Claude Code",
    tasks: [
      { label: "MVP built locally", done: true },
      { label: "Import to ORAI/Replit", done: false },
      { label: "AssemblyAI API key needed", done: false },
      { label: "QUO API research", done: false },
    ],
  },
  {
    id: "p6",
    name: "Vega — Financial Intelligence",
    description:
      "Personal net worth tracking, market analysis, and investment advisory",
    status: "Active",
    progress: 45,
    agent: "Vega",
    tasks: [
      { label: "Net worth analysis complete", done: true },
      { label: "Business P&L analysis complete", done: true },
      { label: "Daily market brief live (7am)", done: true },
      { label: "Net worth dashboard in Mission Control", done: false },
      { label: "Live crypto/stock prices (partial)", done: false },
    ],
  },
  {
    id: "p7",
    name: "Millan — Daily Intelligence Brief",
    description:
      "Personal 7am briefing — mortgage markets, Bakersfield weather, family/mindset",
    status: "Active",
    progress: 85,
    agent: "Millan",
    tasks: [
      { label: "Brief format designed", done: true },
      { label: "7am cron scheduled", done: true },
      { label: "Delivery to Telegram", done: true },
      { label: "Verify consistent delivery", done: false },
    ],
  },
  {
    id: "p8",
    name: "Nova — Social Media",
    description:
      "Content creation and brand management across Instagram, LinkedIn, Facebook, YouTube",
    status: "Building",
    progress: 30,
    agent: "Nova",
    tasks: [
      { label: "Week 1 content calendar", done: true },
      { label: "Week 2 content calendar", done: true },
      { label: "Content Queue in Mission Control", done: true },
      { label: "Social account access", done: false },
      { label: "First post", done: false },
    ],
  },
];

export default function ProjectsPage() {
  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Projects
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Track progress across all active and planned initiatives.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {projects.map((project) => {
          const status = statusConfig[project.status];
          const doneCount = project.tasks.filter((t) => t.done).length;
          return (
            <div
              key={project.id}
              className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-5 transition-colors hover:border-white/[0.10]"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-sm font-bold text-white">
                  {project.name}
                </h2>
                <Badge className={status.className}>{project.status}</Badge>
              </div>

              <p className="mb-4 text-sm leading-relaxed text-white/50">
                {project.description}
              </p>

              <div className="mb-1 flex items-center justify-between text-xs text-white/40">
                <span>Progress</span>
                <span className="tabular-nums">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="mb-4" />

              <div className="mb-3 flex items-center gap-2 text-xs text-white/40">
                <span className="rounded bg-white/[0.06] px-2 py-0.5 text-white/60">
                  {project.agent}
                </span>
                <span className="ml-auto tabular-nums">
                  {doneCount}/{project.tasks.length} tasks
                </span>
              </div>

              <ul className="space-y-1">
                {project.tasks.map((task, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs leading-relaxed"
                  >
                    <span className={task.done ? "text-emerald-400" : "text-white/20"}>
                      {task.done ? "✓" : "○"}
                    </span>
                    <span
                      className={
                        task.done
                          ? "text-white/40 line-through"
                          : "text-white/60"
                      }
                    >
                      {task.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
