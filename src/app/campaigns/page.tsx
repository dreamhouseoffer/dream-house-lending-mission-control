"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  Clock,
  CheckCircle2,
  Send,
  FileEdit,
  BarChart3,
  Users,
  MousePointerClick,
  UserMinus,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Eye,
} from "lucide-react";
import { addActivity, getTasks, saveTasks } from "@/lib/store";

type CampaignStatus =
  | "Draft"
  | "Pending Review"
  | "Approved"
  | "Scheduled"
  | "Sent"
  | "Needs Edit";
type CampaignPlatform = "Mailchimp" | "Email" | "CRM";

interface CampaignStats {
  openRate: number | null;
  clickRate: number | null;
  emailsSent: number;
  bounces: number;
  unsubscribes: number;
}

interface Campaign {
  id: string;
  mailchimpId?: string;
  name: string;
  platform: CampaignPlatform;
  platformNote?: string;
  audience: string;
  contactCount?: number;
  subject?: string;
  status: CampaignStatus;
  scheduledDate?: string;
  mailchimpUrl?: string;
  previewContent?: string;
  htmlContent?: string;
  fromName?: string;
  notes?: string;
  stats?: CampaignStats;
}

interface MailchimpCampaign {
  id: string;
  web_id: number;
  name: string;
  subject: string;
  status: string;
  send_time: string | null;
  emails_sent: number;
  open_rate: number | null;
  click_rate: number | null;
  audience_name: string;
}

