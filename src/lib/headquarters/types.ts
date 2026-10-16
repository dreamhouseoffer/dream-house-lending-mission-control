// Shape of the browser-safe snapshot produced by normalizeSnapshot()/createUnavailableSnapshot().

export type HqLink = { label: string; url: string };

export type HqAsset = {
  id: string;
  platform: string;
  identifier: string;
  label: string;
  family: string;
  evidenceLevel: string;
  secondaryEvidence: string[];
  recommendation: string;
  statusLabel: string | null;
  observed: string;
  gap: string;
  nextMove: string;
  facts: {
    language: string | null;
    framework: string | null;
    visibility: string | null;
    archived: boolean | null;
    lastPushedAt: string | null;
    sourceTreeFileCount: number | null;
    httpStatus: number | null;
    deploymentState: string | null;
    pageTitle: string | null;
    stack: string[];
    observedPaths: string[];
    hasGitRemote: boolean | null;
    hasUncommittedChanges: boolean | null;
  };
  links: HqLink[];
  relatedAssetIds: string[];
};

export type HqNode = { id: string; label: string; kind: string; family: string; evidenceLevel: string; note: string };

export type HqConnection = {
  id: string;
  from: string;
  to: string;
  kind: string;
  verification: string;
  label: string;
  note: string;
};

export type HqFinding = { id: string; severity: string; title: string; detail: string; assetIds: string[] };

export type HqPhase = {
  id: string;
  phase: number | null;
  title: string;
  summary: string;
  status: "planned";
  dependencies: string[];
  acceptanceTests: string[];
  approvalsNeeded: string[];
};

export type HqReadiness = { id: string; category: string; title: string; detail: string; state: string };

export type HqSummary = {
  total: number;
  byPlatform: Record<string, number>;
  byFamily: Record<string, number>;
  byEvidence: Record<string, number>;
  byRecommendation: Record<string, number>;
  countsAreOverlappingAssets: boolean;
  coverageComplete: boolean;
  coverageGaps: { platform: string; expected: number; actual: number }[];
};

export type HqSnapshot = {
  available: boolean;
  status: string;
  message: string;
  mode: string;
  modeLabel: string;
  snapshotLabel: string;
  liveExecutionBridge: string;
  liveExecutionBridgeLabel: string;
  live: { status: string; runs: number | null; approvals: number | null; heartbeat: string | null };
  observedAt: string | null;
  timezone: string | null;
  generatedAt: string | null;
  coverage: Record<string, number> | null;
  notices: { sensitiveLeadAccess: boolean; sensitiveLeadNotice: string | null };
  assets: HqAsset[];
  nodes: HqNode[];
  connections: HqConnection[];
  findings: HqFinding[];
  roadmap: HqPhase[];
  readiness: HqReadiness[];
  limitations: string[];
  summary: HqSummary | null;
};

export type HqFilters = { query: string; platform: string; family: string; evidenceLevel: string; recommendation: string };
