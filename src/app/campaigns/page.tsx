"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Mail,
  Clock,
  CheckCircle2,
  FileEdit,
  BarChart3,
  Users,
  MousePointerClick,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

type CampaignStatus =
  | "Draft"
  | "Pending Review"
  | "Approved"
  | "Scheduled"
  | "Sent"
  | "Needs Edit";

interface CampaignStats {
  openRate: number | null;
  clickRate: number | null;
  emailsSent: number;
}

interface Campaign {
  id: string;
  mailchimpId?: string;
  name: string;
  audience: string;
  contactCount?: number;
  subject?: string;
  status: CampaignStatus;
  scheduledDate?: string;
  mailchimpUrl?: string;
  fromName?: string;
  notes?: string;
  stats?: CampaignStats;
}

interface MailchimpCampaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  send_time: string | null;
  emails_sent: number;
  open_rate: number | null;
  click_rate: number | null;
  audience_name: string;
}

// Local campaign data
const LOCAL_CAMPAIGNS: Campaign[] = [
  {
    id: "1",
    name: "KW Bakersfield — Monday Agent Email",
    audience: "KW Bakersfield Agents",
    contactCount: 107,
    subject: "Your buyers can afford more than they think (here's why)",
    status: "Pending Review",
    scheduledDate: "Monday, March 23, 2026 at 8:00 AM",
    mailchimpUrl: "https://us22.admin.mailchimp.com/campaigns/edit?id=52943",
    fromName: "Alfonso Garza — Dream House Lending",
    notes: "Jay Jay wrote this. Fonz needs to review and approve before scheduling.",
  },
  {
    id: "2",
    name: "Dream House Lending — Rate Alert",
    audience: "Past Clients",
    contactCount: 45,
    subject: "Rates just dropped — here's what it means for you",
    status: "Draft",
    fromName: "Alfonso Garza — Dream House Lending",
    notes: "Template drafted by Jay Jay. Needs content review.",
  },
  {
    id: "3",
    name: "FHA Buyers — First-Time Buyer Guide",
    audience: "Lead Magnet Subscribers",
    contactCount: 23,
    subject: "Your free guide to buying your first home in California",
    status: "Draft",
    fromName: "Alfonso Garza — Dream House Lending",
  },
];

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; icon: React.ElementType }> = {
  "Sent": {
    label: "Sent",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    icon: CheckCircle2,
  },
  "Scheduled": {
    label: "Scheduled",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    icon: Clock,
  },
  "Approved": {
    label: "Approved",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    icon: CheckCircle2,
  },
  "Pending Review": {
    label: "Needs Approval",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    icon: AlertCircle,
  },
  "Needs Edit": {
    label: "Needs Edit",
    color: "bg-red-500/15 text-red-400 border-red-500/25",
    icon: FileEdit,
  },
  "Draft": {
    label: "Draft",
    color: "bg-white/[0.06] text-white/40 border-white/[0.08]",
    icon: FileEdit,
  },
};

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const config = STATUS_CONFIG[campaign.status];
  const StatusIcon = config.icon;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.10] transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white/85 leading-tight">
            {campaign.name}
          </h3>
          {campaign.subject && (
            <p className="text-xs text-white/40 mt-0.5 line-clamp-1">
              {campaign.subject}
            </p>
          )}
        </div>
        <Badge className={`${config.color} border shrink-0 flex items-center gap-1 text-[10px]`}>
          <StatusIcon className="size-3" />
          {config.label}
        </Badge>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-[11px] text-white/35 mb-3">
        <span className="flex items-center gap-1">
          <Users className="size-3" />
          {campaign.contactCount
            ? `${campaign.contactCount} contacts`
            : campaign.audience}
        </span>
        {campaign.scheduledDate && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {campaign.scheduledDate}
          </span>
        )}
      </div>

      {/* Stats (if sent) */}
      {campaign.stats && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2 text-center">
            <p className="text-[10px] text-white/30 mb-0.5">Sent</p>
            <p className="text-sm font-bold text-white/75">
              {campaign.stats.emailsSent.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2 text-center">
            <p className="text-[10px] text-white/30 mb-0.5 flex items-center justify-center gap-1">
              <BarChart3 className="size-2.5" /> Opens
            </p>
            <p className="text-sm font-bold text-emerald-400">
              {campaign.stats.openRate !== null
                ? (campaign.stats.openRate * 100).toFixed(1) + "%"
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2 text-center">
            <p className="text-[10px] text-white/30 mb-0.5 flex items-center justify-center gap-1">
              <MousePointerClick className="size-2.5" /> Clicks
            </p>
            <p className="text-sm font-bold text-blue-400">
              {campaign.stats.clickRate !== null
                ? (campaign.stats.clickRate * 100).toFixed(1) + "%"
                : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Notes */}
      {campaign.notes && (
        <p className="text-xs text-amber-400/60 bg-amber-500/[0.05] border border-amber-500/15 rounded-md px-2.5 py-1.5 mb-3">
          {campaign.notes}
        </p>
      )}

      {/* Actions */}
      {campaign.mailchimpUrl && (
        <a
          href={campaign.mailchimpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          <ExternalLink className="size-3" />
          View in Mailchimp
        </a>
      )}
    </div>
  );
}

function MailchimpCard({ campaign }: { campaign: MailchimpCampaign }) {
  const isSent = campaign.status === "sent";
  const isScheduled = campaign.status === "schedule";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.10] transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white/85 leading-tight">
            {campaign.name}
          </h3>
          {campaign.subject && (
            <p className="text-xs text-white/40 mt-0.5 line-clamp-1">
              {campaign.subject}
            </p>
          )}
        </div>
        <Badge
          className={
            isSent
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 border text-[10px]"
              : isScheduled
                ? "bg-blue-500/15 text-blue-400 border-blue-500/25 border text-[10px]"
                : "bg-white/[0.06] text-white/40 border-white/[0.08] border text-[10px]"
          }
        >
          {campaign.status}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-white/35 mb-3">
        <span className="flex items-center gap-1">
          <Users className="size-3" />
          {campaign.emails_sent > 0
            ? `${campaign.emails_sent.toLocaleString()} sent`
            : campaign.audience_name}
        </span>
        {campaign.send_time && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {new Date(campaign.send_time).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>

      {isSent && (campaign.open_rate !== null || campaign.click_rate !== null) && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2 text-center">
            <p className="text-[10px] text-white/30 mb-0.5">Sent</p>
            <p className="text-sm font-bold text-white/75">
              {campaign.emails_sent.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2 text-center">
            <p className="text-[10px] text-white/30 mb-0.5">Opens</p>
            <p className="text-sm font-bold text-emerald-400">
              {campaign.open_rate !== null
                ? (campaign.open_rate * 100).toFixed(1) + "%"
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2 text-center">
            <p className="text-[10px] text-white/30 mb-0.5">Clicks</p>
            <p className="text-sm font-bold text-blue-400">
              {campaign.click_rate !== null
                ? (campaign.click_rate * 100).toFixed(1) + "%"
                : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const [mailchimpCampaigns, setMailchimpCampaigns] = useState<MailchimpCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [mailchimpError, setMailchimpError] = useState<string | null>(null);

  const fetchMailchimp = useCallback(async () => {
    setLoading(true);
    setMailchimpError(null);
    try {
      const res = await fetch("/api/mailchimp");
      if (res.ok) {
        const data = await res.json();
        if (data.campaigns) {
          setMailchimpCampaigns(data.campaigns);
        }
      } else {
        setMailchimpError("Mailchimp API unavailable");
      }
    } catch {
      setMailchimpError("Could not reach Mailchimp API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMailchimp();
  }, [fetchMailchimp]);

  // Categorize local campaigns
  const activeCampaigns = LOCAL_CAMPAIGNS.filter(
    (c) => c.status === "Sent" || c.status === "Scheduled" || c.status === "Approved"
  );
  const needsApprovalCampaigns = LOCAL_CAMPAIGNS.filter(
    (c) => c.status === "Pending Review" || c.status === "Needs Edit"
  );
  const draftCampaigns = LOCAL_CAMPAIGNS.filter((c) => c.status === "Draft");

  const sentMailchimp = mailchimpCampaigns.filter((c) => c.status === "sent");
  const scheduledMailchimp = mailchimpCampaigns.filter(
    (c) => c.status === "schedule" || c.status === "paused"
  );

  return (
    <div className="min-h-screen bg-[#080808] text-white/90 p-5">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <Mail className="size-4 text-white/35" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white/80">
                Campaigns
              </h1>
              <p className="text-xs text-white/30 mt-0.5">
                Email campaigns via Mailchimp · managed by Jay Jay
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={fetchMailchimp}
            disabled={loading}
            className="bg-white/[0.06] border-white/[0.06] text-white/60 hover:bg-white/[0.10] text-xs h-8"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Sync Mailchimp
          </Button>
        </div>

        {/* ── Section 1: Needs Approval ── */}
        {needsApprovalCampaigns.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-2 rounded-full bg-amber-500" />
              <h2 className="text-sm font-semibold text-amber-400">
                Needs Approval ({needsApprovalCampaigns.length})
              </h2>
              <span className="text-[10px] text-white/30">— Action required from Fonz</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {needsApprovalCampaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          </div>
        )}

        {/* ── Section 2: Active / Sent ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-2 rounded-full bg-emerald-500" />
            <h2 className="text-sm font-semibold text-white/70">Active & Sent</h2>
          </div>

          {activeCampaigns.length > 0 || sentMailchimp.length > 0 || scheduledMailchimp.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeCampaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
              {sentMailchimp.map((c) => (
                <MailchimpCard key={c.id} campaign={c} />
              ))}
              {scheduledMailchimp.map((c) => (
                <MailchimpCard key={c.id} campaign={c} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.07] p-8 text-center">
              {mailchimpError ? (
                <p className="text-xs text-amber-400/70">{mailchimpError}</p>
              ) : loading ? (
                <p className="text-xs text-white/25">Syncing with Mailchimp...</p>
              ) : (
                <p className="text-xs text-white/25">No active campaigns</p>
              )}
            </div>
          )}
        </div>

        {/* ── Section 3: Drafts ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="size-2 rounded-full bg-white/25" />
            <h2 className="text-sm font-semibold text-white/50">
              Drafts ({draftCampaigns.length})
            </h2>
          </div>
          {draftCampaigns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {draftCampaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.05] p-6 text-center">
              <p className="text-xs text-white/20">No drafts</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
