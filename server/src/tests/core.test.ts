import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StudioDatabase } from '../db/database.js';
import { GeminiRunner } from '../services/geminiRunner.js';
import { GitService } from '../services/gitService.js';
import { parseRobloxGameIdentifier, simulateRevenue } from '../services/marketService.js';
import { StudioOrchestrator, validateDagPlan } from '../services/orchestrator.js';
import { RegistryService } from '../services/registryService.js';
import { sanitizeRbxmxXml, scanLuauSource, scanRbxmxModel, scanWorkspaceSecurity } from '../services/securityScanner.js';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true, detail: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, detail });
    console.error(`  [FAIL] ${name} -> ${detail}`);
  }
}

async function main() {
  console.log('\n=== RoForge Studio — Core Verification Suite (npm run test:core) ===\n');

  // (a) All 15 agents + all 8 playbook mappings load cleanly
  await runTest('(a) All 15 agents, role prompts & 8 playbook chapter mappings load cleanly', () => {
    const registryService = new RegistryService();
    const integrity = registryService.verifyIntegrity();
    assert.equal(integrity.ok, true, `Integrity errors: ${integrity.errors.join(', ')}`);
    assert.equal(integrity.agentCount, 15, 'Expected exact 15 agents in agents/registry.json');
    assert.equal(integrity.playbookCount, 8, 'Expected exact 8 playbook chapters in playbook/');

    const expectedAgents = [
      'Lead',
      'Pulse',
      'Architect',
      'Builder',
      'Frame',
      'Scenic',
      'Librarian',
      'Playtest',
      'KidTester',
      'Reviewer',
      'Merchant',
      'Splash',
      'Liveops',
      'AudioVFX',
      'Publisher',
    ];
    const actualIds = registryService.listAgents().map((a) => a.id);
    assert.deepEqual(actualIds, expectedAgents, 'Agent roster mismatch');

    // Verify domain scoping: Frame only loads chapters 04 & 05, NOT chapter 06 or 08
    const frameCtx = registryService.buildAgentContextPrompt('Frame');
    assert.deepEqual(frameCtx.loadedChapters, [
      '04-mobile-first-ui-and-gamepad.md',
      '05-monetization-and-shop-psychology.md',
    ]);
    assert.ok(frameCtx.systemPrompt.includes('667x375'), 'Frame context should include mobile-first chapter');
    assert.ok(!frameCtx.systemPrompt.includes('Emergency Rollback Playbook'), 'Frame should not load Chapter 08');

    // Verify catalog templates exist and pass security scanner cleanly
    const catalog = registryService.listCatalogItems();
    assert.ok(catalog.length >= 6, 'Expected at least 6 starter Luau catalog templates');
    for (const item of catalog) {
      assert.ok(item.previewCode && item.previewCode.startsWith('--!strict'), `${item.id} must be --!strict Luau`);
      const findings = scanLuauSource(item.sourcePath, item.previewCode);
      const blocking = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
      assert.equal(blocking.length, 0, `Catalog template ${item.id} had unexpected CRITICAL/HIGH finding: ${JSON.stringify(blocking)}`);
    }
  });

  // (b) DAG topological sort & cycle detection
  await runTest('(b) DAG topological sort, parallel levels & cycle detection', () => {
    const registryService = new RegistryService();
    const validAgents = new Set(registryService.listAgents().map((a) => a.id));

    const validPlan = {
      summary: 'Valid factory DAG',
      tasks: [
        { key: 'build_ui', title: 'Build UI', agentId: 'Frame', description: 'Build mobile HUD', dependsOn: ['design'], priority: 2 },
        { key: 'build_core', title: 'Build Core', agentId: 'Builder', description: 'Build core loop', dependsOn: ['design'], priority: 1 },
        { key: 'design', title: 'Design GDD', agentId: 'Architect', description: 'Write GDD and contracts', dependsOn: ['pitch'], priority: 1 },
        { key: 'pitch', title: 'Score Idea', agentId: 'Pulse', description: 'Validate niche', dependsOn: [], priority: 1 },
        { key: 'qa', title: 'Playtest', agentId: 'Playtest', description: 'Run QA checks', dependsOn: ['build_core', 'build_ui'], priority: 3 },
      ],
    };

    const good = validateDagPlan(validPlan, validAgents);
    assert.equal(good.validation.valid, true, `Expected valid DAG: ${good.validation.errors.join(', ')}`);
    assert.equal(good.validation.sortedKeys[0], 'pitch');
    assert.equal(good.validation.sortedKeys[1], 'design');
    assert.equal(good.validation.sortedKeys[4], 'qa');
    assert.ok(good.validation.sortedKeys.indexOf('build_core') > good.validation.sortedKeys.indexOf('design'));
    assert.ok(good.validation.sortedKeys.indexOf('build_ui') > good.validation.sortedKeys.indexOf('design'));

    // Cycle detection (A -> B -> C -> A)
    const cyclicPlan = {
      summary: 'Cyclic DAG',
      tasks: [
        { key: 'a', title: 'Task A', agentId: 'Builder', description: 'Depends on C', dependsOn: ['c'], priority: 1 },
        { key: 'b', title: 'Task B', agentId: 'Frame', description: 'Depends on A', dependsOn: ['a'], priority: 1 },
        { key: 'c', title: 'Task C', agentId: 'Scenic', description: 'Depends on B', dependsOn: ['b'], priority: 1 },
      ],
    };

    const bad = validateDagPlan(cyclicPlan, validAgents);
    assert.equal(bad.validation.valid, false, 'Cyclic DAG must be rejected');
    assert.ok(bad.validation.cyclePath && bad.validation.cyclePath.length >= 4, 'Expected explicit cyclePath trace');

    // Unknown agent rejected
    const unknownAgentPlan = {
      summary: 'Bad agent',
      tasks: [{ key: 'x', title: 'Bad', agentId: 'NonExistentAgent', description: 'Should fail', dependsOn: [], priority: 1 }],
    };
    assert.equal(validateDagPlan(unknownAgentPlan, validAgents).validation.valid, false);
  });

  // Create temp dir for isolated Git + SQLite orchestrator tests
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roforge-test-'));

  try {
    // (c) Review Gate pause, downstream blocking, approve resume & request-changes feedback loop
    await runTest('(c) Review Gate pause/resume & Request Changes re-queue loop', async () => {
      const db = new StudioDatabase(':memory:');
      const registry = new RegistryService();
      const gemini = new GeminiRunner();
      const git = new GitService();

      db.updateSettings({ dryRunMode: true, autoQaLoop: false, maxParallelAgents: 2 });

      const wsPath = await git.initProjectWorkspace('Review Gate Game', 'review-gate-game', tempRoot);
      const project = db.createProject({ name: 'Review Gate Game', slug: 'review-gate-game', workspacePath: wsPath });
      const orchestrator = new StudioOrchestrator(db, registry, gemini, git);

      orchestrator.enqueueDagPlan(project.id, {
        summary: 'Gated design -> build pipeline',
        tasks: [
          {
            key: 'gdd_step',
            title: 'Write GDD',
            agentId: 'Architect',
            description: 'Create GDD for review',
            dependsOn: [],
            requiresReview: true,
            reviewCategory: 'gdd',
            priority: 1,
          },
          {
            key: 'build_step',
            title: 'Build Gameplay',
            agentId: 'Builder',
            description: 'Depends on approved GDD',
            dependsOn: ['gdd_step'],
            requiresReview: false,
            priority: 2,
          },
        ],
      });

      // Wait for simulated dry-run task 1 to reach awaiting_review
      const waitUntil = async (pred: () => boolean, label: string) => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          if (pred()) return;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error(`Timed out waiting for: ${label}`);
      };

      await waitUntil(
        () => db.listTasks(project.id).find((t) => t.taskKey === 'gdd_step')?.status === 'awaiting_review',
        'gdd_step awaiting_review'
      );

      // Downstream build_step MUST still be pending while gdd_step awaits review!
      const midTasks = db.listTasks(project.id);
      assert.equal(midTasks.find((t) => t.taskKey === 'build_step')?.status, 'pending');

      const pendingReviews = db.listReviews(project.id, 'pending');
      assert.equal(pendingReviews.length, 1, 'Expected 1 pending review item');

      // Test Request Changes -> task re-runs with feedback and pauses in review again
      orchestrator.requestReviewChanges(pendingReviews[0].id, 'Add 7-day daily streak rewards to GDD.');
      await waitUntil(
        () => db.listReviews(project.id, 'pending').length === 1 && db.listTasks(project.id).find((t) => t.taskKey === 'gdd_step')?.retryCount === 1,
        'gdd_step re-run after request_changes'
      );

      const secondReview = db.listReviews(project.id, 'pending')[0];
      assert.ok(secondReview, 'Expected fresh pending review item after revision');

      // Now Approve -> unblocks build_step and finishes it!
      orchestrator.approveReview(secondReview.id, 'Looks great!');
      await waitUntil(
        () => db.listTasks(project.id).find((t) => t.taskKey === 'build_step')?.status === 'completed',
        'build_step completed after approval'
      );

      assert.equal(db.listTasks(project.id).find((t) => t.taskKey === 'gdd_step')?.status, 'completed');
      db.close();
    });

    // (d) Git checkpoint, diff inspection & 1-click task rollback
    await runTest('(d) Git auto-checkpoint, diff generation & 1-click rollback', async () => {
      const git = new GitService();
      const wsPath = await git.initProjectWorkspace('Git Rollback Test', 'git-rollback-test', tempRoot);

      const pre = await git.checkpoint(wsPath, 'pre-task');
      assert.ok(pre.hash, 'Expected initial HEAD commit hash');

      const scriptPath = path.join(wsPath, 'src/server/BadExperiment.server.luau');
      fs.writeFileSync(scriptPath, '--!strict\nprint("experimental change")\n', 'utf8');

      const post = await git.checkpoint(wsPath, 'feat(builder): add experimental script');
      assert.equal(post.committed, true);
      assert.notEqual(post.hash, pre.hash);

      const diff = await git.getDiff(wsPath, pre.hash, post.hash);
      assert.ok(diff.includes('BadExperiment.server.luau'), 'Diff should include modified file');
      assert.ok(fs.existsSync(scriptPath), 'File should exist before rollback');

      const rolled = await git.rollbackToCommit(wsPath, pre.hash!, 'rollback test');
      assert.equal(rolled.restoredFrom, pre.hash);
      assert.equal(fs.existsSync(scriptPath), false, 'Rollback must remove file introduced by reverted task');
    });

    // (e) Creator Store backdoor scanner & .rbxmx sanitizer
    await runTest('(e) Creator Store backdoor scanner & .rbxmx script sanitizer', () => {
      const evilLuau = `
        local m = require(987654321)
        getfenv()[string.char(114, 101, 113, 117, 105, 114, 101)](123456)
        loadstring("print('pwned')")()
        Remote.OnServerEvent:Connect(function(player, coins)
          player.Coins.Value += coins
        end)
        MarketplaceService.ProcessReceipt = function(info)
          return Enum.ProductPurchaseDecision.PurchaseGranted
        end
      `;

      const findings = scanLuauSource('src/server/Evil.server.luau', evilLuau);
      const cats = new Set(findings.map((f) => f.category));
      assert.ok(cats.has('backdoor'), 'Must detect require(assetId), getfenv, loadstring, string.char');
      assert.ok(cats.has('remote_exploit'), 'Must detect client-trusted coins parameter in OnServerEvent');
      assert.ok(cats.has('process_receipt'), 'Must flag ProcessReceipt missing PurchaseId & NotProcessedYet');
      assert.ok(findings.filter((f) => f.severity === 'CRITICAL').length >= 4);

      const evilRbxmx = `<roblox version="4">
        <Item class="Model" referent="RBX1">
          <Properties><string name="Name">FreeTree</string></Properties>
          <Item class="Part" referent="RBX2"><Properties><string name="Name">Trunk</string></Properties></Item>
          <Item class="Script" referent="RBX3">
            <Properties>
              <string name="Name">SpreadVirus</string>
              <ProtectedString name="Source"><![CDATA[require(4455667788)]]></ProtectedString>
            </Properties>
          </Item>
        </Item>
      </roblox>`;

      const modelFindings = scanRbxmxModel('assets/FreeTree.rbxmx', evilRbxmx);
      assert.ok(modelFindings.some((f) => f.category === 'embedded_script'), 'Must flag embedded Script in .rbxmx');

      const { sanitizedXml, strippedCount } = sanitizeRbxmxXml(evilRbxmx);
      assert.equal(strippedCount, 1, 'Should strip 1 unauthorized Script');
      assert.equal(scanRbxmxModel('assets/FreeTree.rbxmx', sanitizedXml).length, 0, 'Sanitized .rbxmx must scan clean');

      // Workspace-level duplicate ProcessReceipt check
      const scanDir = path.join(tempRoot, 'scan-check');
      fs.mkdirSync(path.join(scanDir, 'src/server'), { recursive: true });
      const stubReceipt = '--!strict\n-- PurchaseId NotProcessedYet\nMarketplaceService.ProcessReceipt = function(r) return Enum.ProductPurchaseDecision.NotProcessedYet end\n';
      fs.writeFileSync(path.join(scanDir, 'src/server/A.server.luau'), stubReceipt, 'utf8');
      fs.writeFileSync(path.join(scanDir, 'src/server/B.server.luau'), stubReceipt, 'utf8');
      const wsScan = scanWorkspaceSecurity(scanDir);
      assert.equal(wsScan.releaseBlocked, true, 'Duplicate ProcessReceipt across two scripts must block release');
    });

    // (f) Bonus: Revenue / DevEx simulator & Roblox URL parser verification
    await runTest('(f) Market URL parser & Robux/DevEx Revenue Simulator math', () => {
      assert.deepEqual(parseRobloxGameIdentifier('https://www.roblox.com/games/1537690962/Bee-Swarm-Simulator'), {
        placeId: '1537690962',
      });
      assert.deepEqual(parseRobloxGameIdentifier('universe:601130232'), { universeId: '601130232' });

      const sim = simulateRevenue({
        ccu: 500,
        avgSessionMinutes: 15,
        d1RetentionPct: 15,
        d7RetentionPct: 4.5,
        d30RetentionPct: 2.2,
        payerConversionPct: 5.5,
        arppuRobux: 420,
        usdToPhpRate: 58,
      });

      assert.equal(sim.scenarios.length, 3);
      assert.ok(sim.scenarios[1].netDailyRobux < sim.scenarios[1].grossDailyRobux, '30% marketplace fee must reduce net Robux');
      assert.ok(sim.scenarios[1].monthlyUsd > 0, 'Positive monthly DevEx USD projection expected');
      assert.ok(
        Math.abs(sim.scenarios[1].monthlyPhp - sim.scenarios[1].monthlyUsd * 58) < 1,
        'PHP projection should equal USD * exchange rate'
      );
      assert.equal(sim.benchmarks.retentionHealth, 'Strong');
      assert.equal(sim.benchmarks.monetizationHealth, 'Strong');
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

void main();

