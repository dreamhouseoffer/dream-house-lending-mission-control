"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getMemory, saveMemory } from "@/lib/store";
import { MemoryEntry } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Brain, Calendar } from "lucide-react";

// ---------------------------------------------------------------------------
// Simple DIY markdown renderer
// ---------------------------------------------------------------------------
function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="font-bold text-lg text-white/90 mt-4 mb-1">
          {applyInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="font-bold text-xl text-white/95 mt-4 mb-2">
          {applyInline(line.slice(2))}
        </h1>
      );
    } else if (/^(\d+)\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 ml-2 text-white/70 leading-relaxed">
            <span className="text-white/40 shrink-0">{match[1]}.</span>
            <span>{applyInline(match[2])}</span>
          </div>
        );
      }
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2 text-white/70 leading-relaxed">
          <span className="text-white/30 shrink-0">-</span>
          <span>{applyInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-white/70 leading-relaxed">
          {applyInline(line)}
        </p>
      );
    }
  }

  return elements;
}

function applyInline(text: string): React.ReactNode {
  // Handle **bold** segments
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-white/90 font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newContent, setNewContent] = useState("");

  useEffect(() => {
    const data = getMemory();
    setEntries(data);
    if (data.length > 0) {
      // Select first daily entry by default, or first entry
      const firstDaily = data.find((e) => e.type === "daily");
      setSelectedId(firstDaily?.id ?? data[0].id);
    }
  }, []);

  const dailyEntries = useMemo(
    () =>
      entries
        .filter((e) => e.type === "daily")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  );

  const longtermEntries = useMemo(
    () => entries.filter((e) => e.type === "longterm"),
    [entries]
  );

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  const handleAdd = useCallback(() => {
    if (!newContent.trim()) return;
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      date: newDate,
      content: newContent.trim(),
      type: "daily",
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    saveMemory(updated);
    setSelectedId(entry.id);
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewContent("");
    setDialogOpen(false);
  }, [newDate, newContent, entries]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white/95">
            Memory
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Daily logs and long-term knowledge base
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button variant="outline" size="sm" className="gap-1.5 border-white/[0.06] bg-white/[0.03] text-white/70 hover:text-white hover:bg-white/[0.06]">
                <Plus className="size-3.5" />
                Add Entry
              </Button>
            }
          />
          <DialogContent className="bg-[#141418] border border-white/[0.06] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white/90">New Daily Log</DialogTitle>
              <DialogDescription>
                Add a new daily log entry to your memory.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 mt-2">
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Date</label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="bg-white/[0.03] border-white/[0.06] text-white/80"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Content</label>
                <Textarea
                  placeholder="## Daily Log&#10;&#10;- What happened today&#10;- Key decisions made&#10;- Things to remember"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={8}
                  className="bg-white/[0.03] border-white/[0.06] text-white/80 min-h-[160px]"
                />
              </div>
            </div>
            <DialogFooter className="bg-transparent border-white/[0.06]">
              <DialogClose
                render={
                  <Button variant="ghost" size="sm" className="text-white/50 hover:text-white/70">
                    Cancel
                  </Button>
                }
              />
              <Button size="sm" onClick={handleAdd} className="bg-white/10 text-white hover:bg-white/15">
                Save Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={0}>
        <TabsList className="bg-white/[0.03] border border-white/[0.06] rounded-lg mb-4">
          <TabsTrigger
            value={0}
            className="gap-1.5 text-white/50 data-active:text-white data-active:bg-white/[0.06]"
          >
            <Calendar className="size-3.5" />
            Daily Logs
          </TabsTrigger>
          <TabsTrigger
            value={1}
            className="gap-1.5 text-white/50 data-active:text-white data-active:bg-white/[0.06]"
          >
            <Brain className="size-3.5" />
            Long-Term Memory
          </TabsTrigger>
        </TabsList>

        {/* Daily Logs Tab */}
        <TabsContent value={0}>
          <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Left panel — date list */}
            <div className="w-64 shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-y-auto">
              <div className="p-3 border-b border-white/[0.06]">
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Entries
                </p>
              </div>
              {dailyEntries.length === 0 ? (
                <p className="p-4 text-sm text-white/30 text-center">
                  No daily logs yet.
                </p>
              ) : (
                <div className="flex flex-col">
                  {dailyEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedId(entry.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors ${
                        selectedId === entry.id
                          ? "bg-white/[0.06] text-white"
                          : "text-white/50 hover:bg-white/[0.03] hover:text-white/70"
                      }`}
                    >
                      <span className="text-sm font-medium block">
                        {formatDate(entry.date)}
                      </span>
                      <span className="text-xs text-white/30 mt-0.5 block truncate">
                        {entry.content.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.replace(/^[- ]+/, "").slice(0, 50) ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right panel — content viewer */}
            <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-y-auto">
              {selectedEntry && selectedEntry.type === "daily" ? (
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">
                      Daily Log
                    </Badge>
                    <span className="text-xs text-white/30">
                      {formatDate(selectedEntry.date)}
                    </span>
                  </div>
                  <div className="prose-sm">{renderMarkdown(selectedEntry.content)}</div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-white/20 text-sm">
                  Select an entry to view
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Long-Term Memory Tab */}
        <TabsContent value={1}>
          <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Left panel — long-term entries */}
            <div className="w-64 shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-y-auto">
              <div className="p-3 border-b border-white/[0.06]">
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Knowledge Base
                </p>
              </div>
              {longtermEntries.length === 0 ? (
                <p className="p-4 text-sm text-white/30 text-center">
                  No long-term memories yet.
                </p>
              ) : (
                <div className="flex flex-col">
                  {longtermEntries.map((entry) => {
                    // Extract title from first heading
                    const titleLine = entry.content
                      .split("\n")
                      .find((l) => l.startsWith("## ") || l.startsWith("# "));
                    const title = titleLine
                      ? titleLine.replace(/^#+\s/, "")
                      : "Untitled";

                    return (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedId(entry.id)}
                        className={`w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors ${
                          selectedId === entry.id
                            ? "bg-white/[0.06] text-white"
                            : "text-white/50 hover:bg-white/[0.03] hover:text-white/70"
                        }`}
                      >
                        <span className="text-sm font-medium block truncate">
                          {title}
                        </span>
                        <span className="text-xs text-white/30 mt-0.5 block">
                          {formatDate(entry.date)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right panel — content viewer */}
            <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-y-auto">
              {selectedEntry && selectedEntry.type === "longterm" ? (
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
                      Long-Term
                    </Badge>
                    <span className="text-xs text-white/30">
                      {formatDate(selectedEntry.date)}
                    </span>
                  </div>
                  <div className="prose-sm">{renderMarkdown(selectedEntry.content)}</div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-white/20 text-sm">
                  Select an entry to view
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
