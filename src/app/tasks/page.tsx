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
  low: "bg-emerald-500",
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

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task }: { task: Task }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.025] p-3 space-y-2 hover:bg-white/[0.04] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-white/90 leading-snug">
          {task.title}
        </span>
        <GripVertical className="size-3.5 shrink-0 text-white/15 mt-0.5" />
      </div>

      {task.description && (
        <p className="text-xs text-white/35 leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${priorityColors[task.priority]}`}
            title={task.priority}
          />
          <Badge
            variant="secondary"
            className="text-[10px] h-[18px] px-1.5 bg-white/[0.05] text-white/50 border-0"
          >
            {assigneeLabel[task.assignee]}
          </Badge>
        </div>
        <span className="text-[10px] text-white/25 flex items-center gap-1">
          <Calendar className="size-2.5" />
          {formatDate(task.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────
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
        <h2 className="text-sm font-medium text-white/70">Activity Feed</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="flex items-start gap-2.5 py-2 border-b border-white/[0.03] last:border-0"
          >
            <span
              className={`size-1.5 rounded-full mt-1.5 shrink-0 ${typeColors[ev.type]}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/60 leading-relaxed">{ev.text}</p>
              <span className="text-[10px] text-white/25">
                {formatTime(ev.timestamp)}
              </span>
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-xs text-white/25 py-4 text-center">No activity yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Add Task Dialog ──────────────────────────────────────────────────────────
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
      <DialogContent className="sm:max-w-md bg-[#0f0f0f] border border-white/[0.07]">
        <DialogHeader>
          <DialogTitle className="text-white/90">Add Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="bg-white/[0.03] border-white/[0.07] text-white/90 placeholder:text-white/20"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="bg-white/[0.03] border-white/[0.07] text-white/90 placeholder:text-white/20 min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Assignee</label>
              <Select value={assignee} onValueChange={(v) => setAssignee(v as Assignee)}>
                <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.07] text-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161616] border-white/[0.07]">
                  <SelectItem value="atlas">Jarvis</SelectItem>
                  <SelectItem value="fonz">Fonz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.07] text-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161616] border-white/[0.07]">
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className="w-full bg-white/[0.03] border-white/[0.07] text-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161616] border-white/[0.07]">
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-white/[0.07] hover:bg-white/[0.12] text-white/90 border-white/[0.07]"
          >
            <Plus className="size-4 mr-1" />
            Create Task
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
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

  const persist = useCallback((updated: Task[]) => {
    setTasks(updated);
    saveTasks(updated);
  }, []);

  const refreshActivity = useCallback(() => {
    setActivity(getActivity());
  }, []);

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
      addActivity(`Task "${task?.title}" moved to ${destLabel}`, "task");
      refreshActivity();
    }
  }

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

  const filteredTasks =
    filterAssignee === "all"
      ? tasks
      : tasks.filter((t) => t.assignee === filterAssignee);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <span className="text-white/25 text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white/90 flex">
      {/* Left Panel — Activity Feed */}
      <aside className="w-64 shrink-0 border-r border-white/[0.05] bg-white/[0.01] flex flex-col h-screen sticky top-0 hidden lg:flex">
        <ActivityFeed events={activity} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
          <h1 className="text-base font-semibold tracking-tight text-white/80">
            Task Board
          </h1>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="size-3.5 text-white/30" />
              <Select
                value={filterAssignee}
                onValueChange={(v) => setFilterAssignee(v)}
              >
                <SelectTrigger
                  size="sm"
                  className="bg-white/[0.03] border-white/[0.07] text-white/60 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161616] border-white/[0.07]">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="atlas">Jarvis</SelectItem>
                  <SelectItem value="fonz">Fonz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              className="bg-white/[0.07] hover:bg-white/[0.12] text-white/80 border-white/[0.07] text-xs"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-3.5 mr-1" />
              Add Task
            </Button>
          </div>
        </header>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-5">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 h-full min-h-0">
              {columns.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.id);
                return (
                  <div key={col.id} className="flex flex-col w-68 shrink-0" style={{ width: 280 }}>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-white/60">
                          {col.label}
                        </span>
                        <span className="text-[11px] text-white/25 bg-white/[0.05] rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                          {colTasks.length}
                        </span>
                      </div>
                    </div>

                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 space-y-2 rounded-lg p-2 transition-colors min-h-[120px] ${
                            snapshot.isDraggingOver
                              ? "bg-white/[0.03] border border-dashed border-white/[0.10]"
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
                                  className={snapshot.isDragging ? "opacity-90 rotate-1" : ""}
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

      <AddTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={handleAddTask}
      />
    </div>
  );
}
