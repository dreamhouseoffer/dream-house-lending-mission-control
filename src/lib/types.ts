export type Priority = "high" | "medium" | "low";
export type TaskStatus = "backlog" | "in_progress" | "review" | "done";
export type Assignee = "fonz" | "atlas";

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: Assignee;
  priority: Priority;
  status: TaskStatus;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  text: string;
  timestamp: string;
  type: "task" | "system" | "agent";
}

export interface ScheduledItem {
  id: string;
  name: string;
  cron: string;
  humanSchedule: string;
  agent: string;
  nextRun: string;
  dayOfWeek?: number;
  hour?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  progress: number;
  status: "active" | "planning" | "paused";
  taskCount: number;
}

export interface MemoryEntry {
  id: string;
  date: string;
  content: string;
  type: "daily" | "longterm";
}

export interface Doc {
  id: string;
  title: string;
  category: "mortgage" | "investing" | "systems" | "general";
  content: string;
  createdAt: string;
  preview: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  type: "human" | "ai";
  model?: string;
  responsibilities: string;
  status: "active" | "idle" | "offline";
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  status: "planned" | "building" | "live";
}

export type ContentPlatform = "Instagram" | "LinkedIn" | "Facebook" | "YouTube";
export type ContentStatus = "Pending" | "Approved" | "Needs Edit";

export interface ContentPost {
  id: string;
  platform: ContentPlatform;
  caption: string;
  suggestedDate: string;
  agent: string;
  status: ContentStatus;
  notes?: string;
  approvedAt?: string;
  postedAt?: string;
}
