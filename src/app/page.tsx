"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { getTasks, saveTasks, getActivity, addActivity } from "@/lib/store";
import type { Task, TaskStatus, Assignee, Priority, ActivityEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Activity,
  Filter,
  Calendar,
  GripVertical,
  Zap,
} from "lucide-react";

const columns: { id: TaskStatus; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const priorityColors: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

const assigneeLabel: Record<Assignee, string> = {
  atlas: "Jarvis \u{1F99E}",
  fonz: "Fonz",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------
function TaskCard({ task }: { task: Task }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-2 hover:bg-white/[0.05] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-white/90 leading-snug">
          {task.title}
        </span>
        <GripVertical className="size-3.5 shrink-0 text-white/20 mt-0.5" />
      </div>

      {task.description && (
        <p className="text-xs text-white/40 leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${priorityColors[task.priority]}`}
            title={task.priority}
          />
          <Badge
            variant="secondary"
            className="text-[10px] h-[18px] px-1.5 bg-white/[0.06] text-white/60 border-0"
          >
            {assigneeLabel[task.assignee]}
          </Badge>
        </div>
        <span className="text-[10px] text-white/30 flex items-center gap-1">
          <Calendar className="size-2.5" />
          {formatDate(task.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------
function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const typeColors: Record<ActivityEvent["type"], string> = {
    task: "bg-blue-500",
    system: "bg-emerald-500",
    agent: "bg-purple-500",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <Activity className="size-4 text-white/40" />
        <h2 className="text-sm font-medium text-white/90">Live Activity Feed</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="flex items-start gap-2.5 py-2 border-b border-white/[0.04] last:border-0"
          >
            <span
              className={`size-1.5 rounded-full mt-1.5 shrink-0 ${typeColors[ev.type]}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/70 leading-relaxed">{ev.text}</p>
              <span className="text-[10px] text-white/30">
                {formatTime(ev.timestamp)}
              </span>
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-xs text-white/30 py-4 text-center">
            No activity yet.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Task Dialog
// ---------------------------------------------------------------------------
function AddTaskDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (task: Omit<Task, "id" | "createdAt">) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("atlas");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("backlog");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), description: description.trim(), assignee, priority, status });
    setTitle("");
    setDescription("");
    setAssignee("atlas");
    setPriority("medium");
    setStatus("backlog");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#111] border border-white/[0.08]">
        <DialogHeader>
          <DialogTitle className="text-white/90">Add Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-white/50">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="bg-white/[0.04] border-white/[0.08] text-white/90 placeholder:text-white/25"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/50">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="bg-white/[0.04] border-white/[0.08] text-white/90 placeholder:text-white/25 min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-white/50">Assignee</label>
              <Select value={assignee} onValueChange={(v) => setAssignee(v as Assignee)}>
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/[0.08]">
                  <SelectItem value="atlas">Jarvis</SelectItem>
                  <SelectItem value="fonz">Fonz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-white/50">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/[0.08]">
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-white/50">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/[0.08]">
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full bg-white/10 hover:bg-white/15 text-white/90 border-white/[0.08]">
            <Plus className="size-4 mr-1" />
            Create Task
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// AI Cost Widget
// ---------------------------------------------------------------------------
interface CostData {
  lastUpdated: string;
  todayCost: number;
  yesterdayCost: number;
  last7DaysCost: number;
  monthToDateCost: number;
  dailyBreakdown: { date: string; cost: number }[];
  topModels: { model: string; cost: number; percentage: number }[];
  monthlyBudget: number;
  optimizationNote: string;
  error?: string;
}

function AICostWidget() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      const json: CostData = await res.json();
      setData(json);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  const maxDailyCost = data?.dailyBreakdown?.length
    ? Math.max(...data.dailyBreakdown.map((d) => d.cost), 0.001)
    : 1;

  const budgetPct = data ? Math.min((data.monthToDateCost / data.monthlyBudget) * 100, 100) : 0;
  const budgetColor = budgetPct >= 80 ? (budgetPct >= 95 ? "bg-red-500" : "bg-orange-500") : "bg-emerald-500";

  return (
    <div className="border border-white/[0.06] rounded-lg bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <h2 className="text-sm font-medium text-white/90">AI Operations Cost</h2>
        </div>
        <span className="text-[10px] text-white/30">
          Updated {data?.lastUpdated ?? "—"}
        </span>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-xs text-white/30">Loading usage data...</div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Metric Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Month-to-Date</p>
              <p className="text-lg font-semibold text-purple-400">${data?.monthToDateCost?.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Today</p>
              <p className="text-lg font-semibold text-emerald-400">${data?.todayCost?.toFixed(2)}</p>
              {(data?.todayCost ?? 0) > 20 && (
                <p className="text-[10px] text-amber-400 mt-0.5">⚠ Over $20 today</p>
              )}
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Yesterday</p>
              <p className="text-lg font-semibold text-red-400">${data?.yesterdayCost?.toFixed(2)}</p>
              {(data?.yesterdayCost ?? 0) > 50 && (
                <p className="text-[10px] text-red-400/80 mt-0.5">⚠ Peak build day</p>
              )}
            </div>
          </div>

          {/* Budget Progress */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                Monthly Budget — ${data?.monthToDateCost?.toFixed(2)} / ${data?.monthlyBudget}
              </p>
              <span className={`text-[10px] font-mono ${budgetPct >= 80 ? "text-orange-400" : "text-white/50"}`}>
                {budgetPct.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetColor}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
          </div>

          {/* Daily Costs Bar Chart */}
          {data?.dailyBreakdown && data.dailyBreakdown.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Daily Cost (Last 7 Days)</p>
              <div className="flex items-end gap-2 h-20">
                {data.dailyBreakdown.slice(-7).map((d) => {
                  const pct = Math.max((d.cost / maxDailyCost) * 100, 4);
                  const isHigh = d.cost > 50;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-white/40 font-mono">${d.cost.toFixed(0)}</span>
                      <div
                        className={`w-full rounded-sm transition-colors ${isHigh ? "bg-red-500/60 hover:bg-red-500/80" : "bg-purple-500/60 hover:bg-purple-500/80"}`}
                        style={{ height: `${pct}%` }}
                        title={`${d.date}: $${d.cost.toFixed(2)}`}
                      />
                      <span className="text-[9px] text-white/30">{d.date}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Models */}
          {data?.topModels && data.topModels.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Cost by Model</p>
              <div className="space-y-1.5">
                {data.topModels.map((m) => (
                  <div key={m.model} className="flex items-center gap-3">
                    <span className="text-[11px] text-white/60 w-36 shrink-0 truncate">{m.model}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500/70"
                        style={{ width: `${m.percentage}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-white/40 font-mono w-14 text-right">${m.cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optimization Status + Footer */}
          <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Zap className="size-3 text-amber-400" />
              <span className="text-[11px] text-white/50">
                Light context enabled ✅ | Haiku routing in progress
              </span>
            </div>
            <span className="text-[10px] text-white/25 block">Powered by Claude (Anthropic) via OpenClaw</span>
          </div>

          {data?.error && (
            <p className="text-[10px] text-amber-400/60 mt-1">⚠ {data.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTasks(getTasks());
    setActivity(getActivity());
    setMounted(true);
  }, []);

  const persist = useCallback(
    (updated: Task[]) => {
      setTasks(updated);
      saveTasks(updated);
    },
    []
  );

  const refreshActivity = useCallback(() => {
    setActivity(getActivity());
  }, []);

  // Drag end handler
  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const newStatus = destination.droppableId as TaskStatus;
    const updated = tasks.map((t) =>
      t.id === draggableId ? { ...t, status: newStatus } : t
    );

    // Reorder within column
    const colTasks = updated.filter((t) => t.status === newStatus);
    const others = updated.filter((t) => t.status !== newStatus);
    const [moved] = colTasks.splice(
      colTasks.findIndex((t) => t.id === draggableId),
      1
    );
    colTasks.splice(destination.index, 0, moved);

    persist([...others, ...colTasks]);

    if (source.droppableId !== destination.droppableId) {
      const task = tasks.find((t) => t.id === draggableId);
      const destLabel = columns.find((c) => c.id === newStatus)?.label;
      addActivity(
        `Task "${task?.title}" moved to ${destLabel}`,
        "task"
      );
      refreshActivity();
    }
  }

  // Add task handler
  function handleAddTask(data: Omit<Task, "id" | "createdAt">) {
    const newTask: Task = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    persist([newTask, ...tasks]);
    addActivity(`Task created: ${newTask.title}`, "task");
    refreshActivity();
  }

  // Filter tasks
  const filteredTasks =
    filterAssignee === "all"
      ? tasks
      : tasks.filter((t) => t.assignee === filterAssignee);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <span className="text-white/30 text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white/90 flex">
      {/* Left Panel — Activity Feed */}
      <aside className="w-72 shrink-0 border-r border-white/[0.06] bg-white/[0.02] flex flex-col h-screen sticky top-0">
        <ActivityFeed events={activity} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h1 className="text-lg font-semibold tracking-tight text-white/90">
            Task Board
          </h1>

          <div className="flex items-center gap-3">
            {/* Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="size-3.5 text-white/40" />
              <Select
                value={filterAssignee}
                onValueChange={(v) => setFilterAssignee(v as string)}
              >
                <SelectTrigger
                  size="sm"
                  className="bg-white/[0.04] border-white/[0.08] text-white/70 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/[0.08]">
                  <SelectItem value="all">All Assignees</SelectItem>
                  <SelectItem value="atlas">Jarvis</SelectItem>
                  <SelectItem value="fonz">Fonz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Add Task */}
            <Button
              size="sm"
              className="bg-white/10 hover:bg-white/15 text-white/90 border-white/[0.08]"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-3.5 mr-1" />
              Add Task
            </Button>
          </div>
        </header>

        {/* AI Operations Cost Widget */}
        <div className="px-6 pt-6">
          <AICostWidget />
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-6">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full min-h-0">
              {columns.map((col) => {
                const colTasks = filteredTasks.filter(
                  (t) => t.status === col.id
                );
                return (
                  <div
                    key={col.id}
                    className="flex flex-col w-72 shrink-0"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white/70">
                          {col.label}
                        </span>
                        <span className="text-[11px] text-white/30 bg-white/[0.06] rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                          {colTasks.length}
                        </span>
                      </div>
                    </div>

                    {/* Droppable Column */}
                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 space-y-2 rounded-lg p-2 transition-colors min-h-[120px] ${
                            snapshot.isDraggingOver
                              ? "bg-white/[0.04] border border-dashed border-white/[0.12]"
                              : "bg-transparent border border-transparent"
                          }`}
                        >
                          {colTasks.map((task, index) => (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={
                                    snapshot.isDragging
                                      ? "opacity-90 rotate-1"
                                      : ""
                                  }
                                >
                                  <TaskCard task={task} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        </div>
      </main>

      {/* Add Task Dialog */}
      <AddTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={handleAddTask}
      />
    </div>
  );
}
