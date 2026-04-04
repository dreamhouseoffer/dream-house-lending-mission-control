"use client";

import { useEffect, useState } from "react";
import { getContent, saveContent } from "@/lib/store";
import { ContentPost, ContentPlatform, ContentStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Plus, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

const platformColors: Record<ContentPlatform, string> = {
  Instagram: "bg-gradient-to-r from-pink-500 to-purple-500 text-white",
  LinkedIn: "bg-blue-600 text-white",
  Facebook: "bg-blue-800 text-white",
  YouTube: "bg-red-600 text-white",
};

const statusColors: Record<ContentStatus, string> = {
  Pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Needs Edit": "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const platforms: ContentPlatform[] = ["Instagram", "LinkedIn", "Facebook", "YouTube"];
const statusFilters: (ContentStatus | "All")[] = ["All", "Pending", "Approved", "Needs Edit"];
const platformFilters: (ContentPlatform | "All")[] = ["All", ...platforms];

export default function ContentPage() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "All">("All");
  const [platformFilter, setPlatformFilter] = useState<ContentPlatform | "All">("All");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // New post form state
  const [newPlatform, setNewPlatform] = useState<ContentPlatform>("Instagram");
  const [newCaption, setNewCaption] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newNotes, setNewNotes] = useState("");

  useEffect(() => {
    setPosts(getContent());
  }, []);

  const persist = (updated: ContentPost[]) => {
    setPosts(updated);
    saveContent(updated);
  };

  const approve = (id: string) => {
    persist(
      posts.map((p) =>
        p.id === id ? { ...p, status: "Approved" as const, approvedAt: new Date().toISOString() } : p
      )
    );
  };

  const requestEdit = (id: string) => {
    persist(
      posts.map((p) => (p.id === id ? { ...p, status: "Needs Edit" as const } : p))
    );
  };

  const markPosted = (id: string) => {
    persist(
      posts.map((p) =>
        p.id === id ? { ...p, postedAt: new Date().toISOString() } : p
      )
    );
  };

  const copyCaption = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addPost = () => {
    if (!newCaption.trim()) return;
    const post: ContentPost = {
      id: crypto.randomUUID(),
      platform: newPlatform,
      caption: newCaption,
      suggestedDate: newDate || new Date().toISOString().split("T")[0],
      agent: "Fonz",
      status: "Pending",
      notes: newNotes || undefined,
    };
    persist([post, ...posts]);
    setNewPlatform("Instagram");
    setNewCaption("");
    setNewDate("");
    setNewNotes("");
    setDialogOpen(false);
  };

  const filtered = posts.filter((p) => {
    if (statusFilter !== "All" && p.status !== statusFilter) return false;
    if (platformFilter !== "All" && p.platform !== platformFilter) return false;
    return true;
  });

  const queuePosts = filtered.filter((p) => !p.postedAt);
  const approvedPosted = filtered.filter((p) => p.status === "Approved" && !p.postedAt);
  const archivedPosts = posts.filter((p) => p.postedAt);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Content Queue</h1>
              <p className="mt-1 text-sm text-white/40">
                Review and approve posts from Nova before publishing
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <Button
                size="sm"
                className="gap-1.5 bg-white/10 hover:bg-white/15 text-white"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Content
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Content</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-white/50 mb-1.5 block">
                      Platform
                    </label>
                    <Select value={newPlatform} onValueChange={(v) => setNewPlatform(v as ContentPlatform)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {platforms.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/50 mb-1.5 block">
                      Caption
                    </label>
                    <Textarea
                      placeholder="Write or paste the post caption..."
                      value={newCaption}
                      onChange={(e) => setNewCaption(e.target.value)}
                      rows={5}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/50 mb-1.5 block">
                      Suggested Date
                    </label>
                    <Input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/50 mb-1.5 block">
                      Notes for Fonz
                    </label>
                    <Textarea
                      placeholder="Any notes or context..."
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-white/10 hover:bg-white/15 text-white"
                    onClick={addPost}
                  >
                    Add to Queue
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filters */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            {/* Status filter */}
            <div className="flex items-center gap-1">
              {statusFilters.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-white/10 text-white"
                      : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-white/[0.08]" />

            {/* Platform filter */}
            <div className="flex items-center gap-1">
              {platformFilters.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    platformFilter === p
                      ? "bg-white/10 text-white"
                      : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        {queuePosts.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
            <p className="text-white/30 text-sm">No posts match your filters</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {queuePosts.map((post) => {
              const expanded = expandedIds.has(post.id);
              return (
                <Card
                  key={post.id}
                  className="border-white/[0.06] bg-white/[0.03] p-5 flex flex-col gap-3"
                >
                  {/* Top row: platform + status */}
                  <div className="flex items-center justify-between">
                    <Badge
                      className={`${platformColors[post.platform]} border-0 text-[11px] font-semibold`}
                    >
                      {post.platform}
                    </Badge>
                    <Badge
                      className={`${statusColors[post.status]} text-[11px] font-medium border`}
                    >
                      {post.status}
                    </Badge>
                  </div>

                  {/* Caption */}
                  <div
                    className="cursor-pointer"
                    onClick={() => toggleExpand(post.id)}
                  >
                    <p
                      className={`text-sm text-white/70 leading-relaxed whitespace-pre-wrap ${
                        !expanded ? "line-clamp-3" : ""
                      }`}
                    >
                      {post.caption}
                    </p>
                    {post.caption.split("\n").length > 3 && (
                      <button className="mt-1 flex items-center gap-0.5 text-[11px] text-white/30 hover:text-white/50 transition-colors">
                        {expanded ? (
                          <>
                            <ChevronUp className="h-3 w-3" /> Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" /> Show more
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Notes */}
                  {post.notes && (
                    <p className="text-xs text-white/30 italic">Note: {post.notes}</p>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-[11px] text-white/30">
                    <span>
                      {new Date(post.suggestedDate + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-white/10">|</span>
                    <span>{post.agent}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto pt-1">
                    {post.status !== "Approved" && (
                      <Button
                        size="sm"
                        className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/20 text-xs h-7"
                        onClick={() => approve(post.id)}
                      >
                        Approve
                      </Button>
                    )}
                    {post.status !== "Needs Edit" && (
                      <Button
                        size="sm"
                        className="bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 border border-orange-500/20 text-xs h-7"
                        onClick={() => requestEdit(post.id)}
                      >
                        Request Edit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-white/30 hover:text-white/60 text-xs h-7 gap-1"
                      onClick={() => copyCaption(post.id, post.caption)}
                    >
                      {copiedId === post.id ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy Caption
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Approved Posts Section */}
        {approvedPosted.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold tracking-tight text-white/80 mb-4">
              Approved — Ready to Post
            </h2>
            <div className="grid gap-3">
              {approvedPosted.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-3"
                >
                  <Badge
                    className={`${platformColors[post.platform]} border-0 text-[11px] font-semibold shrink-0`}
                  >
                    {post.platform}
                  </Badge>
                  <p className="text-sm text-white/60 line-clamp-1 flex-1">
                    {post.caption}
                  </p>
                  <span className="text-[11px] text-white/30 shrink-0">
                    Approved{" "}
                    {post.approvedAt &&
                      new Date(post.approvedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white/30 hover:text-white/60 text-xs h-7 shrink-0"
                    onClick={() => markPosted(post.id)}
                  >
                    Mark as Posted
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Archived Posts */}
        {archivedPosts.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold tracking-tight text-white/80 mb-4">
              Archive
            </h2>
            <div className="grid gap-2">
              {archivedPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.01] px-5 py-2.5 opacity-50"
                >
                  <Badge
                    className={`${platformColors[post.platform]} border-0 text-[10px] font-semibold shrink-0`}
                  >
                    {post.platform}
                  </Badge>
                  <p className="text-xs text-white/40 line-clamp-1 flex-1">
                    {post.caption}
                  </p>
                  <span className="text-[10px] text-white/20 shrink-0">
                    Posted{" "}
                    {post.postedAt &&
                      new Date(post.postedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
