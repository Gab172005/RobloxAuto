import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { StudioDatabase } from '../db/database.js';
import {
  DagPlanSchema,
  type AgentStreamEvent,
  type ChatMessageRecord,
  type DagPlan,
  type DagTaskInput,
  type ExplorerRef,
  type ProjectRecord,
  type ReviewAttachment,
  type ReviewCategory,
  type ReviewItemRecord,
  type TaskRecord,
} from '../types.js';
import type { GeminiRunner } from './geminiRunner.js';
import type { GitService } from './gitService.js';
import type { RegistryService } from './registryService.js';
import { scanWorkspaceSecurity } from './securityScanner.js';

export interface DagValidationResult {
  valid: boolean;
  sortedKeys: string[];
  errors: string[];
  cyclePath?: string[];
}

const BUILD_AGENTS = new Set(['Builder', 'Frame', 'Scenic', 'Merchant', 'AudioVFX', 'Librarian']);
const QA_AGENTS = new Set(['Playtest', 'KidTester', 'Reviewer']);

/**
 * Validates a DAG plan using Zod schema checks, unknown dependency detection,
 * agent existence checks, Kahn's topological sort, and DFS cycle path detection.
 */
export function validateDagPlan(
  rawPlan: unknown,
  validAgentIds: Set<string>,
  existingTaskKeys: Set<string> = new Set()
): { plan?: DagPlan; validation: DagValidationResult } {
  const parsed = DagPlanSchema.safeParse(rawPlan);
  if (!parsed.success) {
    return {
      validation: {
        valid: false,
        sortedKeys: [],
        errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
    };
  }

  const plan = parsed.data;
  const errors: string[] = [];
  const keySet = new Set<string>();
  const taskMap = new Map<string, DagTaskInput>();

  for (const t of plan.tasks) {
    if (keySet.has(t.key)) {
      errors.push(`Duplicate task key "${t.key}"`);
    }
    keySet.add(t.key);
    taskMap.set(t.key, t);

    if (!validAgentIds.has(t.agentId)) {
      errors.push(`Task "${t.key}" references unknown agentId "${t.agentId}"`);
    }
  }

  // Check dependencies exist
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const t of plan.tasks) {
    adjacency.set(t.key, []);
    inDegree.set(t.key, 0);
  }

  for (const t of plan.tasks) {
    for (const dep of t.dependsOn) {
      if (dep === t.key) {
        errors.push(`Self-dependency cycle detected on task "${t.key}"`);
        continue;
      }
      if (!keySet.has(dep) && !existingTaskKeys.has(dep)) {
        errors.push(`Task "${t.key}" depends on unknown task key "${dep}"`);
        continue;
      }
      if (keySet.has(dep)) {
        adjacency.get(dep)!.push(t.key);
        inDegree.set(t.key, (inDegree.get(t.key) || 0) + 1);
      }
    }
  }

  if (errors.length > 0) {
    return { plan, validation: { valid: false, sortedKeys: [], errors } };
  }

  // Kahn's algorithm for topological sort
  const queue: string[] = [];
  for (const [k, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(k);
  }

  const sortedKeys: string[] = [];
  while (queue.length > 0) {
    queue.sort((a, b) => (taskMap.get(a)?.priority ?? 5) - (taskMap.get(b)?.priority ?? 5));
    const current = queue.shift()!;
    sortedKeys.push(current);
    for (const neighbor of adjacency.get(current) || []) {
      const nextDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sortedKeys.length !== plan.tasks.length) {
    // Trace an explicit cycle path via DFS for clear diagnostics
    const visited = new Set<string>();
    const stack = new Set<string>();
    const pathTrace: string[] = [];
    let cyclePath: string[] | undefined;

    const dfs = (node: string): boolean => {
      visited.add(node);
      stack.add(node);
      pathTrace.push(node);
      for (const next of adjacency.get(node) || []) {
        if (!visited.has(next)) {
          if (dfs(next)) return true;
        } else if (stack.has(next)) {
          const startIdx = pathTrace.indexOf(next);
          cyclePath = [...pathTrace.slice(startIdx), next];
          return true;
        }
      }
      stack.delete(node);
      pathTrace.pop();
      return false;
    };

    for (const k of keySet) {
      if (!visited.has(k) && dfs(k)) break;
    }

    errors.push(
      `Dependency cycle detected${cyclePath ? `: ${cyclePath.join(' -> ')}` : ' in task graph'}`
    );
    return { plan, validation: { valid: false, sortedKeys: [], errors, cyclePath } };
  }

  return { plan, validation: { valid: true, sortedKeys, errors: [] } };
}

/**
 * Extracts the first fenced JSON block or top-level JSON object from Lead's response.
 */
export function extractJsonBlock(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export class StudioOrchestrator extends EventEmitter {
  private runningTaskIds = new Set<string>();
  private agentLiveStatus = new Map<string, { status: 'idle' | 'working' | 'review'; taskId?: string; taskTitle?: string }>();
  private qaTriggeredProjects = new Set<string>();

  constructor(
    private db: StudioDatabase,
    private registry: RegistryService,
    private gemini: GeminiRunner,
    private git: GitService
  ) {
    super();

    // Initialize status map for all 15 agents
    for (const agent of this.registry.listAgents()) {
      this.agentLiveStatus.set(agent.id, { status: 'idle' });
    }

    // Persist and forward Gemini CLI live events to WebSocket subscribers
    this.gemini.on('stream', (event: AgentStreamEvent) => {
      try {
        this.db.appendAgentLog(event);
      } catch {
        // Ignore transient log persistence errors
      }
      this.emit('ws', { type: 'agent_stream', payload: event });
    });
  }

  public getAgentStatuses(): Record<string, { status: 'idle' | 'working' | 'review'; taskId?: string; taskTitle?: string }> {
    const result: Record<string, { status: 'idle' | 'working' | 'review'; taskId?: string; taskTitle?: string }> = {};
    for (const agent of this.registry.listAgents()) {
      result[agent.id] = this.agentLiveStatus.get(agent.id) || { status: 'idle' };
    }
    return result;
  }

  private setAgentStatus(agentId: string, status: 'idle' | 'working' | 'review', task?: TaskRecord): void {
    this.agentLiveStatus.set(agentId, {
      status,
      taskId: task?.id,
      taskTitle: task?.title,
    });
    this.emit('ws', {
      type: 'agent_status',
      payload: { agentId, status, taskId: task?.id, taskTitle: task?.title },
    });
  }

  private broadcastTask(task: TaskRecord): void {
    this.emit('ws', { type: 'task_updated', payload: task });
  }

  private broadcastReview(review: ReviewItemRecord): void {
    this.emit('ws', { type: 'review_updated', payload: review });
  }

  /**
   * Enqueues a validated DAG plan into SQLite and immediately schedules all ready leaf tasks.
   */
  public enqueueDagPlan(projectId: string, rawPlan: unknown): { tasks: TaskRecord[]; validation: DagValidationResult } {
    const project = this.db.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const existingTasks = this.db.listTasks(projectId);
    const existingKeys = new Set(existingTasks.map((t) => t.taskKey));
    const validAgents = new Set(this.registry.listAgents().map((a) => a.id));

    const { plan, validation } = validateDagPlan(rawPlan, validAgents, existingKeys);
    if (!validation.valid || !plan) {
      throw new Error(`Invalid DAG plan: ${validation.errors.join('; ')}`);
    }

    const createdTasks: TaskRecord[] = [];
    const byKey = new Map(plan.tasks.map((t) => [t.key, t]));
    const settings = this.db.getSettings();

    // Ensure unique taskKey if re-running a pipeline on the same project
    const keyRemap = new Map<string, string>();
    for (const key of validation.sortedKeys) {
      let finalKey = key;
      let suffix = 2;
      while (existingKeys.has(finalKey)) {
        finalKey = `${key}_${suffix++}`;
      }
      keyRemap.set(key, finalKey);
      existingKeys.add(finalKey);
    }

    for (const key of validation.sortedKeys) {
      const def = byKey.get(key)!;
      const agentDef = this.registry.getAgent(def.agentId);
      const mappedDeps = def.dependsOn.map((d) => keyRemap.get(d) || d);
      const requiresReview =
        def.agentId === 'Publisher'
          ? true // Hard Safety Rule: Publisher ALWAYS pauses in Review Queue
          : def.requiresReview ?? agentDef.defaultRequiresReview;

      const task = this.db.createTask({
        projectId,
        taskKey: keyRemap.get(key)!,
        title: def.title,
        description: def.description,
        agentId: def.agentId,
        dependsOn: mappedDeps,
        status: 'pending',
        requiresReview,
        reviewCategory: def.reviewCategory ?? this.defaultReviewCategoryForAgent(def.agentId),
        priority: def.priority,
        maxRetries: settings.maxQaRetries,
      });
      createdTasks.push(task);
      this.broadcastTask(task);
    }

    // Move project out of 'idea' stage once engineering tasks are queued
    if (project.stage === 'idea' && createdTasks.some((t) => BUILD_AGENTS.has(t.agentId))) {
      const updated = this.db.updateProject(projectId, { stage: 'building' });
      if (updated) this.emit('ws', { type: 'project_updated', payload: updated });
    }

    this.qaTriggeredProjects.delete(projectId);
    void this.scheduleReadyTasks(projectId);

    return { tasks: createdTasks, validation };
  }

  private defaultReviewCategoryForAgent(agentId: string): ReviewCategory {
    switch (agentId) {
      case 'Pulse':
        return 'idea';
      case 'Architect':
        return 'gdd';
      case 'Merchant':
        return 'monetization';
      case 'Reviewer':
        return 'security';
      case 'Playtest':
        return 'playtest';
      case 'KidTester':
        return 'visual';
      case 'Splash':
        return 'promo';
      case 'Publisher':
        return 'publish';
      default:
        return 'visual';
    }
  }

  /**
   * Finds all pending tasks whose dependencies are satisfied and launches them up to maxParallelAgents.
   */
  public async scheduleReadyTasks(projectId: string): Promise<void> {
    const project = this.db.getProject(projectId);
    if (!project) return;

    const settings = this.db.getSettings();
    this.gemini.setMaxConcurrent(settings.maxParallelAgents);

    const allTasks = this.db.listTasks(projectId);
    const completedKeys = new Set(allTasks.filter((t) => t.status === 'completed').map((t) => t.taskKey));

    const ready = allTasks
      .filter(
        (t) =>
          (t.status === 'pending' || t.status === 'queued') &&
          !this.runningTaskIds.has(t.id) &&
          t.dependsOn.every((dep) => completedKeys.has(dep))
      )
      .sort((a, b) => a.priority - b.priority);

    const runningForProject = allTasks.filter((t) => t.status === 'running' || this.runningTaskIds.has(t.id)).length;
    const availableSlots = Math.max(0, settings.maxParallelAgents - runningForProject);

    for (const task of ready.slice(0, availableSlots)) {
      void this.executeTask(project, task);
    }

    // Check if all build tasks are complete and auto-QA loop should trigger
    if (ready.length === 0 && runningForProject === 0 && settings.autoQaLoop) {
      this.maybeTriggerAutoQaLoop(project, allTasks);
    }
  }

  private maybeTriggerAutoQaLoop(project: ProjectRecord, allTasks: TaskRecord[]): void {
    if (this.qaTriggeredProjects.has(project.id)) return;
    const buildTasks = allTasks.filter((t) => BUILD_AGENTS.has(t.agentId));
    const hasCompletedBuild = buildTasks.some((t) => t.status === 'completed');
    const anyBuildOpen = buildTasks.some((t) => ['pending', 'queued', 'running', 'awaiting_review'].includes(t.status));
    const hasQaAlready = allTasks.some((t) => QA_AGENTS.has(t.agentId));

    if (hasCompletedBuild && !anyBuildOpen && !hasQaAlready) {
      this.qaTriggeredProjects.add(project.id);
      const qaPlan: DagPlan = {
        summary: 'Automatic Post-Build Quality, Mobile UX & Security Audit Gate',
        tasks: [
          {
            key: 'auto_playtest_qa',
            title: 'Automated Studio QA & DataStore/Anti-Dupe Playtest',
            agentId: 'Playtest',
            description:
              'Run static --!strict checks, verify contracts.json alignment, test DataStore & anti-dupe logic, and write reports/playtest.json.',
            dependsOn: [],
            requiresReview: false,
            reviewCategory: 'playtest',
            priority: 2,
          },
          {
            key: 'auto_kidtester_ux',
            title: 'Multi-Device Mobile (667x375 & 844x390), PC & Gamepad Audit',
            agentId: 'KidTester',
            description:
              'Audit the critical first 120 seconds, mobile thumb zones, UI clipping/overlap, and gamepad navigation. Write reports/kid_tester.json.',
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'visual',
            priority: 2,
          },
          {
            key: 'auto_security_review',
            title: 'Independent Security, ProcessReceipt & Exploit Audit',
            agentId: 'Reviewer',
            description:
              'Audit all RemoteEvents, ProcessReceipt idempotency, DataStore session locking, and backdoors. Write reports/security_review.json.',
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'security',
            priority: 1,
          },
        ],
      };

      const updatedProject = this.db.updateProject(project.id, { stage: 'testing' });
      if (updatedProject) this.emit('ws', { type: 'project_updated', payload: updatedProject });
      this.enqueueDagPlan(project.id, qaPlan);
    }
  }

  private async executeTask(project: ProjectRecord, task: TaskRecord): Promise<void> {
    if (this.runningTaskIds.has(task.id)) return;
    this.runningTaskIds.add(task.id);

    const settings = this.db.getSettings();
    const agent = this.registry.getAgent(task.agentId);
    const model = this.registry.resolveModelForAgent(task.agentId, settings);

    let beforeCommit: string | null = null;
    try {
      const pre = await this.git.checkpoint(
        project.workspacePath,
        `checkpoint(pre): before [${task.agentId}] ${task.taskKey}`
      );
      beforeCommit = pre.hash;
    } catch {
      beforeCommit = await this.git.getHeadCommit(project.workspacePath);
    }

    const runningTask = this.db.updateTask(task.id, {
      status: 'running',
      gitBeforeCommit: beforeCommit,
      error: null,
    })!;
    this.broadcastTask(runningTask);
    this.setAgentStatus(task.agentId, 'working', runningTask);

    try {
      const { systemPrompt } = this.registry.buildAgentContextPrompt(task.agentId, project.workspacePath);

      const revisionSection = task.revisionFeedback
        ? `\n\n## HUMAN REVISION FEEDBACK (MUST ADDRESS FULLY)\n${task.revisionFeedback}\n`
        : '';

      // Inject deterministic workspace security scan results directly into Reviewer & Librarian context
      let staticScanSection = '';
      if (task.agentId === 'Reviewer' || task.agentId === 'Librarian' || task.agentId === 'Playtest') {
        const scan = scanWorkspaceSecurity(project.workspacePath);
        staticScanSection = `\n\n## AUTOMATED STATIC SECURITY SCAN SNAPSHOT\n\`\`\`json\n${JSON.stringify(scan, null, 2).slice(0, 6000)}\n\`\`\`\n`;
      }

      const fullPrompt = [
        systemPrompt,
        `\n---\n## ACTIVE TASK ASSIGNMENT`,
        `Project: ${project.name} (slug: ${project.slug}, genre: ${project.genre})`,
        `Workspace Root: ${project.workspacePath}`,
        `Task Key: ${task.taskKey}`,
        `Title: ${task.title}`,
        `\n### Instructions\n${task.description}`,
        revisionSection,
        staticScanSection,
        `\n### Completion Output\nPerform all file edits directly in this workspace. At the end, provide a concise Markdown summary of files created/modified and any Review Queue highlights.`,
      ].join('\n');

      const result = await this.gemini.run({
        runId: task.id,
        projectId: project.id,
        taskId: task.id,
        agentId: task.agentId,
        cwd: project.workspacePath,
        prompt: fullPrompt,
        model,
        approvalMode: agent.approvalMode,
        allowedMcpServers: agent.allowedMcpServers,
        timeoutMs: settings.taskTimeoutMs,
        maxRetries: 1,
        dryRun: settings.dryRunMode,
      });

      const post = await this.git.checkpoint(
        project.workspacePath,
        `feat(${task.agentId.toLowerCase()}): ${task.title} [${task.taskKey}]`
      );

      if (!result.success) {
        const failed = this.db.updateTask(task.id, {
          status: 'failed',
          gitAfterCommit: post.hash,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          elapsedMs: result.elapsedMs,
          exitCode: result.exitCode,
          outputSummary: result.outputText.slice(0, 4000) || null,
          error: result.error || 'Agent execution failed',
        })!;
        this.broadcastTask(failed);
        this.setAgentStatus(task.agentId, 'idle');
        return;
      }

      // Self-Healing QA/Security Loop inspection
      if (QA_AGENTS.has(task.agentId)) {
        this.processQaFindingsAndSpawnFixes(project, runningTask, settings.maxQaRetries);
      }

      // Human-in-the-loop Review Gate
      if (task.requiresReview) {
        const attachments = await this.collectReviewAttachments(project, runningTask, beforeCommit, post.hash);
        const awaiting = this.db.updateTask(task.id, {
          status: 'awaiting_review',
          gitAfterCommit: post.hash,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          elapsedMs: result.elapsedMs,
          exitCode: result.exitCode,
          outputSummary: result.outputText.slice(0, 6000) || 'Completed — awaiting review.',
        })!;
        this.broadcastTask(awaiting);
        this.setAgentStatus(task.agentId, 'review', awaiting);

        const review = this.db.createReview({
          projectId: project.id,
          taskId: task.id,
          agentId: task.agentId,
          category: task.reviewCategory || this.defaultReviewCategoryForAgent(task.agentId),
          title: `[${task.agentId}] ${task.title}`,
          summary: result.outputText.slice(0, 2000) || 'Ready for human approval.',
          attachments,
        });
        this.broadcastReview(review);
      } else {
        const completed = this.db.updateTask(task.id, {
          status: 'completed',
          gitAfterCommit: post.hash,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          elapsedMs: result.elapsedMs,
          exitCode: result.exitCode,
          outputSummary: result.outputText.slice(0, 6000) || 'Completed successfully.',
        })!;
        this.broadcastTask(completed);
        this.setAgentStatus(task.agentId, 'idle');
      }
    } catch (err) {
      const failed = this.db.updateTask(task.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })!;
      this.broadcastTask(failed);
      this.setAgentStatus(task.agentId, 'idle');
    } finally {
      this.runningTaskIds.delete(task.id);
      void this.scheduleReadyTasks(project.id);
    }
  }

  /**
   * Inspects QA/Security reports generated by Playtest, KidTester, or Reviewer.
   * Any CRITICAL or HIGH finding automatically spawns fix tasks routed to ownerAgent up to maxRetries.
   */
  private processQaFindingsAndSpawnFixes(project: ProjectRecord, qaTask: TaskRecord, maxRetries: number): void {
    const reportMap: Record<string, string> = {
      Playtest: 'reports/playtest.json',
      KidTester: 'reports/kid_tester.json',
      Reviewer: 'reports/security_review.json',
    };
    const relReport = reportMap[qaTask.agentId];
    if (!relReport) return;

    const fullPath = path.join(project.workspacePath, relReport);
    if (!fs.existsSync(fullPath)) return;

    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as {
        findings?: Array<{
          id?: string;
          severity?: string;
          ownerAgent?: string;
          file?: string;
          title?: string;
          details?: string;
          remediation?: string;
        }>;
      };

      const blocking = (parsed.findings || []).filter(
        (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
      );
      if (blocking.length === 0 || qaTask.retryCount >= maxRetries) return;

      const byOwner = new Map<string, typeof blocking>();
      const validAgents = new Set(this.registry.listAgents().map((a) => a.id));

      for (const finding of blocking) {
        const owner = finding.ownerAgent && validAgents.has(finding.ownerAgent) ? finding.ownerAgent : 'Builder';
        const list = byOwner.get(owner) || [];
        list.push(finding);
        byOwner.set(owner, list);
      }

      const fixKeys: string[] = [];
      for (const [ownerAgent, findings] of byOwner.entries()) {
        const fixKey = `fix_${qaTask.agentId.toLowerCase()}_${ownerAgent.toLowerCase()}_r${qaTask.retryCount + 1}`;
        fixKeys.push(fixKey);
        const bulletList = findings
          .map(
            (f) =>
              `- [${f.severity}] ${f.title || f.id} (${f.file || 'workspace'}): ${f.remediation || f.details || 'Fix defect'}`
          )
          .join('\n');

        const fixTask = this.db.createTask({
          projectId: project.id,
          taskKey: fixKey,
          title: `Auto-Fix ${findings.length} ${qaTask.agentId} finding(s) (${ownerAgent})`,
          description: `Self-Healing QA Loop triggered by ${qaTask.agentId} (${relReport}). Resolve ALL blocking issues:\n\n${bulletList}`,
          agentId: ownerAgent,
          dependsOn: [],
          requiresReview: false,
          priority: 1,
          parentTaskId: qaTask.id,
          maxRetries,
        });
        this.broadcastTask(fixTask);
      }

      // Schedule re-verification task after fixes complete
      const recheck = this.db.createTask({
        projectId: project.id,
        taskKey: `reverify_${qaTask.agentId.toLowerCase()}_r${qaTask.retryCount + 1}`,
        title: `Re-Verify ${qaTask.agentId} Gate (Pass #${qaTask.retryCount + 2})`,
        description: `Re-run ${qaTask.agentId} audit after auto-fix tasks (${fixKeys.join(', ')}) and update ${relReport}.`,
        agentId: qaTask.agentId,
        dependsOn: fixKeys,
        requiresReview: qaTask.requiresReview,
        reviewCategory: qaTask.reviewCategory,
        priority: 1,
        parentTaskId: qaTask.id,
        maxRetries,
      });
      this.db.updateTask(recheck.id, { retryCount: qaTask.retryCount + 1 });
      this.broadcastTask(recheck);
    } catch {
      // Malformed report JSON will still be surfaced in Review Queue
    }
  }

  private async collectReviewAttachments(
    project: ProjectRecord,
    task: TaskRecord,
    beforeCommit: string | null,
    afterCommit: string | null
  ): Promise<ReviewAttachment[]> {
    const attachments: ReviewAttachment[] = [];

    // Attach git diff when commits differ
    if (beforeCommit && afterCommit && beforeCommit !== afterCommit) {
      const diff = await this.git.getDiff(project.workspacePath, beforeCommit, afterCommit);
      if (diff.trim()) {
        attachments.push({
          type: 'diff',
          label: `Git Diff (${beforeCommit.slice(0, 7)}..${afterCommit.slice(0, 7)})`,
          content: diff.slice(0, 18000),
        });
      }
    }

    // Attach known domain artifacts if present
    const candidateFiles: Array<{ rel: string; type: ReviewAttachment['type']; label: string }> = [
      { rel: 'docs/market_brief.md', type: 'markdown', label: 'Market Brief & Idea Scorecard' },
      { rel: 'docs/GDD.md', type: 'markdown', label: 'Game Design Document (GDD)' },
      { rel: 'docs/contracts.json', type: 'json', label: 'Technical Contract (contracts.json)' },
      { rel: 'docs/monetization.md', type: 'markdown', label: 'Monetization Ladder & Economy Spec' },
      { rel: 'reports/playtest.json', type: 'json', label: 'Playtest QA Report' },
      { rel: 'reports/kid_tester.json', type: 'json', label: 'KidTester Multi-Device Report' },
      { rel: 'reports/security_review.json', type: 'json', label: 'Security & Exploit Audit' },
      { rel: 'reports/release_checklist.md', type: 'markdown', label: 'Staged Release Checklist' },
      { rel: 'art/store_page.md', type: 'markdown', label: 'Store Copy & Thumbnail A/B Pack' },
      { rel: 'art/promo_scripts.md', type: 'markdown', label: 'TikTok / Shorts Promo Scripts' },
    ];

    for (const c of candidateFiles) {
      const full = path.join(project.workspacePath, c.rel);
      if (fs.existsSync(full)) {
        attachments.push({
          type: c.type,
          label: c.label,
          path: c.rel,
          content: fs.readFileSync(full, 'utf8').slice(0, 14000),
        });
      }
    }

    // Attach media/images from art/ and media/
    for (const folder of ['art', 'media']) {
      const dir = path.join(project.workspacePath, folder);
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        const lower = entry.toLowerCase();
        if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
          attachments.push({
            type: 'image',
            label: `${folder}/${entry}`,
            path: `${folder}/${entry}`,
            url: `/api/projects/${project.id}/media/${folder}/${encodeURIComponent(entry)}`,
          });
        } else if (lower.endsWith('.mp4') || lower.endsWith('.webm')) {
          attachments.push({
            type: 'video',
            label: `${folder}/${entry}`,
            path: `${folder}/${entry}`,
            url: `/api/projects/${project.id}/media/${folder}/${encodeURIComponent(entry)}`,
          });
        }
      }
    }

    return attachments;
  }

  /**
   * Human approves a Review Queue item -> marks linked task completed & unblocks downstream DAG tasks!
   */
  public approveReview(reviewId: string, notes?: string): { review: ReviewItemRecord; task: TaskRecord | null } {
    const existing = this.db.getReview(reviewId);
    if (!existing) throw new Error(`Review item not found: ${reviewId}`);

    const updatedReview = this.db.updateReview(reviewId, {
      status: 'approved',
      feedback: notes ?? existing.feedback,
    })!;
    this.broadcastReview(updatedReview);

    let updatedTask: TaskRecord | null = null;
    if (existing.taskId) {
      updatedTask = this.db.updateTask(existing.taskId, { status: 'completed' });
      if (updatedTask) {
        this.broadcastTask(updatedTask);
        this.setAgentStatus(updatedTask.agentId, 'idle');
      }
    }

    void this.scheduleReadyTasks(existing.projectId);
    return { review: updatedReview, task: updatedTask };
  }

  /**
   * Human requests changes with feedback -> re-queues the linked task with revision notes injected!
   */
  public requestReviewChanges(
    reviewId: string,
    feedback: string
  ): { review: ReviewItemRecord; task: TaskRecord | null } {
    const existing = this.db.getReview(reviewId);
    if (!existing) throw new Error(`Review item not found: ${reviewId}`);

    const updatedReview = this.db.updateReview(reviewId, {
      status: 'changes_requested',
      feedback,
    })!;
    this.broadcastReview(updatedReview);

    let updatedTask: TaskRecord | null = null;
    if (existing.taskId) {
      const task = this.db.getTask(existing.taskId);
      if (task) {
        updatedTask = this.db.updateTask(task.id, {
          status: 'pending',
          revisionFeedback: feedback,
          retryCount: task.retryCount + 1,
        });
        if (updatedTask) {
          this.broadcastTask(updatedTask);
          this.setAgentStatus(updatedTask.agentId, 'idle');
        }
      }
    }

    void this.scheduleReadyTasks(existing.projectId);
    return { review: updatedReview, task: updatedTask };
  }

  /**
   * 1-click Git rollback for a specific task back to its pre-task checkpoint.
   */
  public async rollbackTask(taskId: string): Promise<{ task: TaskRecord; restoredCommit: string }> {
    const task = this.db.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.gitBeforeCommit) {
      throw new Error('Task has no recorded pre-task Git checkpoint commit');
    }
    const project = this.db.getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const { restoredFrom } = await this.git.rollbackToCommit(
      project.workspacePath,
      task.gitBeforeCommit,
      `task ${task.taskKey}`
    );

    const updated = this.db.updateTask(taskId, {
      status: 'rolled_back',
      outputSummary: `Rolled back workspace to pre-task commit ${restoredFrom.slice(0, 7)}.`,
    })!;
    this.broadcastTask(updated);
    return { task: updated, restoredCommit: restoredFrom };
  }

  public cancelTask(taskId: string): TaskRecord | null {
    this.gemini.cancelRun(taskId);
    this.runningTaskIds.delete(taskId);
    const updated = this.db.updateTask(taskId, {
      status: 'cancelled',
      error: 'Cancelled by user',
    });
    if (updated) {
      this.broadcastTask(updated);
      this.setAgentStatus(updated.agentId, 'idle');
    }
    return updated;
  }

  /**
   * Primary Conversational Lead Interface:
   * Sends user message + Explorer object refs + recent history to Lead.
   * If Lead outputs a JSON Task Graph, validates it (with automatic JSON repair retry if malformed)
   * and immediately dispatches it to the parallel worker pool!
   */
  public async chatWithLead(input: {
    projectId: string;
    message: string;
    explorerRefs?: ExplorerRef[];
  }): Promise<{ userMessage: ChatMessageRecord; leadMessage: ChatMessageRecord; spawnedTasks: TaskRecord[] }> {
    const project = this.db.getProject(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    const userMessage = this.db.addChatMessage({
      projectId: project.id,
      role: 'user',
      agentId: 'User',
      content: input.message,
      explorerRefs: input.explorerRefs || [],
    });
    this.emit('ws', { type: 'chat_message', payload: userMessage });

    const settings = this.db.getSettings();
    const leadAgent = this.registry.getAgent('Lead');
    const model = this.registry.resolveModelForAgent('Lead', settings);
    const { systemPrompt } = this.registry.buildAgentContextPrompt('Lead', project.workspacePath);

    const history = this.db.listChatMessages(project.id, 12);
    const historyBlock = history
      .map((m) => `[${m.role === 'user' ? 'Studio Owner' : m.agentId}]: ${m.content}`)
      .join('\n\n');

    const refsBlock =
      input.explorerRefs && input.explorerRefs.length > 0
        ? `\n## REFERENCED STUDIO EXPLORER OBJECTS\n${input.explorerRefs
            .map((r) => `- ${r.robloxPath} (${r.className}) -> file: ${r.path}`)
            .join('\n')}\n`
        : '';

    const currentTasks = this.db.listTasks(project.id);
    const taskStateBlock =
      currentTasks.length > 0
        ? `\n## EXISTING PROJECT TASKS (${currentTasks.length})\n${currentTasks
            .slice(-15)
            .map((t) => `- [${t.status}] ${t.taskKey} (${t.agentId}): ${t.title}`)
            .join('\n')}\n`
        : '';

    const leadPrompt = [
      systemPrompt,
      `\n---\n## ACTIVE PROJECT\nName: ${project.name} | Slug: ${project.slug} | Genre: ${project.genre} | Stage: ${project.stage}\nPitch: ${project.pitch || '(Not defined yet)'}`,
      refsBlock,
      taskStateBlock,
      `\n## RECENT CONVERSATION\n${historyBlock}`,
      `\nRespond to the Studio Owner's latest message. If execution work is requested, include a valid fenced \`\`\`json DAG task graph.`,
    ].join('\n');

    this.setAgentStatus('Lead', 'working');
    let runRes = await this.gemini.run({
      projectId: project.id,
      taskId: null,
      agentId: 'Lead',
      cwd: project.workspacePath,
      prompt: leadPrompt,
      model,
      approvalMode: leadAgent.approvalMode,
      timeoutMs: settings.taskTimeoutMs,
      dryRun: settings.dryRunMode,
    });
    this.setAgentStatus('Lead', 'idle');

    let responseText = runRes.outputText.trim();
    if (!runRes.success && !responseText) {
      responseText = `Lead encountered an issue executing Gemini CLI: ${runRes.error || 'Unknown error'}. Check Gemini CLI login status in the Bridge Status Bar or enable Dry-Run Mode in Settings to test the pipeline.`;
    }

    let spawnedTasks: TaskRecord[] = [];
    const extracted = extractJsonBlock(responseText);
    if (extracted) {
      const validAgents = new Set(this.registry.listAgents().map((a) => a.id));
      const existingKeys = new Set(currentTasks.map((t) => t.taskKey));
      let check = validateDagPlan(extracted, validAgents, existingKeys);

      // Automatic JSON repair retry if Lead emitted a malformed or cyclic DAG
      if (!check.validation.valid && !settings.dryRunMode) {
        const repairPrompt = `Your previous JSON task graph failed strict validation with these errors:\n- ${check.validation.errors.join(
          '\n- '
        )}\n\nValid agentIds: ${Array.from(validAgents).join(
          ', '
        )}\n\nReturn ONLY a corrected fenced \`\`\`json block matching the exact DAG schema with zero cycles and valid dependencies.`;
        runRes = await this.gemini.run({
          projectId: project.id,
          taskId: null,
          agentId: 'Lead',
          cwd: project.workspacePath,
          prompt: repairPrompt,
          model,
          approvalMode: 'plan',
          timeoutMs: 90_000,
          maxRetries: 0,
        });
        const repairedJson = extractJsonBlock(runRes.outputText);
        if (repairedJson) {
          check = validateDagPlan(repairedJson, validAgents, existingKeys);
          if (check.validation.valid) {
            responseText += `\n\n*(Auto-repaired DAG task graph successfully)*`;
          }
        }
      }

      if (check.validation.valid && check.plan) {
        const enqueued = this.enqueueDagPlan(project.id, check.plan);
        spawnedTasks = enqueued.tasks;
      } else {
        responseText += `\n\n> **DAG Validation Notice**: Could not auto-dispatch task graph (${check.validation.errors.join('; ')}).`;
      }
    }

    const leadMessage = this.db.addChatMessage({
      projectId: project.id,
      role: 'assistant',
      agentId: 'Lead',
      content: responseText,
      delegatedTaskIds: spawnedTasks.map((t) => t.id),
    });
    this.emit('ws', { type: 'chat_message', payload: leadMessage });

    return { userMessage, leadMessage, spawnedTasks };
  }
}

