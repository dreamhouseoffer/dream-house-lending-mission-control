"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { getTasks, saveTasks, getActivity, addActivity } from "@/lib/store";
import type { Task, TaskStatus, Assignee, Priority, ActivityEvent, TaskCategory } from "@/lib/types";
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
  Activity,
  Bot,
  Calendar,
  CheckCircle2,
  CircleDot,
  Filter,
  GripVertical,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";

const columns: { id: TaskStatus; label: string; hint: string }[] = [
  { id: "triage", label: "Triage", hint: "Raw brain dump" },
  { id: "ready", label: "Ready", hint: "Hermi Ops cleaned it up" },
  { id: "in_progress", label: "In Progress", hint: "Assigned and moving" },
  { id: "blocked", label: "Blocked", hint: "Needs human/data/API" },
  { id: "done", label: "Done", hint: "Completed with notes" },
];

const categoryLabels: Record<TaskCategory, string> = {
  loans: "Loans",
  finance: "Finance/CFO",
  training: "Ask Hermi Training",
  lead_gen: "Lead Gen",
  dev: "Mission Control Dev",
  team_ops: "Team Ops",
  personal: "Personal/Health",
};

const priorityColors: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
};

const assigneeLabel: Record<Assignee, string> = {
  fonz: "Fonz",
  hermi_ops: "Hermi Ops",
  hermi_dev: "Hermi Dev",
  hermi_research: "Hermi Research",
  claudia: "Claudia",
  nataly: "Nataly",
};

