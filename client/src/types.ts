export type ProjectStage = 'idea' | 'building' | 'testing' | 'live';

export interface ProjectKpis {
  dau: number;
  ccu: number;
  d1Retention: number;
  d7Retention: number;
  d30Retention: number;
  payerPercent: number;
  arppuRobux: number;
  estimatedMonthlyUsd: number;
  estimatedMonthlyPhp: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  genre: string;
  pitch: string;
  stage: ProjectStage;
  universeId: string | null;
  testPlaceId: string | null;
  prodPlaceId: string | null;
  ideaScore: number | null;
  kpis: ProjectKpis;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  department: string;
  color: string;
  modelTier: 'pro' | 'fast';
  approvalMode: 'default' | 'auto_edit' | 'yolo' | 'plan';
  promptFile: string;
  playbookChapters: string[];
  allowedMcpServers: string[];
  permissions: {
    canReadWorkspace: boolean;
    canWriteWorkspace: boolean;
    canRunShell: boolean;
    canUseRobloxStudioMcp: boolean;
    canUseOpenCloud: boolean;
    canPublish: boolean;
    writablePaths: string[];
  };
  defaultRequiresReview: boolean;
  customizableSlot: boolean;
  description: string;
}

export interface AgentRegistry {
  version: string;
  studioName: string;
  modelTiers: { pro: string; fast: string };
  agents: AgentDefinition[];
}

export interface AgentLiveStatus {
  status: 'idle' | 'working' | 'review';
  taskId?: string;
  taskTitle?: string;
}

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';