const localCampaigns: Campaign[] = [
  {
    id: "1",
    name: "KW Bakersfield — Monday Agent Email",
    platform: "Mailchimp",
    audience: "KW Bakersfield Agents",
    contactCount: 107,
    subject: "Your buyers can afford more than they think (here's why)",
    status: "Pending Review",
    scheduledDate: "Monday, March 23, 2026 at 8:00 AM",
    mailchimpUrl: "https://us22.admin.mailchimp.com/campaigns/edit?id=52943",
    fromName: "Alfonso Garza — Dream House Lending",
    previewContent: `📊 Rate Snapshot

Conventional 30-yr: 6.36%
FHA 30-yr: 5.86%

That 0.50% difference matters more than most agents realize.

For a buyer looking at $350K, switching from Conventional to FHA could mean $120/month less — and that's before factoring in the lower down payment requirement.

💡 Tip for fence-sitting buyers:
If your client has been waiting for rates to drop, FHA might already put them in range. Run the numbers before they keep sitting on the sidelines.

Want me to run a side-by-side for one of your buyers? Send me their scenario.

📞 310-415-1359

Alfonso Garza
Dream House Lending
NMLS #1708922`,
    htmlContent: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1a3c6b; padding: 15px 20px; border-radius: 8px 8px 0 0;">
    <h2 style="color: white; margin: 0; font-size: 18px;">Dream House Lending</h2>
    <p style="color: #a8c4e0; margin: 4px 0 0; font-size: 13px;">Alfonso Garza | Bakersfield, CA | NMLS# 1708922</p>
  </div>
  <div style="border: 1px solid #e0e0e0; border-top: none; padding: 25px; border-radius: 0 0 8px 8px;">
    <p>Hey [First Name],</p>
    <p>I'm Alfonso — local LO here in Bakersfield. Been closing loans in this market for years and I like to keep the agents I work with ahead of the curve.</p>
    <hr style="border: 1px solid #eee; margin: 20px 0;">
    <h3 style="color: #1a3c6b;">📊 Rate Snapshot — This Week</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
      <tr style="background: #f0f4f8;">
        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">30-yr Conventional</td>
        <td style="padding: 12px; border: 1px solid #ddd; font-size: 18px; color: #333;">~6.36%</td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">FHA</td>
        <td style="padding: 12px; border: 1px solid #ddd; font-size: 18px; color: #1a7a3c;">~5.86% ✓</td>
      </tr>
    </table>
    <p style="background: #fff8e1; padding: 12px; border-left: 4px solid #ffc107; border-radius: 4px;">That 50bps spread matters. On a $400K loan, FHA saves a buyer roughly <strong>$130/month</strong> — enough to shift how they think about purchase price.</p>
    <hr style="border: 1px solid #eee; margin: 20px 0;">
    <h3 style="color: #1a3c6b;">💡 Tip of the Week</h3>
    <p>If you have a buyer sitting on the fence because they think they "can't afford" what they want — run the FHA scenario first. The lower rate often gets them to the number they actually need. Most buyers don't know FHA isn't just for first-timers. <strong>You telling them this = you look like the expert who saved the deal.</strong></p>
    <hr style="border: 1px solid #eee; margin: 20px 0;">
    <p>If you have a buyer who needs pre-approval, I turn them around in <strong>24 hours</strong>.</p>
    <div style="background: #1a3c6b; color: white; padding: 15px 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
      <p style="margin: 0; font-size: 20px; font-weight: bold;">📞 310-415-1359</p>
      <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.8;">Call or text anytime</p>
    </div>
    <p>Let's close more deals together.</p>
    <hr style="border: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 13px; color: #666;">
      <strong>Alfonso Garza</strong><br>
      Dream House Lending<br>
      📞 310-415-1359 | 🌐 dreamhouselending.com<br>
      NMLS# 1708922 | Co NMLS# 2269316
    </p>
    <p style="font-size: 11px; color: #999; margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;"><em>You're receiving this because you're part of the KW Bakersfield network. Reply anytime — I actually read these.</em></p>
  </div>
</div>`,
  },
  // --- 14-Email Lead Nurture Sequence ---
  {
    id: "nurture-1",
    name: "Nurture 1 of 14 — Welcome",
    platform: "Email",
    platformNote: "pending setup",
    audience: "New Leads",
    subject: "You're in — here's what happens next",
    fromName: "Dream House Lending <agarza@dreamhouselending.com>",
    scheduledDate: "Day 0 — Immediately after opt-in",
    status: "Draft",
    htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
<p>Hey *|FNAME|*,</p>
<p>You just took the first step — and we move fast here.</p>
<p>Here's exactly what happens next:</p>
<p><strong>1. We review your info</strong><br>As soon as you submitted, your details landed in our system. We're already looking at your loan type and target price.</p>
<p><strong>2. You'll hear from us within 24–48 hours</strong><br>We'll reach out to confirm your info and walk you through your options.</p>
<p><strong>3. You'll see real numbers</strong><br>No teaser rates. No bait-and-switch. We show you what you actually qualify for based on your situation.</p>
<hr style="border:1px solid #eee;margin:20px 0">
<p>Want to skip the wait? Book a 15-minute call and let's get you pre-approved this week.</p>
<p style="text-align:center"><a href="https://calendly.com/fonzzz/15-min-discoverycall" style="background:#1a3c6b;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">&#x1F449; Book Your Free Call Now</a></p>
<p>Or call/text: <strong>310-415-1359</strong></p>
<p>Talk soon,<br><strong>Dream House Lending</strong><br>&#x1F4DE; 310-415-1359 | &#x1F310; dreamhouselending.com<br><small>NMLS# 1708922 | Company NMLS# 2269316</small></p>
<hr style="border:1px solid #eee">
<p style="font-size:11px;color:#999">You're receiving this because you requested a rate check at dreamhouselending.com.<br><a href="#">Unsubscribe</a> | <a href="#">Privacy Policy</a></p>
</div>`,
  },
  {
    id: "nurture-2",
    name: "Nurture 2 of 14 — Rate Factors",
    platform: "Email",
    platformNote: "pending setup",
    audience: "New Leads",
    subject: "3 things that quietly control your mortgage rate",
    fromName: "Dream House Lending <agarza@dreamhouselending.com>",
    scheduledDate: "Day 2",
    status: "Draft",
    htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
<p>Hey *|FNAME|*,</p>
<p>Quick follow-up — wanted to share something most lenders don't explain upfront.</p>
<p>Three things have the biggest impact on the rate you'll get:</p>
<p><strong>1. Credit Score</strong><br>Higher score = lower rate. Even a 20-point difference can save you hundreds per month.</p>
<p><strong>2. Debt-to-Income Ratio (DTI)</strong><br>This is the percentage of your monthly income that goes toward debt. Lower DTI = better terms.</p>
<p><strong>3. Down Payment</strong><br>More down usually means better rates and no PMI. But there are programs if you don't have 20% — more on that later this week.</p>
<p>The good news? All three are things we can work on together before you apply.</p>
<p style="text-align:center"><a href="https://calendly.com/fonzzz/15-min-discoverycall" style="background:#1a3c6b;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">&#x1F4DE; Book a free 15-min call</a></p>
<p>Dream House Lending | 310-415-1359 | dreamhouselending.com<br><small>NMLS# 1708922 | Co NMLS# 2269316</small></p>
</div>`,
  },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `nurture-${i + 3}`,
    name: `Nurture ${i + 3} of 14 — ${[
      "Down Payment Programs",
      "Credit Score Tips",
      "Pre-Approval Process",
      "Loan Types Explained",
      "Closing Costs Breakdown",
      "Home Inspection Guide",
      "Rate Lock Strategy",
      "First-Time Buyer Myths",
      "Refinance Options",
      "Investment Properties",
      "Client Success Story",
      "Final CTA — Let's Talk",
    ][i]}`,
    platform: "Email" as CampaignPlatform,
    platformNote: "pending setup",
    audience: "New Leads",
    subject: [
      "You might qualify for $0 down (seriously)",
      "5 quick wins to boost your credit score before you apply",
      "What pre-approval actually means (and why it matters)",
      "FHA vs Conventional vs VA — which is right for you?",
      "Hidden closing costs no one warns you about",
      "The home inspection checklist that saves buyers thousands",
      "When to lock your rate (timing matters more than you think)",
      "Myths that stop first-time buyers from getting started",
      "Already own? Here's when refinancing actually makes sense",
      "How to finance your first rental property",
      "How Maria saved $47K on her first home",
      "Let's get you into your dream house this year",
    ][i],
    fromName: "Dream House Lending <agarza@dreamhouselending.com>",
    scheduledDate: `Day ${[4, 7, 10, 14, 18, 22, 26, 30, 35, 40, 45, 50][i]}`,
    status: "Draft" as CampaignStatus,
    htmlContent: undefined as string | undefined,
  })),
  {
    id: "3",
    name: "Pipeline Stage Drip Campaigns",
    platform: "CRM",
    platformNote: "pending integration",
    audience: "All pipeline stages",
    status: "Draft",
    notes: "23 emails across 8 stages written, pending CRM integration",
  },
];

const statusColors: Record<CampaignStatus, string> = {
  Draft: "bg-white/10 text-white/60 border-white/10",
  "Pending Review": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Sent: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Needs Edit": "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const statusIcons: Record<CampaignStatus, React.ReactNode> = {
  Draft: <FileEdit className="h-3 w-3" />,
  "Pending Review": <Clock className="h-3 w-3" />,
  Approved: <CheckCircle2 className="h-3 w-3" />,
  Scheduled: <Clock className="h-3 w-3" />,
  Sent: <Send className="h-3 w-3" />,
  "Needs Edit": <AlertTriangle className="h-3 w-3" />,
};

const platformColors: Record<CampaignPlatform, string> = {
  Mailchimp: "bg-[#FFE01B]/20 text-[#FFE01B] border-[#FFE01B]/30",
  Email: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  CRM: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};

function mapMailchimpStatus(status: string): CampaignStatus {
  switch (status) {
    case "save":
      return "Draft";
    case "paused":
      return "Draft";
    case "schedule":
      return "Scheduled";
    case "sending":
      return "Scheduled";
    case "sent":
      return "Sent";
    default:
      return "Draft";
  }
}

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>(localCampaigns);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [mailchimpLoaded, setMailchimpLoaded] = useState(false);

  // Schedule modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulingCampaignId, setSchedulingCampaignId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [scheduling, setScheduling] = useState(false);

  // Edit request modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");

  // Preview modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewCampaignId, setPreviewCampaignId] = useState<string | null>(null);

  // Report data cache
  const [reportCache, setReportCache] = useState<Record<string, CampaignStats>>({});

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mailchimp");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      const mcCampaigns: Campaign[] = (data.campaigns as MailchimpCampaign[]).map(
        (mc) => ({
          id: `mc_${mc.id}`,
          mailchimpId: mc.id,
          name: mc.name || mc.subject || "Untitled Campaign",
          platform: "Mailchimp" as CampaignPlatform,
          audience: mc.audience_name || "Unknown",
          subject: mc.subject,
          status: mapMailchimpStatus(mc.status),
          scheduledDate: mc.send_time
            ? new Date(mc.send_time).toLocaleString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : undefined,
          mailchimpUrl: `https://us22.admin.mailchimp.com/campaigns/edit?id=${mc.web_id}`,
          stats:
            mc.status === "sent"
              ? {
                  openRate: mc.open_rate,
                  clickRate: mc.click_rate,
                  emailsSent: mc.emails_sent,
                  bounces: 0,
                  unsubscribes: 0,
                }
              : undefined,
        })
      );

      // Merge: keep local non-Mailchimp campaigns, replace Mailchimp ones with live data
      const nonMc = localCampaigns.filter((c) => c.platform !== "Mailchimp");
      setItems([...mcCampaigns, ...nonMc]);
      setMailchimpLoaded(true);

      // Fetch reports for sent campaigns
      for (const mc of mcCampaigns) {
        if (mc.status === "Sent" && mc.mailchimpId) {
          fetchReport(mc.mailchimpId);
        }
      }
    } catch {
      // Keep local data on error
      setMailchimpLoaded(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReport = async (mailchimpId: string) => {
    try {
      const res = await fetch(`/api/mailchimp/campaigns/${mailchimpId}/report`);
      if (!res.ok) return;
      const data = await res.json();
      setReportCache((prev) => ({
        ...prev,
        [mailchimpId]: {
          openRate: data.opens?.rate ?? null,
          clickRate: data.clicks?.rate ?? null,
          emailsSent: data.emails_sent ?? 0,
          bounces: (data.bounces?.hard ?? 0) + (data.bounces?.soft ?? 0),
          unsubscribes: data.unsubscribes ?? 0,
        },
      }));
    } catch {
      // ignore report fetch errors
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getNextMonday = () => {
    const now = new Date();
    const day = now.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    const nextMon = new Date(now);
    nextMon.setDate(now.getDate() + daysUntilMonday);
    return nextMon.toISOString().split("T")[0];
  };

  const handleOpenPreview = (id: string) => {
    setPreviewCampaignId(id);
    setPreviewModalOpen(true);
  };

  // --- Approve flow ---
  const handleApprove = (id: string) => {
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "Approved" as CampaignStatus } : c))
    );
    const campaign = items.find((c) => c.id === id);
    if (campaign) {
      addActivity(`Fonz approved "${campaign.name}"`, "task");
    }
    // Open schedule modal
    setSchedulingCampaignId(id);
    setScheduleDate(getNextMonday());
    setScheduleTime("08:00");
    setPreviewModalOpen(false);
    setScheduleModalOpen(true);
  };

  const handleScheduleConfirm = async () => {
    if (!schedulingCampaignId || !scheduleDate || !scheduleTime) return;
    setScheduling(true);

    const campaign = items.find((c) => c.id === schedulingCampaignId);
    const scheduleDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
    const formattedDate = scheduleDateTime.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    // Try Mailchimp API if it's a Mailchimp campaign
    if (campaign?.mailchimpId) {
      try {
        const res = await fetch(
          `/api/mailchimp/campaigns/${campaign.mailchimpId}/schedule`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              schedule_time: scheduleDateTime.toISOString(),
            }),
          }
        );
        if (!res.ok) {
          const err = await res.json();
          console.error("Mailchimp schedule error:", err);
        }
      } catch (e) {
        console.error("Schedule API error:", e);
      }
    }

    // Update local state
    setItems((prev) =>
      prev.map((c) =>
        c.id === schedulingCampaignId
          ? { ...c, status: "Scheduled" as CampaignStatus, scheduledDate: formattedDate }
          : c
      )
    );

    addActivity(
      `Fonz approved "${campaign?.name}" — scheduled for ${formattedDate}`,
      "task"
    );

    setScheduling(false);
    setScheduleModalOpen(false);
    setSchedulingCampaignId(null);
  };

  // --- Request Edit flow ---
  const handleRequestEdit = (id: string) => {
    setEditCampaignId(id);
    setEditDescription("");
    setEditModalOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editCampaignId || !editDescription.trim()) return;

    const campaign = items.find((c) => c.id === editCampaignId);

    // Update campaign status to "Needs Edit"
    setItems((prev) =>
      prev.map((c) =>
        c.id === editCampaignId
          ? { ...c, status: "Needs Edit" as CampaignStatus }
          : c
      )
    );

    // Create a task on the Task Board assigned to Jay Jay (atlas)
    const tasks = getTasks();
    const newTask = {
      id: crypto.randomUUID(),
      title: `Edit: ${campaign?.name}`,
      description: editDescription.trim(),
      assignee: "atlas" as const,
      priority: "high" as const,
      status: "backlog" as const,
      createdAt: new Date().toISOString(),
    };
    saveTasks([newTask, ...tasks]);

    // Log to activity feed
    addActivity(
      `Edit requested for "${campaign?.name}": ${editDescription.trim()}`,
      "task"
    );

    setEditModalOpen(false);
    setEditCampaignId(null);
    setEditDescription("");
  };

  const getStats = (campaign: Campaign): CampaignStats | undefined => {
    if (campaign.mailchimpId && reportCache[campaign.mailchimpId]) {
      return reportCache[campaign.mailchimpId];
    }
    return campaign.stats;
  };

  const total = items.length;
  const pendingReview = items.filter((c) => c.status === "Pending Review").length;
  const scheduled = items.filter((c) => c.status === "Scheduled").length;
  const sent = items.filter((c) => c.status === "Sent").length;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
              <p className="mt-1 text-sm text-white/40">
                Review and approve email campaigns before they go live
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mailchimpLoaded && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px]">
                  Mailchimp Connected
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-white/40 hover:text-white/70 h-7 text-xs gap-1"
                onClick={fetchCampaigns}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            {[
              { label: "Total Campaigns", value: total, color: "text-white" },
              { label: "Pending Review", value: pendingReview, color: "text-yellow-400" },
              { label: "Scheduled", value: scheduled, color: "text-blue-400" },
              { label: "Sent", value: sent, color: "text-purple-400" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <p className="text-[11px] text-white/40 uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className={`mt-1 text-2xl font-semibold ${stat.color}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && !mailchimpLoaded && (
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campaigns from Mailchimp...
          </div>
        </div>
      )}

      {/* Campaign Cards */}
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-4">
        {items.map((campaign) => {
          const expanded = expandedIds.has(campaign.id);
          const stats = getStats(campaign);

          return (
            <Card
              key={campaign.id}
              className="border-white/[0.06] bg-white/[0.03] p-5 flex flex-col gap-4"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">
                    {campaign.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge
                      className={`${platformColors[campaign.platform]} border text-[11px] font-medium`}
                    >
                      {campaign.platform}
                      {campaign.platformNote && (
                        <span className="ml-1 opacity-70">
                          ({campaign.platformNote})
                        </span>
                      )}
                    </Badge>
                    <Badge
                      className={`${statusColors[campaign.status]} border text-[11px] font-medium gap-1`}
                    >
                      {statusIcons[campaign.status]}
                      {campaign.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span>
                    {campaign.audience}
                    {campaign.contactCount && (
                      <span className="text-white/30">
                        {" "}— {campaign.contactCount} contacts
                      </span>
                    )}
                  </span>
                </div>
                {campaign.subject && (
                  <p className="text-xs text-white/40">
                    Subject:{" "}
                    <span className="text-white/60 italic">
                      &ldquo;{campaign.subject}&rdquo;
                    </span>
                  </p>
                )}
                {campaign.scheduledDate && (
                  <p className="text-xs text-white/40">
                    {campaign.status === "Scheduled" ? (
                      <span className="text-blue-400">
                        Scheduled: {campaign.scheduledDate}
                      </span>
                    ) : campaign.status === "Sent" ? (
                      <span className="text-purple-400">
                        Sent: {campaign.scheduledDate}
                      </span>
                    ) : (
                      <>
                        Scheduled:{" "}
                        <span className="text-white/60">
                          {campaign.scheduledDate}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {campaign.notes && (
                  <p className="text-xs text-white/30 italic">{campaign.notes}</p>
                )}
              </div>

              {/* Live Stats for Sent Campaigns */}
              {campaign.status === "Sent" && stats && (
                <div className="grid grid-cols-5 gap-3">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wide">
                      <Send className="h-2.5 w-2.5" />
                      Sends
                    </div>
                    <p className="mt-0.5 text-lg font-semibold text-white/80">
                      {stats.emailsSent.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70 uppercase tracking-wide">
                      <BarChart3 className="h-2.5 w-2.5" />
                      Open Rate
                    </div>
                    <p className="mt-0.5 text-lg font-semibold text-emerald-400">
                      {stats.openRate !== null
                        ? `${(stats.openRate * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-blue-400/70 uppercase tracking-wide">
                      <MousePointerClick className="h-2.5 w-2.5" />
                      Click Rate
                    </div>
                    <p className="mt-0.5 text-lg font-semibold text-blue-400">
                      {stats.clickRate !== null
                        ? `${(stats.clickRate * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wide">
                      <Users className="h-2.5 w-2.5" />
                      Bounces
                    </div>
                    <p className="mt-0.5 text-lg font-semibold text-white/60">
                      {stats.bounces}
                    </p>
                  </div>
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-red-400/70 uppercase tracking-wide">
                      <UserMinus className="h-2.5 w-2.5" />
                      Unsubs
                    </div>
                    <p className="mt-0.5 text-lg font-semibold text-red-400">
                      {stats.unsubscribes}
                    </p>
                  </div>
                </div>
              )}

              {/* Preview */}
              <div>
                {campaign.previewContent && !campaign.htmlContent ? (
                  <>
                    <button
                      onClick={() => toggleExpand(campaign.id)}
                      className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors"
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Hide preview
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> Show text preview
                        </>
                      )}
                    </button>
                    {expanded && (
                      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                        <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                          {campaign.previewContent}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => handleOpenPreview(campaign.id)}
                    className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors bg-white/[0.04] hover:bg-white/[0.07] px-3 py-1.5 rounded-md border border-white/[0.06]"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {campaign.status !== "Approved" &&
                  campaign.status !== "Scheduled" &&
                  campaign.status !== "Sent" && (
                    <Button
                      size="sm"
                      className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/20 text-xs h-7"
                      onClick={() => handleApprove(campaign.id)}
                    >
                      Approve
                    </Button>
                  )}
                {campaign.status !== "Sent" &&
                  campaign.status !== "Scheduled" && (
                    <Button
                      size="sm"
                      className="bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 border border-orange-500/20 text-xs h-7"
                      onClick={() => handleRequestEdit(campaign.id)}
                    >
                      Request Edit
                    </Button>
                  )}
                {campaign.mailchimpUrl && (
                  <a
                    href={campaign.mailchimpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-white/30 hover:text-white/60 text-xs h-7 gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View in Mailchimp
                    </Button>
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Email Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="bg-[#111] border border-white/[0.08] flex flex-col p-0" style={{ width: "80vw", maxWidth: "80vw", height: "85vh", maxHeight: "85vh" }}>
          {(() => {
            const campaign = items.find((c) => c.id === previewCampaignId);
            if (!campaign) return null;
            const hasHtml = !!campaign.htmlContent;
            return (
              <>
                <div className="px-6 pt-5 pb-0">
                  <DialogHeader>
                    <DialogTitle className="text-white/90 text-base">Email Preview</DialogTitle>
                  </DialogHeader>
                </div>
                {/* Email client header — Gmail/Outlook style */}
                <div className="mx-6 rounded-t-lg border border-white/[0.08] bg-[#1a1a1e] px-5 py-4 space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-white/40 w-16 shrink-0 text-right text-xs">From</span>
                    <span className="text-white/90 font-medium">{campaign.fromName || "Dream House Lending"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-white/40 w-16 shrink-0 text-right text-xs">To</span>
                    <span className="text-white/60">[First Name] (example recipient)</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-white/40 w-16 shrink-0 text-right text-xs">Subject</span>
                    <span className="text-white/90 font-semibold">{campaign.subject || "No subject"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-white/40 w-16 shrink-0 text-right text-xs">Date</span>
                    <span className="text-white/50">{campaign.scheduledDate || "Not scheduled"}</span>
                  </div>
                </div>
                {/* Rendered email body */}
                <div className="mx-6 flex-1 overflow-y-auto border-x border-b border-white/[0.08] rounded-b-lg bg-[#f5f5f5]">
                  {hasHtml ? (
                    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 0" }}>
                      <div className="bg-white rounded shadow-sm" style={{ maxWidth: 600 }}>
                        <iframe
                          srcDoc={campaign.htmlContent || ""}
                          title="Email preview"
                          className="w-full border-0 rounded"
                          style={{ minHeight: 400, background: "white" }}
                          sandbox="allow-same-origin"
                          onLoad={(e) => {
                            const iframe = e.target as HTMLIFrameElement;
                            if (iframe.contentDocument?.body) {
                              iframe.style.height = iframe.contentDocument.body.scrollHeight + 40 + "px";
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                      <div className="text-center">
                        <Mail className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium">Full email content ready</p>
                        <p className="text-gray-400 text-sm mt-1">Click below to load the preview from Mailchimp</p>
                      </div>
                      <button className="bg-[#1a3c6b] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#244e8a] transition-colors">
                        Load from Mailchimp
                      </button>
                    </div>
                  )}
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-3 px-6 py-4 border-t border-white/[0.06]">
                  {campaign.status !== "Approved" &&
                    campaign.status !== "Scheduled" &&
                    campaign.status !== "Sent" && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs h-9 gap-1.5 px-4"
                        onClick={() => handleApprove(campaign.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve &amp; Schedule
                      </Button>
                    )}
                  {campaign.status !== "Sent" &&
                    campaign.status !== "Scheduled" && (
                      <Button
                        size="sm"
                        className="bg-orange-500 text-white hover:bg-orange-600 text-xs h-9 gap-1.5 px-4"
                        onClick={() => {
                          setPreviewModalOpen(false);
                          handleRequestEdit(campaign.id);
                        }}
                      >
                        <FileEdit className="h-3.5 w-3.5" />
                        Request Edit
                      </Button>
                    )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-white/50 hover:text-white/70 text-xs h-9"
                    onClick={() => setPreviewModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Schedule Modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-md bg-[#111] border border-white/[0.08]">
          <DialogHeader>
            <DialogTitle className="text-white/90">Schedule Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-white/50">
              Choose when to send{" "}
              <span className="text-white/70">
                &ldquo;
                {items.find((c) => c.id === schedulingCampaignId)?.name}
                &rdquo;
              </span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-white/50">Date</label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white/90"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-white/50">Time</label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white/90"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-white/50 hover:text-white/70 text-xs h-8"
                onClick={() => setScheduleModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/20 text-xs h-8 gap-1"
                onClick={handleScheduleConfirm}
                disabled={!scheduleDate || !scheduleTime || scheduling}
              >
                {scheduling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                Schedule Campaign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Request Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md bg-[#111] border border-white/[0.08]">
          <DialogHeader>
            <DialogTitle className="text-white/90">Request Edit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-white/50">
              What needs to change on{" "}
              <span className="text-white/70">
                &ldquo;
                {items.find((c) => c.id === editCampaignId)?.name}
                &rdquo;
              </span>
              ?
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-white/50">
                What needs to change?
              </label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe the changes needed..."
                className="bg-white/[0.04] border-white/[0.08] text-white/90 placeholder:text-white/25 min-h-[80px]"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-white/30">
              This will create a task on the Task Board assigned to Jay Jay.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-white/50 hover:text-white/70 text-xs h-8"
                onClick={() => setEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 border border-orange-500/20 text-xs h-8 gap-1"
                onClick={handleEditSubmit}
                disabled={!editDescription.trim()}
              >
                <FileEdit className="h-3 w-3" />
                Submit Edit Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
