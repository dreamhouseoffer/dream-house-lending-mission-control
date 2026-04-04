"use client";

import { getTools } from "@/lib/store";
import { type Tool } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import {
  GitGraph,
  Calculator,
  Sun,
  Bell,
  DollarSign,
  type LucideIcon,
} from "lucide-react";

const statusConfig: Record<
  Tool["status"],
  { label: string; className: string }
> = {
  live: {
    label: "Live",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  building: {
    label: "Building",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  },
  planned: {
    label: "Planned",
    className: "bg-white/10 text-white/50 border-white/10",
  },
};

const iconMap: Record<string, LucideIcon> = {
  t1: GitGraph,
  t2: Calculator,
  t3: Sun,
  t4: Bell,
  t5: DollarSign,
};

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    setTools(getTools());
  }, []);

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Tools</h1>
        <p className="mt-1 text-sm text-white/50">
          Custom tools and automations
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const status = statusConfig[tool.status];
          const Icon = iconMap[tool.id] ?? GitGraph;

          return (
            <div
              key={tool.id}
              className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-5 transition-colors hover:border-white/[0.10]"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04]">
                    <Icon className="h-4 w-4 text-white/60" />
                  </div>
                  <h2 className="text-sm font-bold text-white">{tool.name}</h2>
                </div>
                <Badge className={status.className}>{status.label}</Badge>
              </div>

              <p className="text-sm leading-relaxed text-white/50">
                {tool.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
