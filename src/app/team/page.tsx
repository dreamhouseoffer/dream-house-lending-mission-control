"use client";

import { useEffect, useState } from "react";
import { getTeam } from "@/lib/store";
import { TeamMember } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Cpu, Clock } from "lucide-react";

const statusColor: Record<TeamMember["status"], string> = {
  active: "bg-emerald-500",
  idle: "bg-yellow-500",
  offline: "bg-red-500",
};

const statusLabel: Record<TeamMember["status"], string> = {
  active: "Active",
  idle: "Idle",
  offline: "Offline",
};

interface AgentStatusEntry {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  tz: string;
  model: string;
  lastRunAt: string | null;
  lastStatus: string;
  lastDurationMs: number | null;
  consecutiveErrors: number;
  nextRunAt: string | null;
  lastError: string | null;
}

interface AgentStatusData {
  lastUpdated: string;
  agents: AgentStatusEntry[];
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function AgentStatusDot({ status }: { status: string }) {
  if (status === "ok" || status === "success") {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Success
      </span>
    );
  }
  if (status === "error" || status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-red-400 text-xs">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-white/30 text-xs">
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white/20" />
      </span>
      Idle
    </span>
  );
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatusData | null>(null);

  useEffect(() => {
    setTeam(getTeam());
    fetch("/api/agent-status")
      .then((r) => r.json())
      .then(setAgentStatus)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Mission Statement Banner */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-4">
            Mission
          </p>
          <p className="text-base sm:text-lg leading-relaxed text-white/70 sm:text-xl">
            Build a lean, AI-powered operation that generates income and wealth
            without requiring your constant presence&nbsp;&mdash; so your time
            goes to family, faith, and ownership.
          </p>
        </div>
      </div>

      {/* Scrolling Ticker */}
      <div className="relative overflow-hidden border-b border-white/[0.06]" style={{ height: 32 }}>
        <style>{`
          @keyframes team-marquee {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
        <div
          className="whitespace-nowrap absolute top-0 left-0"
          style={{
            animation: "team-marquee 25s linear infinite",
            fontSize: 12,
            color: "#4ade80",
            fontFamily: "monospace",
            lineHeight: "32px",
            paddingLeft: "100%",
          }}
        >
          Mike: Mapping Kern County keywords... &nbsp;│&nbsp; Jay Jay: Drafting email sequence... &nbsp;│&nbsp; Milo: Monitoring 15 active files... &nbsp;│&nbsp; Millan: Preparing morning briefing... &nbsp;│&nbsp; Nova: Scheduling this week&apos;s content... &nbsp;│&nbsp; Vega: Scanning market data... &nbsp;│&nbsp; Jarvis: Reviewing deliverables... &nbsp;│&nbsp; Claude Code: Building features... &nbsp;│&nbsp; System: All clear ✓
        </div>
      </div>

      {/* Live Agent Status */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white/80">Live Agent Status</h2>
          {agentStatus?.lastUpdated && (
            <span className="text-xs text-white/30">
              Updated {formatRelativeTime(agentStatus.lastUpdated)}
            </span>
          )}
        </div>

        {agentStatus?.agents && agentStatus.agents.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {agentStatus.agents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white/90 truncate">{agent.name}</p>
                    <p className="text-[11px] text-white/30 font-mono mt-0.5">{agent.schedule} ({agent.tz?.replace("America/", "")})</p>
                  </div>
                  <AgentStatusDot status={agent.lastStatus} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2">
                    <p className="text-[10px] text-white/30 mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Last Run
                    </p>
                    <p className="text-xs text-white/70">{formatRelativeTime(agent.lastRunAt)}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{formatDateTime(agent.lastRunAt)}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2">
                    <p className="text-[10px] text-white/30 mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Next Run
                    </p>
                    <p className="text-xs text-white/70">{formatRelativeTime(agent.nextRunAt)}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{formatDateTime(agent.nextRunAt)}</p>
                  </div>
                </div>

                {agent.lastError && (
                  <p className="mt-2 text-[11px] text-red-400/80 bg-red-500/10 rounded px-2 py-1 font-mono truncate">
                    {agent.lastError}
                  </p>
                )}

                {agent.lastDurationMs && (
                  <p className="mt-2 text-[10px] text-white/20">
                    Duration: {(agent.lastDurationMs / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
            <p className="text-sm text-white/30">Loading agent status...</p>
          </div>
        )}
      </div>

      {/* Org Structure */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
        <h2 className="mb-4 text-base sm:text-lg font-semibold tracking-tight text-white/80">Org Structure</h2>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 sm:p-6 overflow-x-auto">
          <div className="flex flex-col items-center gap-1 font-mono text-sm min-w-[320px]">
            <span className="text-white/70 font-semibold">Fonz — Owner / CEO</span>
            <span className="text-white/20">│</span>
            <span className="text-white/70 font-semibold">Jarvis 🦞 — Primary AI</span>
            <span className="text-white/20">│</span>
            <div className="text-white/20 text-center">┌──────────────┬──────────────┬──────────────┐</div>
            <div className="grid grid-cols-5 gap-4 w-full text-center mt-1">
              <div>
                <p className="text-xs font-bold text-emerald-400/80 uppercase tracking-wider mb-2">Dream House Lending</p>
                <p className="text-white/50 text-xs">Mike — SEO & Content</p>
                <p className="text-white/50 text-xs">Jay Jay — Lead Capture</p>
                <p className="text-white/50 text-xs">Milo — Lending Ops</p>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-400/80 uppercase tracking-wider mb-2">Intelligence</p>
                <p className="text-white/50 text-xs">Millan — Personal Intel</p>
              </div>
              <div>
                <p className="text-xs font-bold text-purple-400/80 uppercase tracking-wider mb-2">Brand</p>
                <p className="text-white/50 text-xs">Nova — Social Media</p>
              </div>
              <div>
                <p className="text-xs font-bold text-cyan-400/80 uppercase tracking-wider mb-2">Engineering</p>
                <p className="text-white/50 text-xs">Claude Code — Dev</p>
              </div>
              <div>
                <p className="text-xs font-bold text-yellow-400/80 uppercase tracking-wider mb-2">Finance</p>
                <p className="text-white/50 text-xs">Vega ⚡ — Financial Intel</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Grid */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-12">
        <h1 className="mb-6 text-xl sm:text-2xl font-semibold tracking-tight">Team</h1>

        <div className="grid gap-4 sm:grid-cols-2">
          {team.map((member) => (
            <div
              key={member.id}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 sm:p-5 transition-colors hover:bg-white/[0.05]"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                    {member.type === "human" ? (
                      <User className="h-4 w-4 text-white/50" />
                    ) : (
                      <Bot className="h-4 w-4 text-white/50" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-medium leading-tight truncate">
                      {member.name}
                    </h2>
                    <p className="text-sm text-white/40 truncate">{member.role}</p>
                  </div>
                </div>

                {/* Status dot */}
                <div className="flex items-center gap-2 pt-1 shrink-0">
                  <span className="relative flex h-2.5 w-2.5">
                    {member.status === "active" && (
                      <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusColor[member.status]} opacity-40`}
                      />
                    )}
                    <span
                      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusColor[member.status]}`}
                    />
                  </span>
                  <span className="text-xs text-white/30">
                    {statusLabel[member.status]}
                  </span>
                </div>
              </div>

              {/* Badges */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-white/[0.1] text-white/60 text-[11px]"
                >
                  {member.type === "human" ? "Human" : "AI"}
                </Badge>
                {member.model && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px]">
                    <Cpu className="h-3 w-3 text-white/30" />
                    <code className="font-mono text-white/50">
                      {member.model}
                    </code>
                  </span>
                )}
              </div>

              {/* Responsibilities */}
              <p className="mt-3 text-sm leading-relaxed text-white/40">
                {member.responsibilities}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
