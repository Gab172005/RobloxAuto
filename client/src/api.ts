import type {
  AgentLiveStatus,
  AgentRegistry,
  AgentStreamEvent,
  BridgeDiagnostics,
  CatalogItem,
  ChatMessageRecord,
  CompetitorSnapshotRecord,
  ExplorerNode,
  ExplorerRef,
  GameReviewResult,
  IdeaScoreResult,
  PlaybookChapterMeta,
  ProjectRecord,
  RevenueSimResult,
  ReviewItemRecord,
  SecurityScanResult,
  StudioSettings,
  TaskRecord,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  // Bridge & diagnostics
  getDiagnostics: () => request<BridgeDiagnostics>('/api/bridge/diagnostics'),
  previewMcpConfig: (includeBlender: boolean) =>
    request<{ targetPath: string; snippet: Record<string, unknown>; instructions: string[] }>(
      '/api/bridge/mcp/preview',
      { method: 'POST', body: JSON.stringify({ includeBlender }) }
    ),
  applyMcpConfig: (body: { includeBlender?: boolean; robloxStudioUrl?: string; robloxStudioCommand?: string }) =>
    request<{ backupPath: string | null; settingsPath: string; mcpServers: string[] }>(
      '/api/bridge/mcp/apply',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  startRojo: (projectId: string, port = 34872) =>
    request<{ running: boolean; port: number | null; logs: string[] }>('/api/bridge/rojo/start', {
      method: 'POST',
      body: JSON.stringify({ projectId, port }),
    }),
  stopRojo: () =>
    request<{ running: boolean; port: number | null; logs: string[] }>('/api/bridge/rojo/stop', {
      method: 'POST',
    }),

  // Projects
  listProjects: () => request<{ projects: ProjectRecord[] }>('/api/projects'),
  createProject: (body: { name: string; genre: string; pitch: string; universeId?: string }) =>
    request<{ project: ProjectRecord }>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  updateProject: (id: string, patch: Partial<ProjectRecord>) =>
    request<{ project: ProjectRecord }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: string) => request<{ deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  // Explorer, files & security
  getExplorer: (projectId: string) => request<{ tree: ExplorerNode }>(`/api/projects/${projectId}/explorer`),
  listFiles: (projectId: string) =>
    request<{ files: Array<{ path: string; size: number; modifiedAt: string }> }>(`/api/projects/${projectId}/files`),
  readFile: (projectId: string, filePath: string) =>
    request<{ path: string; content: string }>(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`),
  saveFile: (projectId: string, filePath: string, content: string) =>
    request<{ saved: boolean }>(`/api/projects/${projectId}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content }),
    }),
  scanSecurity: (projectId: string) => request<SecurityScanResult>(`/api/projects/${projectId}/security-scan`),

  // Chat with Lead
  listChat: (projectId: string) => request<{ messages: ChatMessageRecord[] }>(`/api/projects/${projectId}/chat`),
  sendChat: (projectId: string, message: string, explorerRefs: ExplorerRef[] = []) =>
    request<{ userMessage: ChatMessageRecord; leadMessage: ChatMessageRecord; spawnedTasks: TaskRecord[] }>(
      `/api/projects/${projectId}/chat`,
      { method: 'POST', body: JSON.stringify({ message, explorerRefs }) }
    ),

  // Tasks & Git
  listTasks: (projectId: string) => request<{ tasks: TaskRecord[] }>(`/api/projects/${projectId}/tasks`),
  launchQuickPipeline: (projectId: string, templateId: string) =>
    request<{ tasks: TaskRecord[] }>(`/api/projects/${projectId}/tasks/quick-pipeline`, {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    }),
  getTaskDiff: (taskId: string) =>
    request<{ taskId: string; before: string | null; after: string | null; diff: string }>(`/api/tasks/${taskId}/diff`),
  rollbackTask: (taskId: string) =>
    request<{ task: TaskRecord; restoredCommit: string }>(`/api/tasks/${taskId}/rollback`, { method: 'POST' }),
  cancelTask: (taskId: string) =>
    request<{ task: TaskRecord | null }>(`/api/tasks/${taskId}/cancel`, { method: 'POST' }),

  // Reviews
  listReviews: (projectId?: string) =>
    request<{ reviews: ReviewItemRecord[] }>(
      projectId ? `/api/reviews?projectId=${encodeURIComponent(projectId)}` : '/api/reviews'
    ),
  approveReview: (reviewId: string, notes?: string) =>
    request<{ review: ReviewItemRecord; task: TaskRecord | null }>(`/api/reviews/${reviewId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  requestReviewChanges: (reviewId: string, feedback: string) =>
    request<{ review: ReviewItemRecord; task: TaskRecord | null }>(`/api/reviews/${reviewId}/request-changes`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    }),

  // Logs
  listLogs: (projectId?: string, agentId?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (agentId && agentId !== 'ALL') params.set('agentId', agentId);
    params.set('limit', '300');
    return request<{ logs: AgentStreamEvent[] }>(`/api/logs?${params.toString()}`);
  },

  // Agents, Playbook & Catalog
  getAgents: () => request<{ registry: AgentRegistry; statuses: Record<string, AgentLiveStatus> }>('/api/agents'),
  saveRegistry: (registry: AgentRegistry) =>
    request<{ registry: AgentRegistry }>('/api/agents/registry', { method: 'PUT', body: JSON.stringify(registry) }),
  getAgentPrompt: (agentId: string) => request<{ content: string }>(`/api/agents/${agentId}/prompt`),
  saveAgentPrompt: (agentId: string, content: string) =>
    request<{ saved: boolean }>(`/api/agents/${agentId}/prompt`, { method: 'PUT', body: JSON.stringify({ content }) }),
  listPlaybook: () => request<{ chapters: PlaybookChapterMeta[] }>('/api/playbook'),
  savePlaybookChapter: (filename: string, content: string) =>
    request<{ saved: boolean }>(`/api/playbook/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  listCatalog: () => request<{ items: CatalogItem[] }>('/api/catalog'),
  installCatalogItem: (projectId: string, itemId: string) =>
    request<{ installed: boolean; targetPath: string }>(`/api/projects/${projectId}/catalog/${itemId}/install`, {
      method: 'POST',
    }),

  // Market & Revenue
  getTrending: () =>
    request<{
      archetypes: Array<{
        id: string;
        name: string;
        momentumScore: number;
        avgMobileShare: string;
        monetizationFit: string;
        viralHook: string;
        estimatedMvpHours: string;
      }>;
    }>('/api/market/trending'),
  getSnapshots: () => request<{ snapshots: CompetitorSnapshotRecord[] }>('/api/market/snapshots'),
  scoreIdea: (body: {
    title: string;
    genre: string;
    coreLoop: string;
    monetizationIdeas?: string;
    viralHook?: string;
    useAiEnrichment?: boolean;
    projectId?: string;
  }) => request<IdeaScoreResult>('/api/market/score-idea', { method: 'POST', body: JSON.stringify(body) }),
  reviewGame: (body: {
    gameUrlOrId?: string;
    projectId?: string;
    useAiTeardown?: boolean;
    manualData?: {
      name: string;
      creatorName?: string;
      playing: number;
      visits: number;
      favoritedCount: number;
      upVotes: number;
      downVotes: number;
      gamePasses?: Array<{ id: number; name: string; price: number | null }>;
    };
  }) => request<GameReviewResult>('/api/market/review-game', { method: 'POST', body: JSON.stringify(body) }),
  simulateRevenue: (body: Record<string, number>) =>
    request<RevenueSimResult>('/api/market/simulate-revenue', { method: 'POST', body: JSON.stringify(body) }),

  // Media & Promo Video Assembler
  listMedia: (projectId: string) =>
    request<{
      ffmpegInstalled: boolean;
      assets: Array<{ folder: string; filename: string; relPath: string; url: string; kind: string; sizeBytes: number }>;
    }>(`/api/projects/${projectId}/media`),
  assemblePromo: (
    projectId: string,
    body: {
      inputClipFilename?: string;
      hookCaption: string;
      ctaCaption?: string;
      durationSeconds?: number;
      addToReviewQueue?: boolean;
    }
  ) =>
    request<{
      mode: string;
      ffmpegInstalled: boolean;
      outputRelPath: string;
      outputUrl?: string;
      ffmpegCommand: string;
      message: string;
    }>(`/api/projects/${projectId}/media/assemble-promo`, { method: 'POST', body: JSON.stringify(body) }),

  // Settings
  getSettings: () => request<{ settings: StudioSettings }>('/api/settings'),
  updateSettings: (patch: Partial<StudioSettings>) =>
    request<{ settings: StudioSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  saveOpenCloud: (body: { apiKey?: string; defaultUniverseId?: string; testPlaceId?: string; prodPlaceId?: string }) =>
    request<{ saved: boolean; message: string }>('/api/settings/open-cloud', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

export function createStudioWebSocket(onMessage: (msg: { type: string; payload: unknown }) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  ws.onmessage = (evt) => {
    try {
      const parsed = JSON.parse(String(evt.data)) as { type: string; payload: unknown };
      onMessage(parsed);
    } catch {
      // Ignore malformed frame
    }
  };
  return ws;
}

