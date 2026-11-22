import { z } from 'zod';

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

export type ModelTier = 'pro' | 'fast';
export type ApprovalMode = 'default' | 'auto_edit' | 'yolo' | 'plan';

export interface AgentPermissions {
  canReadWorkspace: boolean;
  canWriteWorkspace: boolean;
  canRunShell: boolean;
  canUseRobloxStudioMcp: boolean;
  canUseOpenCloud: boolean;
  canPublish: boolean;
  writablePaths: string[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  department: string;
  color: string;
  modelTier: ModelTier;
  approvalMode: ApprovalMode;
  promptFile: string;
  playbookChapters: string[];
  allowedMcpServers: string[];
  permissions: AgentPermissions;
  defaultRequiresReview: boolean;
  customizableSlot: boolean;
  description: string;
}

export interface AgentRegistry {
  version: string;
  studioName: string;
  modelTiers: Record<ModelTier, string>;
  agents: AgentDefinition[];
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

export type ReviewCategory =
  | 'idea'
  | 'gdd'
  | 'monetization'
  | 'visual'
  | 'security'
  | 'playtest'
  | 'promo'
  | 'publish';

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
  reviewCategory: ReviewCategory | null;
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

export type ReviewStatus = 'pending' | 'approved' | 'changes_requested';

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
  category: ReviewCategory;
  title: string;
  summary: string;
  status: ReviewStatus;
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

export type GeminiStreamEventType =
  | 'init'
  | 'message'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'result'
  | 'system';

export interface AgentStreamEvent {
  id: string;
  projectId: string;
  taskId: string | null;
  agentId: string;
  type: GeminiStreamEventType;
  timestamp: string;
  content: string;
  toolName?: string;
  tokensIn?: number;
  tokensOut?: number;
  exitCode?: number;
  raw?: unknown;
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
  rawPayload: unknown;
  createdAt: string;
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

export interface SecurityFinding {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category:
    | 'backdoor'
    | 'embedded_script'
    | 'remote_exploit'
    | 'process_receipt'
    | 'datastore_race'
    | 'strict_mode'
    | 'http_exfiltration';
  file: string;
  line: number;
  title: string;
  snippet: string;
  remediation: string;
}

export interface SecurityScanResult {
  scannedFiles: number;
  clean: boolean;
  releaseBlocked: boolean;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: SecurityFinding[];
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
}

export interface ExplorerNode {
  id: string;
  name: string;
  className: string;
  robloxPath: string;
  filePath?: string;
  children: ExplorerNode[];
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
    rojo: { installed: boolean; version: string | null; serving: boolean; port: number | null; projectSlug: string | null };
    ffmpeg: { installed: boolean; version: string | null };
  };
  openCloud: {
    apiKeyConfigured: boolean;
    defaultUniverseId: string | null;
    testPlaceId: string | null;
    prodPlaceId: string | null;
  };
}

// Strict Zod schemas for DAG Task Graph validation
export const DagTaskInputSchema = z.object({
  key: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().min(2).max(160),
  agentId: z.string().min(1),
  description: z.string().min(5),
  dependsOn: z.array(z.string()).default([]),
  requiresReview: z.boolean().optional(),
  reviewCategory: z
    .enum(['idea', 'gdd', 'monetization', 'visual', 'security', 'playtest', 'promo', 'publish'])
    .nullable()
    .optional(),
  priority: z.number().int().min(1).max(10).default(5),
});

export const DagPlanSchema = z.object({
  summary: z.string().min(1),
  tasks: z.array(DagTaskInputSchema).min(1),
});

export type DagTaskInput = z.infer<typeof DagTaskInputSchema>;
export type DagPlan = z.infer<typeof DagPlanSchema>;

export const AgentRegistrySchema = z.object({
  version: z.string(),
  studioName: z.string(),
  modelTiers: z.object({
    pro: z.string(),
    fast: z.string(),
  }),
  agents: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.string().min(1),
      department: z.string().min(1),
      color: z.string().min(1),
      modelTier: z.enum(['pro', 'fast']),
      approvalMode: z.enum(['default', 'auto_edit', 'yolo', 'plan']),
      promptFile: z.string().min(1),
      playbookChapters: z.array(z.string()),
      allowedMcpServers: z.array(z.string()),
      permissions: z.object({
        canReadWorkspace: z.boolean(),
        canWriteWorkspace: z.boolean(),
        canRunShell: z.boolean(),
        canUseRobloxStudioMcp: z.boolean(),
        canUseOpenCloud: z.boolean(),
        canPublish: z.boolean(),
        writablePaths: z.array(z.string()),
      }),
      defaultRequiresReview: z.boolean(),
      customizableSlot: z.boolean(),
      description: z.string(),
    })
  ),
});