export interface TaskRecord {
  id: string;
  projectId: string;
  taskKey: string;
  title: string;
  description: string;
  agentId: string;
  dependsOn: string[];
  status: TaskStatus;
  requiresReview: boolean;
  reviewCategory: string | null;
  priority: number;
  retryCount: number;
  maxRetries: number;
  parentTaskId: string | null;
  gitBeforeCommit: string | null;
  gitAfterCommit: string | null;
  tokensIn: number;
  tokensOut: number;
  elapsedMs: number;
  exitCode: number | null;
  outputSummary: string | null;
  error: string | null;
  revisionFeedback: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAttachment {
  type: 'markdown' | 'json' | 'image' | 'video' | 'diff' | 'code';
  label: string;
  path?: string;
  url?: string;
  content?: string;
}

export interface ReviewItemRecord {
  id: string;
  projectId: string;
  taskId: string | null;
  agentId: string;
  category: string;
  title: string;
  summary: string;
  status: 'pending' | 'approved' | 'changes_requested';
  attachments: ReviewAttachment[];
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExplorerRef {
  path: string;
  robloxPath: string;
  className: string;
}

export interface ChatMessageRecord {
  id: string;
  projectId: string;
  role: 'user' | 'assistant' | 'system';
  agentId: string;
  content: string;
  delegatedTaskIds: string[];
  explorerRefs: ExplorerRef[];
  createdAt: string;
}

export interface AgentStreamEvent {
  id: string;
  projectId: string;
  taskId: string | null;
  agentId: string;
  type: 'init' | 'message' | 'tool_use' | 'tool_result' | 'error' | 'result' | 'system';
  timestamp: string;
  content: string;
  toolName?: string;
  tokensIn?: number;
  tokensOut?: number;
  exitCode?: number;
}

export interface BridgeDiagnostics {
  geminiCli: {
    installed: boolean;
    version: string | null;
    authType: string | null;
    settingsPath: string;
    settingsExists: boolean;
  };
  mcp: {
    robloxStudioConfigured: boolean;
    blenderConfigured: boolean;
    configuredServers: string[];
  };
  tools: {
    git: { installed: boolean; version: string | null };
    rojo: {
      installed: boolean;
      version: string | null;
      serving: boolean;
      port: number | null;
      projectSlug: string | null;
    };
    ffmpeg: { installed: boolean; version: string | null };
  };
  openCloud: {
    apiKeyConfigured: boolean;
    defaultUniverseId: string | null;
    testPlaceId: string | null;
    prodPlaceId: string | null;
  };
}

export interface StudioSettings {
  maxParallelAgents: number;
  maxQaRetries: number;
  taskTimeoutMs: number;
  proModel: string;
  fastModel: string;
  agentModelOverrides: Record<string, string>;
  usdToPhpRate: number;
  devExRateUsdPerRobux: number;
  autoQaLoop: boolean;
  dryRunMode: boolean;
}

export interface ExplorerNode {
  id: string;
  name: string;
  className: string;
  robloxPath: string;
  filePath?: string;
  children: ExplorerNode[];
}

export interface PlaybookChapterMeta {
  filename: string;
  title: string;
  mappedAgents: string[];
  bytes: number;
  content: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  targetPath: string;
  sourcePath: string;
  agents: string[];
  tags: string[];
  sanitized: boolean;
  description: string;
  previewCode?: string;
}

export interface SecurityScanResult {
  scannedFiles: number;
  clean: boolean;
  releaseBlocked: boolean;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: Array<{
    id: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
    file: string;
    line: number;
    title: string;
    snippet: string;
    remediation: string;
  }>;
}

export interface IdeaScoreResult {
  title: string;
  genre: string;
  totalScore: number;
  verdict: 'GREENLIGHT' | 'REFINE_HOOK' | 'PIVOT';
  breakdown: {
    trendMomentum: number;
    firstTwoMinHook: number;
    mobileFit: number;
    monetizationDepth: number;
    viralClipPotential: number;
    buildComplexityFit: number;
  };
  strengths: string[];
  risks: string[];
  recommendedPriceLadder: Array<{ tier: string; item: string; robux: number }>;
  viralClipAngle: string;
  aiNotes?: string;
}

export interface CompetitorSnapshotRecord {
  id: string;
  projectId: string | null;
  placeId: string;
  universeId: string;
  name: string;
  creatorName: string;
  playing: number;
  visits: number;
  favoritedCount: number;
  upVotes: number;
  downVotes: number;
  likeRatio: number;
  iconUrl: string | null;
  thumbnailUrls: string[];
  gamePasses: Array<{ id: number; name: string; price: number | null }>;
  auditScore: number | null;
  auditSummary: string | null;
  createdAt: string;
}

export interface GameReviewResult {
  snapshot: CompetitorSnapshotRecord;
  source: 'roblox_live_api' | 'manual_paste';
  auditScore: number;
  pillars: {
    engagementHealth: number;
    socialProof: number;
    monetizationLadder: number;
    retentionSignals: number;
  };
  pricingGaps: string[];
  strengths: string[];
  upgradeBacklog: Array<{ priority: 'P0' | 'P1' | 'P2'; agent: string; action: string }>;
  aiTeardown?: string;
}

export interface RevenueSimResult {
  inputs: {
    ccu: number;
    dau: number;
    avgSessionMinutes: number;
    d1RetentionPct: number;
    d7RetentionPct: number;
    d30RetentionPct: number;
    payerConversionPct: number;
    arppuRobux: number;
    marketplaceFeePct: number;
    devExRateUsdPerRobux: number;
    usdToPhpRate: number;
  };
  benchmarks: {
    d1Target: number;
    d7Target: number;
    d30Target: number;
    payerBaseline: number;
    retentionHealth: 'Strong' | 'Average' | 'Needs Work';
    monetizationHealth: 'Strong' | 'Average' | 'Needs Work';
  };
  scenarios: Array<{
    label: 'Conservative' | 'Base' | 'Breakout';
    multiplier: number;
    dau: number;
    estimatedCcu: number;
    dailyPayers: number;
    grossDailyRobux: number;
    netDailyRobux: number;
    arpdauRobux: number;
    dailyUsd: number;
    monthlyUsd: number;
    annualUsd: number;
    monthlyPhp: number;
    annualPhp: number;
  }>;
}

export type NavTab =
  | 'portfolio'
  | 'chat'
  | 'market'
  | 'tasks'
  | 'reviews'
  | 'terminal'
  | 'explorer'
  | 'settings';

