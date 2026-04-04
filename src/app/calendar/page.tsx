"use client";

import { useState, useEffect, useMemo } from "react";
import { getSchedule, saveSchedule } from "@/lib/store";
import { ScheduledItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Bot,
  Repeat,
} from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_BLOCKS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function getWeekDates(offset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatWeekRange(dates: Date[]): string {
  const first = dates[0];
  const last = dates[6];
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOpts: Intl.DateTimeFormatOptions = { ...opts, year: "numeric" };
  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.toLocaleDateString("en-US", yearOpts)} - ${last.toLocaleDateString("en-US", yearOpts)}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${first.toLocaleDateString("en-US", opts)} - ${last.toLocaleDateString("en-US", yearOpts)}`;
  }
  return `${first.toLocaleDateString("en-US", opts)} - ${last.getDate()}, ${last.getFullYear()}`;
}

/** Map dayOfWeek (0=Sun..6=Sat) to grid column index (0=Mon..6=Sun) */
function dayOfWeekToCol(dow: number): number {
  return dow === 0 ? 6 : dow - 1;
}

/** Map dayOfWeek=-1 to "all weekdays" columns (Mon-Fri) for daily events, or all 7 for truly recurring */
function getColumnsForEvent(item: ScheduledItem): number[] {
  if (item.dayOfWeek === undefined || item.dayOfWeek === -1) {
    // Check cron for weekday-only pattern like "1-5"
    if (item.cron.includes("1-5")) {
      return [0, 1, 2, 3, 4]; // Mon-Fri
    }
    return [0, 1, 2, 3, 4, 5, 6]; // all days
  }
  return [dayOfWeekToCol(item.dayOfWeek)];
}

function getTimeBlockIndex(hour: number): number {
  for (let i = 0; i < TIME_BLOCKS.length; i++) {
    if (hour >= TIME_BLOCKS[i] && (i === TIME_BLOCKS.length - 1 || hour < TIME_BLOCKS[i + 1])) {
      return i;
    }
  }
  return -1;
}

export default function CalendarPage() {
  const [schedule, setSchedule] = useState<ScheduledItem[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCron, setFormCron] = useState("");
  const [formHuman, setFormHuman] = useState("");
  const [formAgent, setFormAgent] = useState("");

  useEffect(() => {
    setSchedule(getSchedule());
  }, []);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => formatWeekRange(weekDates), [weekDates]);

  const isCurrentWeek = weekOffset === 0;
  const today = new Date();
  const todayCol = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const recurringEvents = useMemo(
    () =>
      schedule.filter(
        (item) =>
          (item.dayOfWeek === undefined || item.dayOfWeek === -1) &&
          (item.hour === undefined || item.hour === -1)
      ),
    [schedule]
  );

  const gridEvents = useMemo(
    () =>
      schedule.filter(
        (item) =>
          item.hour !== undefined && item.hour !== -1 && getTimeBlockIndex(item.hour) !== -1
      ),
    [schedule]
  );

  function handleAddSchedule() {
    if (!formName.trim()) return;
    const newItem: ScheduledItem = {
      id: crypto.randomUUID(),
      name: formName.trim(),
      cron: formCron.trim() || "0 9 * * *",
      humanSchedule: formHuman.trim() || "Custom schedule",
      agent: formAgent.trim() || "Atlas",
      nextRun: "Pending",
    };
    const updated = [...schedule, newItem];
    setSchedule(updated);
    saveSchedule(updated);
    setFormName("");
    setFormCron("");
    setFormHuman("");
    setFormAgent("");
    setDialogOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-6">
      {/* Header */}
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-5 w-5 text-white/50" />
            <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button className="bg-white/[0.08] border-white/[0.06] text-white hover:bg-white/[0.12] text-sm h-8 px-3">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Schedule
                </Button>
              }
            />
            <DialogContent className="bg-[#141414] border border-white/[0.06] text-white sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">Add Schedule</DialogTitle>
                <DialogDescription className="text-white/40">
                  Create a new scheduled event for your calendar.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <label className="text-xs text-white/50 font-medium">Name</label>
                  <Input
                    placeholder="Daily Briefing"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs text-white/50 font-medium">Cron Expression</label>
                  <Input
                    placeholder="0 8 * * *"
                    value={formCron}
                    onChange={(e) => setFormCron(e.target.value)}
                    className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20 font-mono text-xs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs text-white/50 font-medium">
                    Human-Readable Schedule
                  </label>
                  <Input
                    placeholder="Daily at 8:00 AM"
                    value={formHuman}
                    onChange={(e) => setFormHuman(e.target.value)}
                    className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs text-white/50 font-medium">Agent</label>
                  <Input
                    placeholder="Atlas"
                    value={formAgent}
                    onChange={(e) => setFormAgent(e.target.value)}
                    className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20"
                  />
                </div>
              </div>
              <DialogFooter className="bg-transparent border-white/[0.06]">
                <DialogClose
                  render={
                    <Button
                      variant="outline"
                      className="border-white/[0.06] text-white/60 hover:bg-white/[0.04] hover:text-white"
                    />
                  }
                >
                  Cancel
                </DialogClose>
                <Button
                  onClick={handleAddSchedule}
                  className="bg-white/[0.08] text-white hover:bg-white/[0.14] border border-white/[0.06]"
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWeekOffset((o) => o - 1)}
              className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/[0.06]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWeekOffset((o) => o + 1)}
              className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/[0.06]"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-white/80 ml-1">{weekLabel}</span>
          </div>
          {!isCurrentWeek && (
            <Button
              variant="ghost"
              onClick={() => setWeekOffset(0)}
              className="text-xs text-white/40 hover:text-white hover:bg-white/[0.06] h-7 px-2"
            >
              Today
            </Button>
          )}
        </div>

        {/* Recurring events banner */}
        {recurringEvents.length > 0 && (
          <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="h-3.5 w-3.5 text-white/30" />
              <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
                Recurring
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recurringEvents.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md bg-white/[0.04] border border-white/[0.06] px-2.5 py-1.5"
                >
                  <Badge
                    variant="outline"
                    className="border-violet-500/30 bg-violet-500/10 text-violet-300 text-[10px] px-1.5 py-0"
                  >
                    {item.humanSchedule}
                  </Badge>
                  <span className="text-xs text-white/70">{item.name}</span>
                  <span className="text-[10px] text-white/30">{item.agent}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly grid */}
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-white/[0.06]">
            <div className="p-2" />
            {DAYS.map((day, i) => {
              const date = weekDates[i];
              const isToday =
                isCurrentWeek &&
                i === todayCol;
              return (
                <div
                  key={day}
                  className={`p-2 text-center border-l border-white/[0.06] ${
                    isToday ? "bg-white/[0.04]" : ""
                  }`}
                >
                  <div
                    className={`text-xs font-medium ${
                      isToday ? "text-white" : "text-white/40"
                    }`}
                  >
                    {day}
                  </div>
                  <div
                    className={`text-lg font-semibold mt-0.5 ${
                      isToday ? "text-white" : "text-white/20"
                    }`}
                  >
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time rows */}
          {TIME_BLOCKS.map((hour, rowIdx) => (
            <div
              key={hour}
              className={`grid grid-cols-[64px_repeat(7,1fr)] ${
                rowIdx < TIME_BLOCKS.length - 1 ? "border-b border-white/[0.04]" : ""
              }`}
              style={{ minHeight: "72px" }}
            >
              {/* Time label */}
              <div className="p-2 flex items-start justify-end pr-3 border-r border-white/[0.06]">
                <span className="text-[10px] text-white/25 font-mono tabular-nums leading-none mt-0.5">
                  {formatHour(hour)}
                </span>
              </div>

              {/* Day cells */}
              {DAYS.map((_, colIdx) => {
                const cellEvents = gridEvents.filter((item) => {
                  const cols = getColumnsForEvent(item);
                  const blockIdx = getTimeBlockIndex(item.hour!);
                  return cols.includes(colIdx) && blockIdx === rowIdx;
                });

                const isToday = isCurrentWeek && colIdx === todayCol;

                return (
                  <div
                    key={colIdx}
                    className={`border-l border-white/[0.06] p-1 ${
                      isToday ? "bg-white/[0.02]" : ""
                    }`}
                  >
                    {cellEvents.map((item) => (
                      <div
                        key={`${item.id}-${colIdx}`}
                        className="rounded-md bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors p-1.5 mb-1 cursor-default group"
                      >
                        <div className="text-[11px] font-medium text-white/80 leading-tight truncate">
                          {item.name}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="h-2.5 w-2.5 text-white/20" />
                          <span className="text-[9px] text-white/30 truncate">
                            {item.humanSchedule}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1">
                            <Bot className="h-2.5 w-2.5 text-white/20" />
                            <span className="text-[9px] text-white/30">{item.agent}</span>
                          </div>
                          <span className="text-[8px] text-white/15 font-mono">
                            {item.nextRun}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
