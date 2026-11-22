import fs from 'node:fs';
import path from 'node:path';
import {
  CATALOG_INDEX_PATH,
  PLAYBOOK_DIR,
  PROMPTS_DIR,
  REGISTRY_PATH,
  ROOT_DIR,
} from '../config.js';
import {
  AgentRegistrySchema,
  type AgentDefinition,
  type AgentRegistry,
  type CatalogItem,
  type StudioSettings,
} from '../types.js';

export interface PlaybookChapterMeta {
  filename: string;
  title: string;
  mappedAgents: string[];
  bytes: number;
  content: string;
}

export class RegistryService {
  private registryCache: AgentRegistry | null = null;

  public loadRegistry(forceReload = false): AgentRegistry {
    if (this.registryCache && !forceReload) {
      return this.registryCache;
    }
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = AgentRegistrySchema.parse(JSON.parse(raw));
    this.registryCache = parsed;
    return parsed;
  }

  public saveRegistry(nextRegistry: AgentRegistry): AgentRegistry {
    const validated = AgentRegistrySchema.parse(nextRegistry);
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(validated, null, 2) + '\n', 'utf8');
    this.registryCache = validated;
    return validated;
  }

  public getAgent(agentId: string): AgentDefinition {
    const registry = this.loadRegistry();
    const found = registry.agents.find((a) => a.id === agentId);
    if (!found) {
      throw new Error(`Unknown agentId: "${agentId}"`);
    }
    return found;
  }

  public listAgents(): AgentDefinition[] {
    return this.loadRegistry().agents;
  }

  public resolveModelForAgent(agentId: string, settings: StudioSettings): string {
    const override = settings.agentModelOverrides[agentId];
    if (override && override.trim().length > 0) {
      return override.trim();
    }
    const agent = this.getAgent(agentId);
    if (agent.modelTier === 'pro') {
      return settings.proModel || this.loadRegistry().modelTiers.pro;
    }
    return settings.fastModel || this.loadRegistry().modelTiers.fast;
  }

  public readAgentPrompt(agentId: string): string {
    const agent = this.getAgent(agentId);
    const fullPath = path.resolve(ROOT_DIR, agent.promptFile);
    if (!fullPath.startsWith(PROMPTS_DIR)) {
      throw new Error(`Prompt path escapes agents/prompts directory: ${agent.promptFile}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  public saveAgentPrompt(agentId: string, content: string): void {
    const agent = this.getAgent(agentId);
    const fullPath = path.resolve(ROOT_DIR, agent.promptFile);
    if (!fullPath.startsWith(PROMPTS_DIR)) {
      throw new Error(`Prompt path escapes agents/prompts directory: ${agent.promptFile}`);
    }
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  public listPlaybookChapters(): PlaybookChapterMeta[] {
    const registry = this.loadRegistry();
    if (!fs.existsSync(PLAYBOOK_DIR)) return [];
    const files = fs
      .readdirSync(PLAYBOOK_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort();

    return files.map((filename) => {
      const fullPath = path.join(PLAYBOOK_DIR, filename);
      const content = fs.readFileSync(fullPath, 'utf8');
      const headingMatch = content.match(/^#\s+(.+)$/m);
      const mappedAgents = registry.agents
        .filter((a) => a.playbookChapters.includes(filename))
        .map((a) => a.id);
      return {
        filename,
        title: headingMatch ? headingMatch[1].trim() : filename,
        mappedAgents,
        bytes: Buffer.byteLength(content, 'utf8'),
        content,
      };
    });
  }

  public readPlaybookChapter(filename: string): string {
    const safeName = path.basename(filename);
    const fullPath = path.join(PLAYBOOK_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Playbook chapter not found: ${safeName}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  public savePlaybookChapter(filename: string, content: string): void {
    const safeName = path.basename(filename);
    if (!safeName.endsWith('.md')) {
      throw new Error('Playbook chapters must end with .md');
    }
    fs.writeFileSync(path.join(PLAYBOOK_DIR, safeName), content, 'utf8');
  }

  /**
   * Builds the domain-isolated system prompt for an agent:
   * - Role prompt from agents/prompts/<agent>.md
   * - ONLY the playbook chapters mapped to this agent in agents/registry.json
   * - Active project's docs/contracts.json if present (so builders share the exact contract)
   */
  public buildAgentContextPrompt(
    agentId: string,
    workspacePath?: string
  ): { systemPrompt: string; loadedChapters: string[] } {
    const agent = this.getAgent(agentId);
    const rolePrompt = this.readAgentPrompt(agentId);

    const chapters: string[] = [];
    const loadedChapters: string[] = [];
    for (const chapterFile of agent.playbookChapters) {
      const fullPath = path.join(PLAYBOOK_DIR, path.basename(chapterFile));
      if (fs.existsSync(fullPath)) {
        chapters.push(
          `\n---\n## PLAYBOOK REFERENCE: ${chapterFile}\n${fs.readFileSync(fullPath, 'utf8')}`
        );
        loadedChapters.push(chapterFile);
      }
    }

    let contractBlock = '';
    if (workspacePath) {
      const contractPath = path.join(workspacePath, 'docs', 'contracts.json');
      if (fs.existsSync(contractPath)) {
        const rawContract = fs.readFileSync(contractPath, 'utf8').slice(0, 12000);
        contractBlock = `\n---\n## ACTIVE PROJECT TECHNICAL CONTRACT (docs/contracts.json)\n\`\`\`json\n${rawContract}\n\`\`\``;
      }
    }

    const scopeNotice = `\n---\n## AGENT PERMISSION & FILE SCOPE\n- Agent ID: ${agent.id} (${agent.role})\n- Writable Paths: ${
      agent.permissions.writablePaths.length > 0 ? agent.permissions.writablePaths.join(', ') : 'READ-ONLY'
    }\n- Allowed MCP Servers: ${
      agent.allowedMcpServers.length > 0 ? agent.allowedMcpServers.join(', ') : 'None'
    }\n- Open Cloud / Live Publish Rule: NEVER execute live production publishing or Robux price changes without explicit human Review Queue approval.\n`;

    return {
      systemPrompt: [rolePrompt, scopeNotice, ...chapters, contractBlock].join('\n'),
      loadedChapters,
    };
  }

  public listCatalogItems(): Array<CatalogItem & { previewCode?: string }> {
    if (!fs.existsSync(CATALOG_INDEX_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(CATALOG_INDEX_PATH, 'utf8')) as { items: CatalogItem[] };
    return (raw.items || []).map((item) => {
      const srcFull = path.resolve(ROOT_DIR, item.sourcePath);
      const previewCode = fs.existsSync(srcFull) ? fs.readFileSync(srcFull, 'utf8') : undefined;
      return { ...item, previewCode };
    });
  }

  public installCatalogItemIntoWorkspace(itemId: string, workspacePath: string): { targetPath: string } {
    const items = this.listCatalogItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      throw new Error(`Catalog item not found: ${itemId}`);
    }
    const srcFull = path.resolve(ROOT_DIR, item.sourcePath);
    const destFull = path.resolve(workspacePath, item.targetPath);
    if (!destFull.startsWith(path.resolve(workspacePath))) {
      throw new Error('Target path escapes workspace');
    }
    fs.mkdirSync(path.dirname(destFull), { recursive: true });
    fs.copyFileSync(srcFull, destFull);
    return { targetPath: item.targetPath };
  }

  /**
   * Verifies that every agent in registry.json has a valid prompt file and all mapped playbook chapters exist.
   */
  public verifyIntegrity(): { ok: boolean; errors: string[]; agentCount: number; playbookCount: number } {
    const errors: string[] = [];
    const registry = this.loadRegistry(true);
    const seenIds = new Set<string>();

    for (const agent of registry.agents) {
      if (seenIds.has(agent.id)) {
        errors.push(`Duplicate agent id: ${agent.id}`);
      }
      seenIds.add(agent.id);

      const promptFull = path.resolve(ROOT_DIR, agent.promptFile);
      if (!fs.existsSync(promptFull)) {
        errors.push(`Missing prompt file for ${agent.id}: ${agent.promptFile}`);
      }

      for (const ch of agent.playbookChapters) {
        const chFull = path.join(PLAYBOOK_DIR, path.basename(ch));
        if (!fs.existsSync(chFull)) {
          errors.push(`Missing playbook chapter mapped to ${agent.id}: ${ch}`);
        }
      }
    }

    const chapters = this.listPlaybookChapters();
    return {
      ok: errors.length === 0,
      errors,
      agentCount: registry.agents.length,
      playbookCount: chapters.length,
    };
  }
}

