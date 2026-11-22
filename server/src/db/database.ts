import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../config.js';
import type {
  AgentStreamEvent,
  ChatMessageRecord,
  CompetitorSnapshotRecord,
  ExplorerRef,
  ProjectKpis,
  ProjectRecord,
  ProjectStage,
  ReviewAttachment,
  ReviewCategory,
  ReviewItemRecord,
  ReviewStatus,
  StudioSettings,
  TaskRecord,
  TaskStatus,
} from '../types.js';

export const DEFAULT_KPIS: ProjectKpis = {
  dau: 0,
  ccu: 0,
  d1Retention: 0,
  d7Retention: 0,
  d30Retention: 0,
  payerPercent: 3.8,
  arppuRobux: 320,
  estimatedMonthlyUsd: 0,
  estimatedMonthlyPhp: 0,
};

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  maxParallelAgents: 3,
  maxQaRetries: 2,
  taskTimeoutMs: 5 * 60 * 1000,
  proModel: process.env.ROFORGE_PRO_MODEL || 'gemini-2.5-pro',
  fastModel: process.env.ROFORGE_FAST_MODEL || 'gemini-2.5-flash',
  agentModelOverrides: {},
  usdToPhpRate: Number(process.env.USD_TO_PHP_RATE || 58.0),
  devExRateUsdPerRobux: 0.0035,
  autoQaLoop: true,
  dryRunMode: false,
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class StudioDatabase {
  private db: DatabaseSync;

  constructor(dbFilePath: string = DB_PATH) {
    if (dbFilePath !== ':memory:') {
      const dir = path.dirname(dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  public close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        genre TEXT NOT NULL DEFAULT 'Simulator',
        pitch TEXT NOT NULL DEFAULT '',
        stage TEXT NOT NULL DEFAULT 'idea',
        universe_id TEXT,
        test_place_id TEXT,
        prod_place_id TEXT,
        idea_score INTEGER,
        kpis_json TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_key TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        depends_on_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        requires_review INTEGER NOT NULL DEFAULT 0,
        review_category TEXT,
        priority INTEGER NOT NULL DEFAULT 5,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2,
        parent_task_id TEXT,
        git_before_commit TEXT,
        git_after_commit TEXT,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        exit_code INTEGER,
        output_summary TEXT,
        error TEXT,
        revision_feedback TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_id, status);

      CREATE TABLE IF NOT EXISTS review_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT,
        agent_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attachments_json TEXT NOT NULL DEFAULT '[]',
        feedback TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_reviews_project ON review_items(project_id, status);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        role TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'Lead',
        content TEXT NOT NULL,
        delegated_task_ids_json TEXT NOT NULL DEFAULT '[]',
        explorer_refs_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id, created_at);

      CREATE TABLE IF NOT EXISTS agent_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_name TEXT,
        tokens_in INTEGER,
        tokens_out INTEGER,
        exit_code INTEGER,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_logs_project ON agent_logs(project_id, timestamp);

      CREATE TABLE IF NOT EXISTS competitor_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        place_id TEXT NOT NULL,
        universe_id TEXT NOT NULL,
        name TEXT NOT NULL,
        creator_name TEXT NOT NULL,
        playing INTEGER NOT NULL DEFAULT 0,
        visits INTEGER NOT NULL DEFAULT 0,
        favorited_count INTEGER NOT NULL DEFAULT 0,
        up_votes INTEGER NOT NULL DEFAULT 0,
        down_votes INTEGER NOT NULL DEFAULT 0,
        like_ratio REAL NOT NULL DEFAULT 0,
        icon_url TEXT,
        thumbnail_urls_json TEXT NOT NULL DEFAULT '[]',
        game_passes_json TEXT NOT NULL DEFAULT '[]',
        audit_score INTEGER,
        audit_summary TEXT,
        raw_payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // -------------------- Projects --------------------

  private mapProject(row: Record<string, unknown>): ProjectRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      genre: String(row.genre),
      pitch: String(row.pitch),
      stage: String(row.stage) as ProjectStage,
      universeId: row.universe_id ? String(row.universe_id) : null,
      testPlaceId: row.test_place_id ? String(row.test_place_id) : null,
      prodPlaceId: row.prod_place_id ? String(row.prod_place_id) : null,
      ideaScore: row.idea_score !== null && row.idea_score !== undefined ? Number(row.idea_score) : null,
      kpis: safeJsonParse<ProjectKpis>(row.kpis_json, { ...DEFAULT_KPIS }),
      workspacePath: String(row.workspace_path),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapProject(r));
  }

  public getProject(id: string): ProjectRecord | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapProject(row) : null;
  }

  public getProjectBySlug(slug: string): ProjectRecord | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;
    return row ? this.mapProject(row) : null;
  }

  public createProject(input: {
    name: string;
    slug: string;
    genre?: string;
    pitch?: string;
    stage?: ProjectStage;
    workspacePath: string;
    universeId?: string | null;
    kpis?: Partial<ProjectKpis>;
  }): ProjectRecord {
    const id = randomUUID();
    const ts = nowIso();
    const kpis: ProjectKpis = { ...DEFAULT_KPIS, ...(input.kpis || {}) };
    this.db
      .prepare(
        `INSERT INTO projects (id, name, slug, genre, pitch, stage, universe_id, test_place_id, prod_place_id, idea_score, kpis_json, workspace_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.slug,
        input.genre || 'Simulator',
        input.pitch || '',
        input.stage || 'idea',
        input.universeId || null,
        JSON.stringify(kpis),
        input.workspacePath,
        ts,
        ts
      );
    return this.getProject(id)!;
  }

  public updateProject(
    id: string,
    patch: Partial<{
      name: string;
      genre: string;
      pitch: string;
      stage: ProjectStage;
      universeId: string | null;
      testPlaceId: string | null;
      prodPlaceId: string | null;
      ideaScore: number | null;
      kpis: Partial<ProjectKpis>;
    }>
  ): ProjectRecord | null {
    const existing = this.getProject(id);
    if (!existing) return null;
    const nextKpis: ProjectKpis = patch.kpis ? { ...existing.kpis, ...patch.kpis } : existing.kpis;
    const ts = nowIso();
    this.db
      .prepare(
        `UPDATE projects SET
          name = ?, genre = ?, pitch = ?, stage = ?, universe_id = ?, test_place_id = ?, prod_place_id = ?,
          idea_score = ?, kpis_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        patch.name ?? existing.name,
        patch.genre ?? existing.genre,
        patch.pitch ?? existing.pitch,
        patch.stage ?? existing.stage,
        patch.universeId !== undefined ? patch.universeId : existing.universeId,
        patch.testPlaceId !== undefined ? patch.testPlaceId : existing.testPlaceId,
        patch.prodPlaceId !== undefined ? patch.prodPlaceId : existing.prodPlaceId,
        patch.ideaScore !== undefined ? patch.ideaScore : existing.ideaScore,
        JSON.stringify(nextKpis),
        ts,
        id
      );
    return this.getProject(id);
  }

  public deleteProject(id: string): boolean {
    const res = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  // -------------------- Tasks --------------------

  private mapTask(row: Record<string, unknown>): TaskRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      taskKey: String(row.task_key),
      title: String(row.title),
      description: String(row.description),
      agentId: String(row.agent_id),
      dependsOn: safeJsonParse<string[]>(row.depends_on_json, []),
      status: String(row.status) as TaskStatus,
      requiresReview: Number(row.requires_review) === 1,
      reviewCategory: row.review_category ? (String(row.review_category) as ReviewCategory) : null,
      priority: Number(row.priority),
      retryCount: Number(row.retry_count),
      maxRetries: Number(row.max_retries),
      parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
      gitBeforeCommit: row.git_before_commit ? String(row.git_before_commit) : null,
      gitAfterCommit: row.git_after_commit ? String(row.git_after_commit) : null,
      tokensIn: Number(row.tokens_in),
      tokensOut: Number(row.tokens_out),
      elapsedMs: Number(row.elapsed_ms),
      exitCode: row.exit_code !== null && row.exit_code !== undefined ? Number(row.exit_code) : null,
      outputSummary: row.output_summary ? String(row.output_summary) : null,
      error: row.error ? String(row.error) : null,
      revisionFeedback: row.revision_feedback ? String(row.revision_feedback) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public listTasks(projectId: string): TaskRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC, priority ASC')
      .all(projectId) as Record<string, unknown>[];
    return rows.map((r) => this.mapTask(r));
  }

  public getTask(id: string): TaskRecord | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapTask(row) : null;
  }

  public createTask(input: {
    projectId: string;
    taskKey: string;
    title: string;
    description: string;
    agentId: string;
    dependsOn?: string[];
    status?: TaskStatus;
    requiresReview?: boolean;
    reviewCategory?: ReviewCategory | null;
    priority?: number;
    maxRetries?: number;
    parentTaskId?: string | null;
  }): TaskRecord {
    const id = randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO tasks (
          id, project_id, task_key, title, description, agent_id, depends_on_json,
          status, requires_review, review_category, priority, retry_count, max_retries,
          parent_task_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        input.taskKey,
        input.title,
        input.description,
        input.agentId,
        JSON.stringify(input.dependsOn || []),
        input.status || 'pending',
        input.requiresReview ? 1 : 0,
        input.reviewCategory ?? null,
        input.priority ?? 5,
        input.maxRetries ?? 2,
        input.parentTaskId ?? null,
        ts,
        ts
      );
    return this.getTask(id)!;
  }

  public updateTask(
    id: string,
    patch: Partial<{
      status: TaskStatus;
      retryCount: number;
      gitBeforeCommit: string | null;
      gitAfterCommit: string | null;
      tokensIn: number;
      tokensOut: number;
      elapsedMs: number;
      exitCode: number | null;
      outputSummary: string | null;
      error: string | null;
      revisionFeedback: string | null;
      description: string;
    }>
  ): TaskRecord | null {
    const existing = this.getTask(id);
    if (!existing) return null;
    const ts = nowIso();
    this.db
      .prepare(
        `UPDATE tasks SET
          status = ?, retry_count = ?, git_before_commit = ?, git_after_commit = ?,
          tokens_in = ?, tokens_out = ?, elapsed_ms = ?, exit_code = ?,
          output_summary = ?, error = ?, revision_feedback = ?, description = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        patch.status ?? existing.status,
        patch.retryCount ?? existing.retryCount,
        patch.gitBeforeCommit !== undefined ? patch.gitBeforeCommit : existing.gitBeforeCommit,
        patch.gitAfterCommit !== undefined ? patch.gitAfterCommit : existing.gitAfterCommit,
        patch.tokensIn ?? existing.tokensIn,
        patch.tokensOut ?? existing.tokensOut,
        patch.elapsedMs ?? existing.elapsedMs,
        patch.exitCode !== undefined ? patch.exitCode : existing.exitCode,
        patch.outputSummary !== undefined ? patch.outputSummary : existing.outputSummary,
        patch.error !== undefined ? patch.error : existing.error,
        patch.revisionFeedback !== undefined ? patch.revisionFeedback : existing.revisionFeedback,
        patch.description ?? existing.description,
        ts,
        id
      );
    return this.getTask(id);
  }

  // -------------------- Review Queue --------------------

  private mapReview(row: Record<string, unknown>): ReviewItemRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      taskId: row.task_id ? String(row.task_id) : null,
      agentId: String(row.agent_id),
      category: String(row.category) as ReviewCategory,
      title: String(row.title),
      summary: String(row.summary),
      status: String(row.status) as ReviewStatus,
      attachments: safeJsonParse<ReviewAttachment[]>(row.attachments_json, []),
      feedback: row.feedback ? String(row.feedback) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public listReviews(projectId?: string, status?: ReviewStatus): ReviewItemRecord[] {
    if (projectId && status) {
      const rows = this.db
        .prepare('SELECT * FROM review_items WHERE project_id = ? AND status = ? ORDER BY created_at DESC')
        .all(projectId, status) as Record<string, unknown>[];
      return rows.map((r) => this.mapReview(r));
    }
    if (projectId) {
      const rows = this.db
        .prepare('SELECT * FROM review_items WHERE project_id = ? ORDER BY created_at DESC')
        .all(projectId) as Record<string, unknown>[];
      return rows.map((r) => this.mapReview(r));
    }
    const rows = this.db
      .prepare('SELECT * FROM review_items ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapReview(r));
  }

  public getReview(id: string): ReviewItemRecord | null {
    const row = this.db.prepare('SELECT * FROM review_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapReview(row) : null;
  }

  public createReview(input: {
    projectId: string;
    taskId?: string | null;
    agentId: string;
    category: ReviewCategory;
    title: string;
    summary: string;
    attachments?: ReviewAttachment[];
  }): ReviewItemRecord {
    const id = randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO review_items (id, project_id, task_id, agent_id, category, title, summary, status, attachments_json, feedback, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        input.taskId ?? null,
        input.agentId,
        input.category,
        input.title,
        input.summary,
        JSON.stringify(input.attachments || []),
        ts,
        ts
      );
    return this.getReview(id)!;
  }

  public updateReview(
    id: string,
    patch: { status: ReviewStatus; feedback?: string | null; attachments?: ReviewAttachment[] }
  ): ReviewItemRecord | null {
    const existing = this.getReview(id);
    if (!existing) return null;
    const ts = nowIso();
    this.db
      .prepare('UPDATE review_items SET status = ?, feedback = ?, attachments_json = ?, updated_at = ? WHERE id = ?')
      .run(
        patch.status,
        patch.feedback !== undefined ? patch.feedback : existing.feedback,
        JSON.stringify(patch.attachments ?? existing.attachments),
        ts,
        id
      );
    return this.getReview(id);
  }

  // -------------------- Chat Messages --------------------

  public listChatMessages(projectId: string, limit = 100): ChatMessageRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC LIMIT ?')
      .all(projectId, limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      role: String(r.role) as 'user' | 'assistant' | 'system',
      agentId: String(r.agent_id),
      content: String(r.content),
      delegatedTaskIds: safeJsonParse<string[]>(r.delegated_task_ids_json, []),
      explorerRefs: safeJsonParse<ExplorerRef[]>(r.explorer_refs_json, []),
      createdAt: String(r.created_at),
    }));
  }

  public addChatMessage(input: {
    projectId: string;
    role: 'user' | 'assistant' | 'system';
    agentId?: string;
    content: string;
    delegatedTaskIds?: string[];
    explorerRefs?: ExplorerRef[];
  }): ChatMessageRecord {
    const id = randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO chat_messages (id, project_id, role, agent_id, content, delegated_task_ids_json, explorer_refs_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        input.role,
        input.agentId || 'Lead',
        input.content,
        JSON.stringify(input.delegatedTaskIds || []),
        JSON.stringify(input.explorerRefs || []),
        ts
      );
    return {
      id,
      projectId: input.projectId,
      role: input.role,
      agentId: input.agentId || 'Lead',
      content: input.content,
      delegatedTaskIds: input.delegatedTaskIds || [],
      explorerRefs: input.explorerRefs || [],
      createdAt: ts,
    };
  }

  // -------------------- Agent Logs --------------------

  public appendAgentLog(event: AgentStreamEvent): void {
    this.db
      .prepare(
        `INSERT INTO agent_logs (id, project_id, task_id, agent_id, type, content, tool_name, tokens_in, tokens_out, exit_code, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.projectId,
        event.taskId,
        event.agentId,
        event.type,
        event.content.slice(0, 8000),
        event.toolName ?? null,
        event.tokensIn ?? null,
        event.tokensOut ?? null,
        event.exitCode ?? null,
        event.timestamp
      );
  }

  public listAgentLogs(projectId?: string, agentId?: string, limit = 200): AgentStreamEvent[] {
    let sql = 'SELECT * FROM agent_logs';
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (projectId) {
      clauses.push('project_id = ?');
      params.push(projectId);
    }
    if (agentId && agentId !== 'ALL') {
      clauses.push('agent_id = ?');
      params.push(agentId);
    }
    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ');
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.reverse().map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      taskId: r.task_id ? String(r.task_id) : null,
      agentId: String(r.agent_id),
      type: String(r.type) as AgentStreamEvent['type'],
      content: String(r.content),
      toolName: r.tool_name ? String(r.tool_name) : undefined,
      tokensIn: r.tokens_in !== null && r.tokens_in !== undefined ? Number(r.tokens_in) : undefined,
      tokensOut: r.tokens_out !== null && r.tokens_out !== undefined ? Number(r.tokens_out) : undefined,
      exitCode: r.exit_code !== null && r.exit_code !== undefined ? Number(r.exit_code) : undefined,
      timestamp: String(r.timestamp),
    }));
  }

  // -------------------- Competitor Snapshots --------------------

  public saveCompetitorSnapshot(input: Omit<CompetitorSnapshotRecord, 'id' | 'createdAt'>): CompetitorSnapshotRecord {
    const id = randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO competitor_snapshots (
          id, project_id, place_id, universe_id, name, creator_name,
          playing, visits, favorited_count, up_votes, down_votes, like_ratio,
          icon_url, thumbnail_urls_json, game_passes_json, audit_score, audit_summary, raw_payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        input.placeId,
        input.universeId,
        input.name,
        input.creatorName,
        input.playing,
        input.visits,
        input.favoritedCount,
        input.upVotes,
        input.downVotes,
        input.likeRatio,
        input.iconUrl,
        JSON.stringify(input.thumbnailUrls),
        JSON.stringify(input.gamePasses),
        input.auditScore,
        input.auditSummary,
        JSON.stringify(input.rawPayload ?? {}),
        ts
      );
    return { ...input, id, createdAt: ts };
  }

  public listCompetitorSnapshots(limit = 30): CompetitorSnapshotRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM competitor_snapshots ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      projectId: r.project_id ? String(r.project_id) : null,
      placeId: String(r.place_id),
      universeId: String(r.universe_id),
      name: String(r.name),
      creatorName: String(r.creator_name),
      playing: Number(r.playing),
      visits: Number(r.visits),
      favoritedCount: Number(r.favorited_count),
      upVotes: Number(r.up_votes),
      downVotes: Number(r.down_votes),
      likeRatio: Number(r.like_ratio),
      iconUrl: r.icon_url ? String(r.icon_url) : null,
      thumbnailUrls: safeJsonParse<string[]>(r.thumbnail_urls_json, []),
      gamePasses: safeJsonParse<Array<{ id: number; name: string; price: number | null }>>(r.game_passes_json, []),
      auditScore: r.audit_score !== null && r.audit_score !== undefined ? Number(r.audit_score) : null,
      auditSummary: r.audit_summary ? String(r.audit_summary) : null,
      rawPayload: safeJsonParse<unknown>(r.raw_payload_json, {}),
      createdAt: String(r.created_at),
    }));
  }

  // -------------------- Settings --------------------

  public getSettings(): StudioSettings {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get('studio_settings') as
      | { value_json: string }
      | undefined;
    if (!row) return { ...DEFAULT_STUDIO_SETTINGS };
    const stored = safeJsonParse<Partial<StudioSettings>>(row.value_json, {});
    return {
      ...DEFAULT_STUDIO_SETTINGS,
      ...stored,
      agentModelOverrides: {
        ...DEFAULT_STUDIO_SETTINGS.agentModelOverrides,
        ...(stored.agentModelOverrides || {}),
      },
    };
  }

  public updateSettings(patch: Partial<StudioSettings>): StudioSettings {
    const current = this.getSettings();
    const merged: StudioSettings = {
      ...current,
      ...patch,
      agentModelOverrides: patch.agentModelOverrides
        ? { ...current.agentModelOverrides, ...patch.agentModelOverrides }
        : current.agentModelOverrides,
    };
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('studio_settings', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(merged), ts);
    return merged;
  }
}

