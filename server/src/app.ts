import cors from 'cors';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CLIENT_ORIGIN,
  ensureRuntimeDirectories,
  ROOT_DIR,
  updateLocalEnvKeys,
} from './config.js';
import { StudioDatabase } from './db/database.js';
import { GeminiRunner } from './services/geminiRunner.js';
import { GitService, slugifyProjectName } from './services/gitService.js';
import { MarketService, simulateRevenue } from './services/marketService.js';
import { MediaService } from './services/mediaService.js';
import { StudioOrchestrator } from './services/orchestrator.js';
import { RegistryService } from './services/registryService.js';
import { RobloxBridgeService } from './services/robloxBridge.js';
import { sanitizeRbxmxXml, scanWorkspaceSecurity } from './services/securityScanner.js';
import type { DagPlan } from './types.js';

export interface RoForgeRuntime {
  app: express.Express;
  server: http.Server;
  wss: WebSocketServer;
  db: StudioDatabase;
  registry: RegistryService;
  gemini: GeminiRunner;
  git: GitService;
  bridge: RobloxBridgeService;
  orchestrator: StudioOrchestrator;
  market: MarketService;
  media: MediaService;
}

function listWorkspaceFilesFlat(workspacePath: string): Array<{ path: string; size: number; modifiedAt: string }> {
  const files: Array<{ path: string; size: number; modifiedAt: string }> = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const stat = fs.statSync(full);
        files.push({
          path: path.relative(workspacePath, full).replace(/\\/g, '/'),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  };
  walk(workspacePath);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function resolveWorkspaceFileSafe(workspacePath: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.resolve(workspacePath, normalized);
  const base = path.resolve(workspacePath);
  if (!full.startsWith(base)) {
    throw new Error('Path traversal rejected');
  }
  return full;
}

function buildQuickPipelinePlan(templateId: string, projectName: string, genre: string): DagPlan {
  switch (templateId) {
    case 'full_game_factory':
      return {
        summary: `Full End-to-End Game Factory Pipeline for ${projectName} (${genre})`,
        tasks: [
          {
            key: 'market_pitch_score',
            title: 'Validate Niche, Competitor Benchmarks & 0–100 Idea Scorecard',
            agentId: 'Pulse',
            description: `Research rising ${genre} hooks, produce docs/market_brief.md & reports/idea_score.json with target 3-tier Robux pricing ladder and viral clip hook for ${projectName}.`,
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'idea',
            priority: 1,
          },
          {
            key: 'design_gdd_contracts',
            title: 'Write Complete GDD & Machine-Readable Technical Contract',
            agentId: 'Architect',
            description: `Author docs/GDD.md (including second-by-second first-120s onboarding) and strict docs/contracts.json (RemoteEvents, DataStore schema, AnalyticsService funnel, ConfigService A/B keys) for ${projectName}.`,
            dependsOn: ['market_pitch_score'],
            requiresReview: true,
            reviewCategory: 'gdd',
            priority: 1,
          },
          {
            key: 'build_core_server',
            title: 'Implement Core Loop, Crash-Safe DataStores & Analytics Telemetry',
            agentId: 'Builder',
            description:
              'Implement --!strict Luau server gameplay loop, session-locked DataStoreProfileManager, BindToClose, RemoteRateLimiter, 7-day DailyRewardSystem, and AnalyticsService onboarding/economy events matching docs/contracts.json.',
            dependsOn: ['design_gdd_contracts'],
            requiresReview: false,
            priority: 2,
          },
          {
            key: 'build_mobile_ui',
            title: 'Build Mobile-First HUD, Shop, Daily Streak & Starter Pack UI',
            agentId: 'Frame',
            description:
              'Create procedural --!strict Luau UI in src/client/ui/ engineered for 667x375 & 844x390 phones, 44px+ touch targets, CoreUISafeInsets, TweenService polish, and gamepad navigation.',
            dependsOn: ['design_gdd_contracts'],
            requiresReview: false,
            priority: 2,
          },
          {
            key: 'build_world_scenic',
            title: 'Construct Procedural 3D World, Spawn Sightlines & Lighting Mood',
            agentId: 'Scenic',
            description:
              'Build deterministic procedural world scripts in src/server/world/ (and Studio MCP enhancements if connected) matching worldLandmarks in docs/contracts.json within mobile GPU budgets.',
            dependsOn: ['design_gdd_contracts'],
            requiresReview: false,
            priority: 2,
          },
          {
            key: 'build_monetization',
            title: 'Engineer 3-Tier Robux Ladder, ShopConfig & Idempotent ProcessReceipt',
            agentId: 'Merchant',
            description:
              'Write docs/monetization.md, src/shared/ShopConfig.luau, and src/server/MonetizationServer.server.luau (Starter Pack, Auto-Collect/VIP Passes, Server-Wide Boosts, Gifting). Do NOT invoke live Open Cloud provisioning until approved.',
            dependsOn: ['design_gdd_contracts'],
            requiresReview: true,
            reviewCategory: 'monetization',
            priority: 2,
          },
          {
            key: 'add_audio_vfx_juice',
            title: 'Add Tactile SFX Pooling, Particle Bursts, Popups & Camera Juice',
            agentId: 'AudioVFX',
            description:
              'Create src/shared/AudioConfig.luau and src/client/vfx/ modules wired to contracts.json reward/upgrade/server-event hooks with reduced-motion and mute support.',
            dependsOn: ['build_core_server'],
            requiresReview: false,
            priority: 3,
          },
          {
            key: 'launch_art_and_promos',
            title: 'Generate SEO Store Copy, 3 A/B Thumbnail Specs & TikTok Promo Scripts',
            agentId: 'Splash',
            description:
              'Write art/store_page.md (3 titles, store copy, icon + 3 distinct 16:9 thumbnail A/B specs) and art/promo_scripts.md (3 viral 9:16 TikTok/Shorts scripts).',
            dependsOn: ['build_world_scenic', 'build_monetization'],
            requiresReview: true,
            reviewCategory: 'promo',
            priority: 4,
          },
        ],
      };

    case 'qa_security_audit':
      return {
        summary: `Full QA, Multi-Device UX & Exploit Security Audit for ${projectName}`,
        tasks: [
          {
            key: 'qa_playtest_pass',
            title: 'Automated Studio QA, DataStore & Anti-Dupe Playtest',
            agentId: 'Playtest',
            description:
              'Audit all Luau scripts for --!strict compliance, contract fidelity, DataStore persistence, spawn safety, and reward anti-duplication. Write reports/playtest.json.',
            dependsOn: [],
            requiresReview: false,
            reviewCategory: 'playtest',
            priority: 1,
          },
          {
            key: 'qa_mobile_kidtester',
            title: 'First-120s Mobile (667x375 & 844x390), PC & Gamepad Audit',
            agentId: 'KidTester',
            description:
              'Inspect first-time onboarding speed, thumb ergonomics, safe areas, and modal scaling across 667x375, 844x390, PC, and Gamepad. Write reports/kid_tester.json.',
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'visual',
            priority: 1,
          },
          {
            key: 'qa_security_reviewer',
            title: 'Independent Security, RemoteEvent & ProcessReceipt Audit',
            agentId: 'Reviewer',
            description:
              'Audit every script for RemoteEvent validation, rate limits, ProcessReceipt idempotency, DataStore race conditions, and backdoors. Write reports/security_review.json.',
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'security',
            priority: 1,
          },
        ],
      };

    case 'monetization_upgrade':
      return {
        summary: `3-Tier Monetization Shop & UI Upgrade for ${projectName}`,
        tasks: [
          {
            key: 'monetization_ladder_spec',
            title: 'Design 3-Tier Robux Pricing Ladder & Idempotent MonetizationServer',
            agentId: 'Merchant',
            description:
              'Create/upgrade docs/monetization.md, src/shared/ShopConfig.luau, and src/server/MonetizationServer.server.luau with Starter Pack (99 R$), Permanent Passes, Server-Wide Boosts, and Friend Gifting.',
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'monetization',
            priority: 1,
          },
          {
            key: 'monetization_shop_ui',
            title: 'Wire Mobile-First Shop Modal, Starter Pack Timer & Gift Selector UI',
            agentId: 'Frame',
            description:
              'Build responsive phone-first shop UI in src/client/ui/ reading ShopConfig.luau with live MarketplaceService price lookup, 44px+ buttons, and gamepad support.',
            dependsOn: ['monetization_ladder_spec'],
            requiresReview: false,
            priority: 2,
          },
        ],
      };

    case 'launch_pack':
      return {
        summary: `Launch Packaging, TikTok Promos & Staged Release Gate for ${projectName}`,
        tasks: [
          {
            key: 'splash_launch_pack',
            title: 'Create Store Copy, Icon/Thumbnail A/B Variants & 9:16 Promo Scripts',
            agentId: 'Splash',
            description:
              'Produce art/store_page.md and art/promo_scripts.md optimized for Roblox Home CTR and viral TikTok/Reels/Shorts clips.',
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'promo',
            priority: 1,
          },
          {
            key: 'publisher_release_gate',
            title: 'Prepare Staged Test-Place -> Production Release Packet',
            agentId: 'Publisher',
            description:
              'Verify security_review.json, playtest.json, kid_tester.json, and live ShopConfig IDs. Produce reports/release_checklist.md & docs/CHANGELOG.md. Do NOT publish live without Review Queue approval.',
            dependsOn: ['splash_launch_pack'],
            requiresReview: true,
            reviewCategory: 'publish',
            priority: 2,
          },
        ],
      };

    default:
      throw new Error(`Unknown quick pipeline template: ${templateId}`);
  }
}

export function createRoForgeRuntime(dbPath?: string): RoForgeRuntime {
  ensureRuntimeDirectories();
  const db = new StudioDatabase(dbPath);
  const registry = new RegistryService();
  const gemini = new GeminiRunner();
  const git = new GitService();
  const bridge = new RobloxBridgeService();
  const orchestrator = new StudioOrchestrator(db, registry, gemini, git);
  const market = new MarketService(db, registry, gemini);
  const media = new MediaService(db);

  const app = express();
  app.use(cors({ origin: [CLIENT_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4310', 'http://127.0.0.1:4310'], credentials: true }));
  app.use(express.json({ limit: '25mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastWs = (message: { type: string; payload: unknown }) => {
    const serialized = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };

  orchestrator.on('ws', (msg: { type: string; payload: unknown }) => broadcastWs(msg));
  bridge.on('rojo_status', (status: unknown) => broadcastWs({ type: 'rojo_status', payload: status }));

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'hello',
        payload: {
          studio: 'RoForge Studio',
          agentStatuses: orchestrator.getAgentStatuses(),
          rojoStatus: bridge.getRojoStatus(),
          timestamp: new Date().toISOString(),
        },
      })
    );
  });

  // Helper wrapper for clean async JSON error responses
  const handle =
    (fn: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: message });
      }
    };

  // -------------------- Health & Bridge Diagnostics --------------------

  app.get(
    '/api/health',
    handle((_req, res) => {
      const integrity = registry.verifyIntegrity();
      res.json({
        status: 'ok',
        studio: 'RoForge Studio',
        integrity,
        activeGeminiRuns: gemini.getActiveRunIds().length,
      });
    })
  );

  app.get(
    '/api/bridge/diagnostics',
    handle(async (_req, res) => {
      const diagnostics = await bridge.getDiagnostics();
      res.json(diagnostics);
    })
  );

  app.post(
    '/api/bridge/mcp/preview',
    handle((req, res) => {
      const { includeBlender, robloxStudioCommand } = req.body || {};
      res.json(bridge.generateMcpConfigSnippet({ includeBlender: Boolean(includeBlender), robloxStudioCommand }));
    })
  );

  app.post(
    '/api/bridge/mcp/apply',
    handle((req, res) => {
      const { includeBlender, robloxStudioUrl, robloxStudioCommand, robloxStudioArgs } = req.body || {};
      const result = bridge.applyMcpConfigToGeminiSettings({
        includeBlender: Boolean(includeBlender),
        robloxStudioUrl,
        robloxStudioCommand,
        robloxStudioArgs,
      });
      res.json(result);
    })
  );

  app.get(
    '/api/bridge/rojo/status',
    handle((_req, res) => {
      res.json(bridge.getRojoStatus());
    })
  );

  app.post(
    '/api/bridge/rojo/start',
    handle(async (req, res) => {
      const { projectId, port } = req.body || {};
      const project = db.getProject(String(projectId || ''));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const status = await bridge.startRojoServe(project.workspacePath, project.slug, Number(port || 34872));
      res.json(status);
    })
  );

  app.post(
    '/api/bridge/rojo/stop',
    handle((_req, res) => {
      res.json(bridge.stopRojoServe());
    })
  );

  // -------------------- Projects --------------------

  app.get(
    '/api/projects',
    handle((_req, res) => {
      res.json({ projects: db.listProjects() });
    })
  );

  app.post(
    '/api/projects',
    handle(async (req, res) => {
      const { name, genre, pitch, universeId } = req.body || {};
      if (!name || String(name).trim().length < 2) {
        res.status(400).json({ error: 'Project name must be at least 2 characters.' });
        return;
      }
      let slug = slugifyProjectName(String(name));
      let suffix = 2;
      while (db.getProjectBySlug(slug)) {
        slug = `${slugifyProjectName(String(name))}-${suffix++}`;
      }
      const workspacePath = await git.initProjectWorkspace(String(name).trim(), slug);
      const project = db.createProject({
        name: String(name).trim(),
        slug,
        genre: genre ? String(genre) : 'Simulator',
        pitch: pitch ? String(pitch) : '',
        universeId: universeId ? String(universeId) : null,
        workspacePath,
      });
      broadcastWs({ type: 'project_updated', payload: project });
      res.status(201).json({ project });
    })
  );

  app.get(
    '/api/projects/:id',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ project });
    })
  );

  app.patch(
    '/api/projects/:id',
    handle((req, res) => {
      const updated = db.updateProject(String(req.params.id), req.body || {});
      if (!updated) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      broadcastWs({ type: 'project_updated', payload: updated });
      res.json({ project: updated });
    })
  );

  app.delete(
    '/api/projects/:id',
    handle((req, res) => {
      const ok = db.deleteProject(String(req.params.id));
      res.json({ deleted: ok });
    })
  );

  // -------------------- Explorer, Workspace Files, Git & Security --------------------

  app.get(
    '/api/projects/:id/explorer',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ tree: bridge.buildExplorerTree(project.workspacePath) });
    })
  );

  app.get(
    '/api/projects/:id/files',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ files: listWorkspaceFilesFlat(project.workspacePath) });
    })
  );

  app.get(
    '/api/projects/:id/file',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const rel = String(req.query.path || '');
      const full = resolveWorkspaceFileSafe(project.workspacePath, rel);
      if (!fs.existsSync(full)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res.json({ path: rel, content: fs.readFileSync(full, 'utf8') });
    })
  );

  app.put(
    '/api/projects/:id/file',
    handle(async (req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const { path: relPath, content } = req.body || {};
      const full = resolveWorkspaceFileSafe(project.workspacePath, String(relPath || ''));
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, String(content ?? ''), 'utf8');
      await git.checkpoint(project.workspacePath, `edit(studio): update ${relPath}`);
      res.json({ saved: true, path: relPath });
    })
  );

  app.get(
    '/api/projects/:id/git/commits',
    handle(async (req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const commits = await git.listRecentCommits(project.workspacePath, 30);
      res.json({ commits });
    })
  );

  app.get(
    '/api/projects/:id/security-scan',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json(scanWorkspaceSecurity(project.workspacePath));
    })
  );

  app.post(
    '/api/projects/:id/sanitize-rbxmx',
    handle(async (req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const { filename, xmlContent } = req.body || {};
      if (!xmlContent) {
        res.status(400).json({ error: 'xmlContent is required' });
        return;
      }
      const { sanitizedXml, strippedCount } = sanitizeRbxmxXml(String(xmlContent));
      const safeName = path.basename(String(filename || `sanitized_${Date.now()}.rbxmx`));
      const target = resolveWorkspaceFileSafe(project.workspacePath, `assets/${safeName}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, sanitizedXml, 'utf8');
      await git.checkpoint(project.workspacePath, `security(librarian): sanitize ${safeName} (stripped ${strippedCount} scripts)`);
      res.json({ path: `assets/${safeName}`, strippedCount, clean: true });
    })
  );

  // -------------------- Chat with Lead --------------------

  app.get(
    '/api/projects/:id/chat',
    handle((req, res) => {
      res.json({ messages: db.listChatMessages(String(req.params.id), 150) });
    })
  );

  app.post(
    '/api/projects/:id/chat',
    handle(async (req, res) => {
      const { message, explorerRefs } = req.body || {};
      if (!message || !String(message).trim()) {
        res.status(400).json({ error: 'Message cannot be empty' });
        return;
      }
      const result = await orchestrator.chatWithLead({
        projectId: String(req.params.id),
        message: String(message),
        explorerRefs: Array.isArray(explorerRefs) ? explorerRefs : [],
      });
      res.json(result);
    })
  );

  // -------------------- Tasks (DAG + Kanban + Git Diff/Rollback) --------------------

  app.get(
    '/api/projects/:id/tasks',
    handle((req, res) => {
      res.json({ tasks: db.listTasks(String(req.params.id)) });
    })
  );

  app.post(
    '/api/projects/:id/tasks/plan',
    handle((req, res) => {
      const result = orchestrator.enqueueDagPlan(String(req.params.id), req.body);
      res.status(201).json(result);
    })
  );

  app.post(
    '/api/projects/:id/tasks/quick-pipeline',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const { templateId } = req.body || {};
      const plan = buildQuickPipelinePlan(String(templateId || 'full_game_factory'), project.name, project.genre);
      const result = orchestrator.enqueueDagPlan(project.id, plan);
      db.addChatMessage({
        projectId: project.id,
        role: 'assistant',
        agentId: 'Lead',
        content: `Launched **${plan.summary}** with ${result.tasks.length} orchestrated tasks across specialists.`,
        delegatedTaskIds: result.tasks.map((t) => t.id),
      });
      res.status(201).json(result);
    })
  );

  app.get(
    '/api/tasks/:taskId/diff',
    handle(async (req, res) => {
      const task = db.getTask(String(req.params.taskId));
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      const project = db.getProject(task.projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const diff = await git.getDiff(project.workspacePath, task.gitBeforeCommit, task.gitAfterCommit);
      res.json({ taskId: task.id, before: task.gitBeforeCommit, after: task.gitAfterCommit, diff });
    })
  );

  app.post(
    '/api/tasks/:taskId/rollback',
    handle(async (req, res) => {
      const result = await orchestrator.rollbackTask(String(req.params.taskId));
      res.json(result);
    })
  );

  app.post(
    '/api/tasks/:taskId/cancel',
    handle((req, res) => {
      const task = orchestrator.cancelTask(String(req.params.taskId));
      res.json({ task });
    })
  );

  // -------------------- Review Queue --------------------

  app.get(
    '/api/reviews',
    handle((req, res) => {
      const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
      const status = req.query.status ? (String(req.query.status) as 'pending' | 'approved' | 'changes_requested') : undefined;
      res.json({ reviews: db.listReviews(projectId, status) });
    })
  );

  app.post(
    '/api/reviews/:id/approve',
    handle((req, res) => {
      const { notes } = req.body || {};
      const result = orchestrator.approveReview(String(req.params.id), notes ? String(notes) : undefined);
      res.json(result);
    })
  );

  app.post(
    '/api/reviews/:id/request-changes',
    handle((req, res) => {
      const { feedback } = req.body || {};
      if (!feedback || !String(feedback).trim()) {
        res.status(400).json({ error: 'Revision feedback is required when requesting changes.' });
        return;
      }
      const result = orchestrator.requestReviewChanges(String(req.params.id), String(feedback).trim());
      res.json(result);
    })
  );

  // -------------------- Live Terminal Logs --------------------

  app.get(
    '/api/logs',
    handle((req, res) => {
      const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
      const agentId = req.query.agentId ? String(req.query.agentId) : undefined;
      const limit = Number(req.query.limit || 250);
      res.json({ logs: db.listAgentLogs(projectId, agentId, Math.min(1000, limit)) });
    })
  );

  // -------------------- Agents Registry, Prompts, Playbook & Catalog --------------------

  app.get(
    '/api/agents',
    handle((_req, res) => {
      res.json({
        registry: registry.loadRegistry(),
        statuses: orchestrator.getAgentStatuses(),
      });
    })
  );

  app.get(
    '/api/agents/status',
    handle((_req, res) => {
      res.json({ statuses: orchestrator.getAgentStatuses() });
    })
  );

  app.put(
    '/api/agents/registry',
    handle((req, res) => {
      const saved = registry.saveRegistry(req.body);
      res.json({ registry: saved });
    })
  );

  app.get(
    '/api/agents/:id/prompt',
    handle((req, res) => {
      const agentId = String(req.params.id);
      const agent = registry.getAgent(agentId);
      const content = registry.readAgentPrompt(agentId);
      res.json({ agent, content });
    })
  );

  app.put(
    '/api/agents/:id/prompt',
    handle((req, res) => {
      const agentId = String(req.params.id);
      registry.saveAgentPrompt(agentId, String(req.body?.content ?? ''));
      res.json({ saved: true, agentId });
    })
  );

  app.get(
    '/api/playbook',
    handle((_req, res) => {
      res.json({ chapters: registry.listPlaybookChapters() });
    })
  );

  app.put(
    '/api/playbook/:filename',
    handle((req, res) => {
      const filename = String(req.params.filename);
      registry.savePlaybookChapter(filename, String(req.body?.content ?? ''));
      res.json({ saved: true, filename });
    })
  );

  app.get(
    '/api/catalog',
    handle((_req, res) => {
      res.json({ items: registry.listCatalogItems() });
    })
  );

  app.post(
    '/api/projects/:id/catalog/:itemId/install',
    handle(async (req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const installed = registry.installCatalogItemIntoWorkspace(String(req.params.itemId), project.workspacePath);
      await git.checkpoint(project.workspacePath, `feat(librarian): install catalog template ${req.params.itemId}`);
      res.json({ installed: true, ...installed });
    })
  );

  // -------------------- Market Intelligence, Game Review & Revenue Simulator --------------------

  app.get(
    '/api/market/trending',
    handle((_req, res) => {
      res.json({ archetypes: market.getTrendingArchetypes() });
    })
  );

  app.get(
    '/api/market/snapshots',
    handle((_req, res) => {
      res.json({ snapshots: db.listCompetitorSnapshots(30) });
    })
  );

  app.post(
    '/api/market/score-idea',
    handle(async (req, res) => {
      const result = await market.scoreIdea(req.body || {});
      res.json(result);
    })
  );

  app.post(
    '/api/market/review-game',
    handle(async (req, res) => {
      const result = await market.reviewGame(req.body || {});
      res.json(result);
    })
  );

  app.post(
    '/api/market/simulate-revenue',
    handle((req, res) => {
      const settings = db.getSettings();
      const result = simulateRevenue({
        ...req.body,
        usdToPhpRate: req.body?.usdToPhpRate ?? settings.usdToPhpRate,
        devExRateUsdPerRobux: req.body?.devExRateUsdPerRobux ?? settings.devExRateUsdPerRobux,
      });
      res.json(result);
    })
  );

  // -------------------- Media & TikTok/Shorts Promo Assembler --------------------

  app.get(
    '/api/projects/:id/media',
    handle(async (req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const ffmpegInstalled = await media.checkFfmpeg();
      res.json({
        ffmpegInstalled,
        assets: media.listProjectMedia(project.id, project.workspacePath),
      });
    })
  );

  app.get(
    '/api/projects/:id/media/:folder/:filename',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const fullPath = media.resolveSafeMediaPath(
        project.workspacePath,
        String(req.params.folder),
        String(req.params.filename)
      );
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: 'Media asset not found' });
        return;
      }
      res.sendFile(fullPath);
    })
  );

  app.post(
    '/api/projects/:id/media/upload',
    handle((req, res) => {
      const project = db.getProject(String(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const { folder, filename, base64Data } = req.body || {};
      const saved = media.saveBase64Asset(
        project.workspacePath,
        folder === 'art' ? 'art' : 'media',
        String(filename || `upload_${Date.now()}.png`),
        String(base64Data || '')
      );
      res.status(201).json(saved);
    })
  );

  app.post(
    '/api/projects/:id/media/assemble-promo',
    handle(async (req, res) => {
      const result = await media.assemblePromoVideo({
        ...(req.body || {}),
        projectId: String(req.params.id),
      });
      if (result.reviewItem) {
        broadcastWs({ type: 'review_updated', payload: result.reviewItem });
      }
      res.json(result);
    })
  );

  // -------------------- Studio Settings & Local Open Cloud --------------------

  app.get(
    '/api/settings',
    handle((_req, res) => {
      res.json({ settings: db.getSettings() });
    })
  );

  app.put(
    '/api/settings',
    handle((req, res) => {
      const updated = db.updateSettings(req.body || {});
      gemini.setMaxConcurrent(updated.maxParallelAgents);
      res.json({ settings: updated });
    })
  );

  app.put(
    '/api/settings/open-cloud',
    handle((req, res) => {
      const { apiKey, defaultUniverseId, testPlaceId, prodPlaceId } = req.body || {};
      const updates: Record<string, string> = {};
      if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
        updates.ROBLOX_OPEN_CLOUD_API_KEY = apiKey;
      }
      if (typeof defaultUniverseId === 'string') updates.ROBLOX_DEFAULT_UNIVERSE_ID = defaultUniverseId;
      if (typeof testPlaceId === 'string') updates.ROBLOX_TEST_PLACE_ID = testPlaceId;
      if (typeof prodPlaceId === 'string') updates.ROBLOX_PROD_PLACE_ID = prodPlaceId;
      updateLocalEnvKeys(updates);
      res.json({ saved: true, message: 'Stored locally in .env (never sent to AI prompts).' });
    })
  );

  // Serve built client bundle in production / Electron mode
  const clientDistDir = path.join(ROOT_DIR, 'client', 'dist');
  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  return {
    app,
    server,
    wss,
    db,
    registry,
    gemini,
    git,
    bridge,
    orchestrator,
    market,
    media,
  };
}

