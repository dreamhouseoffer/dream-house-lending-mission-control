"use client";

import { useState, useEffect, useMemo } from "react";
import { getDocs, saveDocs } from "@/lib/store";
import { Doc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileTextIcon,
  PlusIcon,
  SearchIcon,
  ArrowLeftIcon,
} from "lucide-react";

const CATEGORIES = ["mortgage", "investing", "systems", "general"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<Category, string> = {
  mortgage: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  investing: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  systems: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  general: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const CATEGORY_DOT: Record<Category, string> = {
  mortgage: "bg-blue-400",
  investing: "bg-emerald-400",
  systems: "bg-violet-400",
  general: "bg-zinc-400",
};

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 text-zinc-300 mb-3">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  function renderInline(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const remaining = text;
    let idx = 0;
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    let lastIndex = 0;

    while ((match = boldRegex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remaining.slice(lastIndex, match.index));
      }
      parts.push(
        <strong key={idx++} className="text-zinc-100 font-semibold">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) {
      parts.push(remaining.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : parts;
  }

  for (const line of lines) {
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={key++} className="text-xl font-bold text-zinc-100 mb-3 mt-4 first:mt-0">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-zinc-200 mb-2 mt-4">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-base font-semibold text-zinc-200 mb-2 mt-3">
          {line.slice(4)}
        </h3>
      );
    } else if (/^[-*] /.test(line)) {
      listItems.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      flushList();
      elements.push(
        <p key={key++} className="text-zinc-300 mb-1 pl-2">
          {renderInline(line)}
        </p>
      );
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={key++} className="text-zinc-300 mb-2 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushList();

  return <div className="space-y-0">{elements}</div>;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("general");
  const [newContent, setNewContent] = useState("");

  useEffect(() => {
    setDocs(getDocs());
  }, []);

  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const matchesCategory =
        activeCategory === "all" || doc.category === activeCategory;
      const matchesSearch =
        search === "" ||
        doc.title.toLowerCase().includes(search.toLowerCase()) ||
        doc.preview.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [docs, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length };
    for (const cat of CATEGORIES) {
      counts[cat] = docs.filter((d) => d.category === cat).length;
    }
    return counts;
  }, [docs]);

  function handleAddDoc() {
    if (!newTitle.trim() || !newContent.trim()) return;

    const preview =
      newContent.replace(/[#*\-]/g, "").trim().slice(0, 100) + "...";
    const doc: Doc = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      category: newCategory,
      content: newContent,
      createdAt: new Date().toISOString(),
      preview,
    };
    const updated = [doc, ...docs];
    setDocs(updated);
    saveDocs(updated);
    setNewTitle("");
    setNewCategory("general");
    setNewContent("");
    setDialogOpen(false);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileTextIcon className="size-5 text-zinc-400" />
            <h1 className="text-lg font-semibold tracking-tight">Docs</h1>
            <span className="text-sm text-zinc-500">
              {docs.length} document{docs.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="default" className="gap-2" />
              }
            >
              <PlusIcon className="size-4" />
              Add Doc
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New Document</DialogTitle>
                <DialogDescription>
                  Add a new document to your knowledge base.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Title
                  </label>
                  <Input
                    placeholder="Document title..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Category
                  </label>
                  <Select value={newCategory} onValueChange={(val) => setNewCategory(val as Category)}>
                    <SelectTrigger className="w-full bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          <span className="capitalize">{cat}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Content
                  </label>
                  <Textarea
                    placeholder="Write your document content... (supports markdown: # headings, **bold**, - lists)"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={10}
                    className="bg-zinc-900 border-zinc-800 resize-none font-mono text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddDoc} disabled={!newTitle.trim() || !newContent.trim()}>
                  Save Document
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto flex">
        {/* Left Sidebar - Categories */}
        <aside className="w-56 shrink-0 border-r border-zinc-800/60 min-h-[calc(100vh-65px)] p-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 px-2">
            Categories
          </p>
          <nav className="space-y-1">
            <button
              onClick={() => {
                setActiveCategory("all");
                setSelectedDoc(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                activeCategory === "all"
                  ? "bg-zinc-800/80 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <span>All Docs</span>
              <span className="text-xs text-zinc-500">{categoryCounts.all}</span>
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setSelectedDoc(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeCategory === cat
                    ? "bg-zinc-800/80 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${CATEGORY_DOT[cat]}`}
                  />
                  <span className="capitalize">{cat}</span>
                </span>
                <span className="text-xs text-zinc-500">
                  {categoryCounts[cat]}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Area */}
        <div className="flex-1 flex min-h-[calc(100vh-65px)]">
          {/* Doc List */}
          <div
            className={`${
              selectedDoc ? "w-[340px] shrink-0 border-r border-zinc-800/60" : "flex-1"
            } flex flex-col`}
          >
            {/* Search */}
            <div className="p-4 border-b border-zinc-800/40">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                <Input
                  placeholder="Search docs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-zinc-900/50 border-zinc-800/60"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {filteredDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                  <FileTextIcon className="size-10 text-zinc-700 mb-3" />
                  <p className="text-sm text-zinc-500">No documents found</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Try a different search or category
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/40">
                  {filteredDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`w-full text-left p-4 transition-colors hover:bg-zinc-800/30 ${
                        selectedDoc?.id === doc.id
                          ? "bg-zinc-800/50 border-l-2 border-l-zinc-400"
                          : "border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="text-sm font-medium text-zinc-200 leading-snug line-clamp-1">
                          {doc.title}
                        </h3>
                        <Badge
                          className={`shrink-0 text-[10px] px-1.5 py-0 h-4 border ${CATEGORY_COLORS[doc.category]}`}
                        >
                          {doc.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 line-clamp-2 mb-1.5">
                        {doc.preview}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {formatDate(doc.createdAt)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Doc Viewer */}
          {selectedDoc && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-zinc-800/40">
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors lg:hidden"
                >
                  <ArrowLeftIcon className="size-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-zinc-100 truncate">
                    {selectedDoc.title}
                  </h2>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge
                      className={`text-[10px] px-1.5 py-0 h-4 border ${CATEGORY_COLORS[selectedDoc.category]}`}
                    >
                      {selectedDoc.category}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {formatDate(selectedDoc.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <Card className="bg-zinc-900/40 border-zinc-800/50 p-6">
                  {renderMarkdown(selectedDoc.content)}
                </Card>
              </div>
            </div>
          )}

          {/* Empty state when no doc selected and list is not full width */}
          {!selectedDoc && filteredDocs.length > 0 && (
            <div className="hidden" />
          )}
        </div>
      </div>
    </div>
  );
}