const agentProfiles = [
  {
    name: "Hermes Main",
    role: "Telegram orchestrator",
    model: "Brain model",
    status: "Active",
    job: "Routes work, answers Fonz, protects approvals.",
  },
  {
    name: "Hermi Ops",
    role: "Librarian / task manager",
    model: "Cheap admin model",
    status: "Ready",
    job: "Clean triage, add context, prep weekly CEO brief.",
  },
  {
    name: "Hermi Dev",
    role: "Mission Control builder",
    model: "Strong coding model",
    status: "On demand",
    job: "Dashboard, ORAI, Airtable, Vercel, Ask Hermi code.",
  },
  {
    name: "Hermi Research",
    role: "Market + lending research",
    model: "Mid-cost research model",
    status: "On demand",
    job: "Lead sources, loan programs, tax liens, land, BTC summaries.",
  },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function normalizeTasks(raw: Task[]): Task[] {
  return raw.map((task) => {
    const legacyStatus = task.status as string;
    const legacyAssignee = task.assignee as string;
    return {
      ...task,
      status:
        legacyStatus === "backlog"
          ? "triage"
          : legacyStatus === "review"
            ? "ready"
            : columns.some((col) => col.id === task.status)
              ? task.status
              : "triage",
      assignee:
        legacyAssignee === "atlas"
          ? "hermi_ops"
          : Object.keys(assigneeLabel).includes(legacyAssignee)
            ? task.assignee
            : "hermi_ops",
      category: task.category ?? "team_ops",
    } as Task;
  });
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 space-y-2 hover:bg-white/[0.055] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold text-white/90 leading-snug">{task.title}</span>
        <GripVertical className="size-3.5 shrink-0 text-white/15 mt-0.5" />
      </div>

      {task.description && (
        <p className="text-xs text-white/42 leading-relaxed line-clamp-3">{task.description}</p>
      )}

      {task.nextAction && (
        <div className="rounded-lg border border-emerald-400/10 bg-emerald-500/[0.035] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/45">Next action</p>
          <p className="mt-1 text-xs leading-5 text-emerald-50/70">{task.nextAction}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Badge variant="secondary" className="border-0 bg-white/[0.06] px-1.5 text-[10px] text-white/48">
          {categoryLabels[task.category ?? "team_ops"]}
        </Badge>
        <Badge variant="secondary" className="border-0 bg-white/[0.06] px-1.5 text-[10px] text-white/48">
          {assigneeLabel[task.assignee]}
        </Badge>
      </div>

      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${priorityColors[task.priority]}`} title={task.priority} />
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/25">{task.priority}</span>
        </div>
        <span className="text-[10px] text-white/25 flex items-center gap-1">
          <Calendar className="size-2.5" />
          {formatDate(task.createdAt)}
        </span>
      </div>
    </div>
  );
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const typeColors: Record<ActivityEvent["type"], string> = {
    task: "bg-blue-500",
    system: "bg-emerald-500",
    agent: "bg-purple-500",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <Activity className="size-4 text-white/30" />
        <h2 className="text-sm font-medium text-white/70">Automation Log</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {events.map((ev) => (
          <div key={ev.id} className="flex items-start gap-2.5 py-2 border-b border-white/[0.03] last:border-0">
            <span className={`size-1.5 rounded-full mt-1.5 shrink-0 ${typeColors[ev.type]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/60 leading-relaxed">{ev.text}</p>
              <span className="text-[10px] text-white/25">{formatTime(ev.timestamp)}</span>
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="text-xs text-white/25 py-4 text-center">No activity yet.</p>}
      </div>
    </div>
  );
}

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
  const [nextAction, setNextAction] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("hermi_ops");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("triage");
  const [category, setCategory] = useState<TaskCategory>("loans");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      description: description.trim(),
      nextAction: nextAction.trim(),
      assignee,
      priority,
      status,
      category,
    });
    setTitle("");
    setDescription("");
    setNextAction("");
    setAssignee("hermi_ops");
    setPriority("medium");
    setStatus("triage");
    setCategory("loans");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-[#0f0f0f] border border-white/[0.07]">
        <DialogHeader>
          <DialogTitle className="text-white/90">Drop into Mission Control</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Raw task / decision</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example: tighten KW lead follow-up this week" className="bg-white/[0.03] border-white/[0.07] text-white/90 placeholder:text-white/20" autoFocus />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Context</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Messy is fine. Hermi Ops should clean this into a real task." className="bg-white/[0.03] border-white/[0.07] text-white/90 placeholder:text-white/20 min-h-[82px]" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Next action if known</label>
            <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Optional — leave blank if this needs triage." className="bg-white/[0.03] border-white/[0.07] text-white/90 placeholder:text-white/20" />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SelectBox label="Category" value={category} onValueChange={(v) => setCategory(v as TaskCategory)} items={categoryLabels} />
            <SelectBox label="Owner" value={assignee} onValueChange={(v) => setAssignee(v as Assignee)} items={assigneeLabel} />
            <SelectBox label="Priority" value={priority} onValueChange={(v) => setPriority(v as Priority)} items={{ high: "High", medium: "Medium", low: "Low" }} />
            <SelectBox label="Status" value={status} onValueChange={(v) => setStatus(v as TaskStatus)} items={{ triage: "Triage", ready: "Ready", in_progress: "In Progress", blocked: "Blocked", done: "Done" }} />
          </div>

          <Button type="submit" className="w-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-50 border border-emerald-400/15">
            <Plus className="size-4 mr-1" />
            Create Task
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SelectBox({
  label,
  value,
  onValueChange,
  items,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: Record<string, string>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-white/40">{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.07] text-white/90">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#161616] border-white/[0.07]">
          {Object.entries(items).map(([key, itemLabel]) => (
            <SelectItem key={key} value={key}>{itemLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const normalized = normalizeTasks(getTasks());
    setTasks(normalized);
    saveTasks(normalized);
    setActivity(getActivity());
    setMounted(true);
  }, []);

  const persist = useCallback((updated: Task[]) => {
    setTasks(updated);
    saveTasks(updated);
  }, []);

  const refreshActivity = useCallback(() => setActivity(getActivity()), []);

  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId as TaskStatus;
    const updated = tasks.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t));
    const colTasks = updated.filter((t) => t.status === newStatus);
    const others = updated.filter((t) => t.status !== newStatus);
    const movedIndex = colTasks.findIndex((t) => t.id === draggableId);
    const [moved] = colTasks.splice(movedIndex, 1);
    colTasks.splice(destination.index, 0, moved);
    persist([...others, ...colTasks]);

    if (source.droppableId !== destination.droppableId) {
      const task = tasks.find((t) => t.id === draggableId);
      const destLabel = columns.find((c) => c.id === newStatus)?.label;
      addActivity(`Task "${task?.title}" moved to ${destLabel}`, "task");
      refreshActivity();
    }
  }

  function handleAddTask(data: Omit<Task, "id" | "createdAt">) {
    const newTask: Task = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    persist([newTask, ...tasks]);
    addActivity(`Task created in Mission Control: ${newTask.title}`, "task");
    refreshActivity();
  }

  const filteredTasks = useMemo(
    () => (filterAssignee === "all" ? tasks : tasks.filter((t) => t.assignee === filterAssignee)),
    [filterAssignee, tasks]
  );

  const counts = {
    triage: tasks.filter((t) => t.status === "triage").length,
    ready: tasks.filter((t) => t.status === "ready").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    revenue: tasks.filter((t) => ["loans", "lead_gen", "finance"].includes(t.category ?? "")).length,
  };

  if (!mounted) {
    return <div className="min-h-screen bg-[#080808] flex items-center justify-center"><span className="text-white/25 text-sm">Loading Mission Control...</span></div>;
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white/90 flex">
      <aside className="w-72 shrink-0 border-r border-white/[0.05] bg-white/[0.01] flex-col h-screen sticky top-0 hidden xl:flex">
        <ActivityFeed events={activity} />
      </aside>

      <main className="flex-1 min-h-screen overflow-hidden">
        <header className="border-b border-white/[0.05] px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-300" />
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/70">Hermi Ops Command Board</p>
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white">Tasks, agents, and weekly CEO brief</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
                This is the Alex Finn workflow translated for DHL: dump messy tasks, let Hermi Ops clean them up, assign only what moves loans, finance, training, or lead gen.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select value={filterAssignee} onValueChange={(v) => setFilterAssignee(v)}>
                <SelectTrigger size="sm" className="bg-white/[0.03] border-white/[0.07] text-white/60 text-xs w-[170px]">
                  <Filter className="mr-1 size-3.5 text-white/30" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161616] border-white/[0.07]">
                  <SelectItem value="all">All owners</SelectItem>
                  {Object.entries(assigneeLabel).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-50 border border-emerald-400/15 text-xs" onClick={() => setDialogOpen(true)}>
                <Plus className="size-3.5 mr-1" />
                Add Task
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={<CircleDot className="size-4" />} label="Needs triage" value={counts.triage} note="brain dumps" />
            <Metric icon={<ShieldCheck className="size-4" />} label="Ready to assign" value={counts.ready} note="clean prompts" />
            <Metric icon={<Zap className="size-4" />} label="Revenue tasks" value={counts.revenue} note="loans / finance / leads" />
            <Metric icon={<Target className="size-4" />} label="Blocked" value={counts.blocked} note="needs decision" />
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 p-5 2xl:grid-cols-[1fr_360px]">
          <div className="overflow-x-auto rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex min-h-[560px] gap-3">
                {columns.map((col) => {
                  const colTasks = filteredTasks.filter((t) => t.status === col.id);
                  return (
                    <div key={col.id} className="flex w-[285px] shrink-0 flex-col">
                      <div className="mb-3 flex items-start justify-between px-1">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-white/70">{col.label}</span>
                            <span className="min-w-[22px] rounded-full bg-white/[0.06] px-1.5 py-0.5 text-center text-[11px] text-white/30">{colTasks.length}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-white/25">{col.hint}</p>
                        </div>
                      </div>

                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[520px] flex-1 space-y-2 rounded-xl border p-2 transition-colors ${snapshot.isDraggingOver ? "border-emerald-400/20 bg-emerald-500/[0.035]" : "border-white/[0.035] bg-black/20"}`}>
                            {colTasks.map((task, index) => (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided, snapshot) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={snapshot.isDragging ? "opacity-90 rotate-1" : ""}>
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

          <aside className="space-y-4">
            <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.035] p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-emerald-300" />
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/70">Hermi Ops rule</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/70">
                Every task must answer: owner, next action, success criteria, and whether it closes loans or removes bottlenecks.
              </p>
              <p className="mt-3 text-xs leading-5 text-emerald-50/45">
                No fully autonomous client-facing actions. Anything borrower/realtor-facing still needs human approval.
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/32">Agent profiles</p>
              <div className="mt-3 space-y-3">
                {agentProfiles.map((agent) => (
                  <div key={agent.name} className="rounded-xl border border-white/[0.05] bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white/80">{agent.name}</p>
                        <p className="mt-0.5 text-[11px] text-white/35">{agent.role}</p>
                      </div>
                      <Badge className="border-0 bg-white/[0.06] text-[10px] text-white/42">{agent.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/46">{agent.job}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/22">{agent.model}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-400/10 bg-blue-500/[0.03] p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-blue-300" />
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300/70">Weekly CEO brief</p>
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-white/55">
                <li>• Loans to push this week</li>
                <li>• Finance leaks / CFO closeout orders</li>
                <li>• Claudia + Nataly delegation blockers</li>
                <li>• Ask Hermi trainings to ingest</li>
                <li>• What to kill so Fonz stops overbuilding</li>
              </ul>
            </div>
          </aside>
        </section>
      </main>

      <AddTaskDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdd={handleAddTask} />
    </div>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{label}</p>
        <span className="text-white/22">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-black text-white/90">{value}</p>
      <p className="mt-1 text-xs text-white/30">{note}</p>
    </div>
  );
}
