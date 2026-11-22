import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { GEMINI_SETTINGS_PATH, getLocalOpenCloudConfig } from '../config.js';
import type { BridgeDiagnostics, ExplorerNode } from '../types.js';
import { createDefaultRojoProjectJson } from './gitService.js';

const execFileAsync = promisify(execFile);

async function probeCommand(cmd: string, args: string[]): Promise<{ installed: boolean; version: string | null }> {
  try {
    const isWin = process.platform === 'win32';
    const bin = isWin && cmd === 'gemini' ? process.env.ComSpec || 'cmd.exe' : cmd;
    const binArgs = isWin && cmd === 'gemini' ? ['/d', '/c', 'gemini.cmd', ...args] : args;
    const { stdout, stderr } = await execFileAsync(bin, binArgs, {
      windowsHide: true,
      timeout: 8000,
    });
    const firstLine = (stdout || stderr).trim().split(/\r?\n/)[0] || 'installed';
    return { installed: true, version: firstLine.slice(0, 120) };
  } catch {
    return { installed: false, version: null };
  }
}

export interface RojoStatus {
  running: boolean;
  port: number | null;
  projectSlug: string | null;
  workspacePath: string | null;
  logs: string[];
}

export class RobloxBridgeService extends EventEmitter {
  private rojoProcess: ChildProcess | null = null;
  private rojoPort: number | null = null;
  private rojoProjectSlug: string | null = null;
  private rojoWorkspacePath: string | null = null;
  private rojoLogs: string[] = [];

  public async getDiagnostics(): Promise<BridgeDiagnostics> {
    const [geminiRes, gitRes, rojoRes, ffmpegRes] = await Promise.all([
      probeCommand('gemini', ['--version']),
      probeCommand('git', ['--version']),
      probeCommand('rojo', ['--version']),
      probeCommand('ffmpeg', ['-version']),
    ]);

    let settingsExists = false;
    let authType: string | null = null;
    let configuredServers: string[] = [];
    let robloxStudioConfigured = false;
    let blenderConfigured = false;

    if (fs.existsSync(GEMINI_SETTINGS_PATH)) {
      settingsExists = true;
      try {
        const raw = JSON.parse(fs.readFileSync(GEMINI_SETTINGS_PATH, 'utf8')) as Record<string, unknown>;
        const security = raw.security as Record<string, unknown> | undefined;
        const auth = security?.auth as Record<string, unknown> | undefined;
        if (auth?.selectedType) {
          authType = String(auth.selectedType);
        }

        const mcpServers = (raw.mcpServers || {}) as Record<string, unknown>;
        configuredServers = Object.keys(mcpServers);
        robloxStudioConfigured = configuredServers.some((name) =>
          name.toLowerCase().includes('roblox')
        );
        blenderConfigured = configuredServers.some((name) => name.toLowerCase().includes('blender'));
      } catch {
        // Malformed user settings.json handled gracefully
      }
    }

    const openCloud = getLocalOpenCloudConfig();

    return {
      geminiCli: {
        installed: geminiRes.installed,
        version: geminiRes.version,
        authType,
        settingsPath: GEMINI_SETTINGS_PATH,
        settingsExists,
      },
      mcp: {
        robloxStudioConfigured,
        blenderConfigured,
        configuredServers,
      },
      tools: {
        git: gitRes,
        rojo: {
          ...rojoRes,
          serving: this.rojoProcess !== null,
          port: this.rojoPort,
          projectSlug: this.rojoProjectSlug,
        },
        ffmpeg: ffmpegRes,
      },
      openCloud,
    };
  }

  /**
   * Generates a clean Gemini CLI MCP config snippet for Roblox Studio Built-In MCP
   * (+ optional Blender MCP) without touching existing user MCP entries.
   */
  public generateMcpConfigSnippet(options: { includeBlender?: boolean; robloxStudioCommand?: string } = {}): {
    targetPath: string;
    snippet: Record<string, unknown>;
    instructions: string[];
  } {
    const mcpServers: Record<string, unknown> = {
      Roblox_Studio: {
        command: options.robloxStudioCommand || 'npx',
        args: ['-y', '@roblox/studio-mcp-bridge'],
        trust: false,
        description: 'Roblox Studio built-in MCP bridge (or configure via Studio -> File -> Beta Features -> Assistant MCP / Quick Connect)',
      },
    };

    if (options.includeBlender) {
      mcpServers.blender = {
        command: 'uvx',
        args: ['blender-mcp'],
        trust: false,
        description: 'Optional Blender MCP server for custom stylized 3D props',
      };
    }

    return {
      targetPath: GEMINI_SETTINGS_PATH,
      snippet: { mcpServers },
      instructions: [
        '1. Open Roblox Studio -> File -> Beta Features and enable MCP / Studio Assistant Quick Connect.',
        '2. In Roblox Studio MCP settings, click Quick Connect or copy the Studio MCP endpoint/binary path.',
        '3. Click "Apply to ~/.gemini/settings.json" (creates a .bak backup automatically) or merge the snippet manually.',
        '4. To enable Open Cloud provisioning (Merchant/Publisher), enable `open_cloud_invoke` permission in Studio MCP settings ONLY after testing in a Test Place.',
        '5. Verify connection by running `gemini mcp list` in a terminal.',
      ],
    };
  }

  /**
   * Safely merges the Roblox_Studio MCP entry into ~/.gemini/settings.json with an automatic backup.
   * Only invoked when the user explicitly clicks the 1-click button in Settings.
   */
  public applyMcpConfigToGeminiSettings(options: {
    includeBlender?: boolean;
    robloxStudioUrl?: string;
    robloxStudioCommand?: string;
    robloxStudioArgs?: string[];
  }): { backupPath: string | null; settingsPath: string; mcpServers: string[] } {
    const dir = path.dirname(GEMINI_SETTINGS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let current: Record<string, unknown> = {};
    let backupPath: string | null = null;
    if (fs.existsSync(GEMINI_SETTINGS_PATH)) {
      backupPath = `${GEMINI_SETTINGS_PATH}.roforge.bak`;
      fs.copyFileSync(GEMINI_SETTINGS_PATH, backupPath);
      try {
        current = JSON.parse(fs.readFileSync(GEMINI_SETTINGS_PATH, 'utf8')) as Record<string, unknown>;
      } catch {
        current = {};
      }
    }

    const existingServers = (current.mcpServers as Record<string, unknown>) || {};
    if (options.robloxStudioUrl) {
      existingServers.Roblox_Studio = {
        url: options.robloxStudioUrl,
        type: 'http',
      };
    } else {
      existingServers.Roblox_Studio = {
        command: options.robloxStudioCommand || 'npx',
        args: options.robloxStudioArgs || ['-y', '@roblox/studio-mcp-bridge'],
      };
    }

    if (options.includeBlender) {
      existingServers.blender = {
        command: 'uvx',
        args: ['blender-mcp'],
      };
    }

    current.mcpServers = existingServers;
    fs.writeFileSync(GEMINI_SETTINGS_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');

    return {
      backupPath,
      settingsPath: GEMINI_SETTINGS_PATH,
      mcpServers: Object.keys(existingServers),
    };
  }

  // -------------------- Rojo Serve Controller --------------------

  public getRojoStatus(): RojoStatus {
    return {
      running: this.rojoProcess !== null,
      port: this.rojoPort,
      projectSlug: this.rojoProjectSlug,
      workspacePath: this.rojoWorkspacePath,
      logs: this.rojoLogs.slice(-80),
    };
  }

  public ensureRojoProjectFile(workspacePath: string, projectName: string): string {
    const filePath = path.join(workspacePath, 'default.project.json');
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(createDefaultRojoProjectJson(projectName), null, 2) + '\n', 'utf8');
    }
    return filePath;
  }

  public async startRojoServe(workspacePath: string, projectSlug: string, port = 34872): Promise<RojoStatus> {
    const check = await probeCommand('rojo', ['--version']);
    if (!check.installed) {
      throw new Error(
        'Rojo CLI is not installed on this machine. Install via `aftman`, `rokit`, `cargo install rojo`, or download from https://rojo.space/docs/v7/getting-started/installation/'
      );
    }

    if (this.rojoProcess) {
      this.stopRojoServe();
    }

    this.ensureRojoProjectFile(workspacePath, projectSlug);
    this.rojoLogs = [`Starting rojo serve on port ${port} for ${projectSlug}...`];

    const child = spawn('rojo', ['serve', 'default.project.json', '--port', String(port)], {
      cwd: workspacePath,
      windowsHide: true,
    });

    this.rojoProcess = child;
    this.rojoPort = port;
    this.rojoProjectSlug = projectSlug;
    this.rojoWorkspacePath = workspacePath;

    const pushLog = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      this.rojoLogs.push(`[${new Date().toLocaleTimeString()}] ${trimmed}`);
      if (this.rojoLogs.length > 200) this.rojoLogs.shift();
      this.emit('rojo_status', this.getRojoStatus());
    };

    child.stdout?.on('data', (d: Buffer) => pushLog(d.toString('utf8')));
    child.stderr?.on('data', (d: Buffer) => pushLog(d.toString('utf8')));
    child.on('close', (code) => {
      pushLog(`rojo serve exited with code ${code ?? 0}`);
      this.rojoProcess = null;
      this.rojoPort = null;
      this.emit('rojo_status', this.getRojoStatus());
    });

    this.emit('rojo_status', this.getRojoStatus());
    return this.getRojoStatus();
  }

  public stopRojoServe(): RojoStatus {
    if (this.rojoProcess) {
      try {
        this.rojoProcess.kill();
      } catch {
        // Ignore
      }
      this.rojoProcess = null;
      this.rojoPort = null;
      this.rojoLogs.push(`[${new Date().toLocaleTimeString()}] Stopped rojo serve.`);
    }
    const status = this.getRojoStatus();
    this.emit('rojo_status', status);
    return status;
  }

  // -------------------- Live Studio Explorer Hierarchy Builder --------------------

  private inferRobloxClassName(filename: string, isDir: boolean): string {
    if (isDir) return 'Folder';
    if (filename.endsWith('.server.luau') || filename.endsWith('.server.lua')) return 'Script';
    if (filename.endsWith('.client.luau') || filename.endsWith('.client.lua')) return 'LocalScript';
    if (filename.endsWith('.luau') || filename.endsWith('.lua')) return 'ModuleScript';
    if (filename.endsWith('.json')) return 'Configuration';
    return 'File';
  }

  private stripRojoSuffix(filename: string): string {
    return filename
      .replace(/\.server\.luau$/, '')
      .replace(/\.client\.luau$/, '')
      .replace(/\.server\.lua$/, '')
      .replace(/\.client\.lua$/, '')
      .replace(/\.luau$/, '')
      .replace(/\.lua$/, '');
  }

  private buildFolderNodes(workspacePath: string, relDir: string, robloxParentPath: string): ExplorerNode[] {
    const absDir = path.join(workspacePath, relDir);
    if (!fs.existsSync(absDir)) return [];

    const entries = fs.readdirSync(absDir, { withFileTypes: true }).sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const nodes: ExplorerNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = path.join(relDir, entry.name).replace(/\\/g, '/');
      const displayName = entry.isDirectory() ? entry.name : this.stripRojoSuffix(entry.name);
      const robloxPath = `${robloxParentPath}.${displayName}`;
      nodes.push({
        id: robloxPath,
        name: displayName,
        className: this.inferRobloxClassName(entry.name, entry.isDirectory()),
        robloxPath,
        filePath: entry.isDirectory() ? undefined : relPath,
        children: entry.isDirectory() ? this.buildFolderNodes(workspacePath, relPath, robloxPath) : [],
      });
    }
    return nodes;
  }

  /**
   * Builds the live Roblox DataModel Explorer tree from Rojo default.project.json + workspace scripts,
   * optionally merging a Studio MCP snapshot (`reports/studio_snapshot.json`) if present.
   */
  public buildExplorerTree(workspacePath: string): ExplorerNode {
    const serverChildren = this.buildFolderNodes(workspacePath, 'src/server', 'game.ServerScriptService.Server');
    const sharedChildren = this.buildFolderNodes(workspacePath, 'src/shared', 'game.ReplicatedStorage.Shared');
    const clientChildren = this.buildFolderNodes(
      workspacePath,
      'src/client',
      'game.StarterPlayer.StarterPlayerScripts.Client'
    );
    const workspaceWorldScripts = this.buildFolderNodes(workspacePath, 'src/server/world', 'game.Workspace.GeneratedWorld');

    // Merge optional live Studio snapshot nodes under Workspace
    const snapshotPath = path.join(workspacePath, 'reports', 'studio_snapshot.json');
    let snapshotWorkspaceChildren: ExplorerNode[] = [];
    if (fs.existsSync(snapshotPath)) {
      try {
        const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as { workspace?: ExplorerNode[] };
        if (Array.isArray(snap.workspace)) {
          snapshotWorkspaceChildren = snap.workspace;
        }
      } catch {
        // Ignore invalid snapshot
      }
    }

    return {
      id: 'game',
      name: 'DataModel',
      className: 'DataModel',
      robloxPath: 'game',
      children: [
        {
          id: 'game.Workspace',
          name: 'Workspace',
          className: 'Workspace',
          robloxPath: 'game.Workspace',
          children: [
            ...snapshotWorkspaceChildren,
            ...(workspaceWorldScripts.length > 0
              ? [
                  {
                    id: 'game.Workspace.GeneratedWorld',
                    name: 'GeneratedWorld (Procedural)',
                    className: 'Folder',
                    robloxPath: 'game.Workspace.GeneratedWorld',
                    children: workspaceWorldScripts,
                  },
                ]
              : []),
          ],
        },
        {
          id: 'game.ReplicatedStorage',
          name: 'ReplicatedStorage',
          className: 'ReplicatedStorage',
          robloxPath: 'game.ReplicatedStorage',
          children: [
            {
              id: 'game.ReplicatedStorage.Shared',
              name: 'Shared',
              className: 'Folder',
              robloxPath: 'game.ReplicatedStorage.Shared',
              children: sharedChildren,
            },
          ],
        },
        {
          id: 'game.ServerScriptService',
          name: 'ServerScriptService',
          className: 'ServerScriptService',
          robloxPath: 'game.ServerScriptService',
          children: [
            {
              id: 'game.ServerScriptService.Server',
              name: 'Server',
              className: 'Folder',
              robloxPath: 'game.ServerScriptService.Server',
              children: serverChildren,
            },
          ],
        },
        {
          id: 'game.StarterPlayer',
          name: 'StarterPlayer',
          className: 'StarterPlayer',
          robloxPath: 'game.StarterPlayer',
          children: [
            {
              id: 'game.StarterPlayer.StarterPlayerScripts',
              name: 'StarterPlayerScripts',
              className: 'StarterPlayerScripts',
              robloxPath: 'game.StarterPlayer.StarterPlayerScripts',
              children: [
                {
                  id: 'game.StarterPlayer.StarterPlayerScripts.Client',
                  name: 'Client',
                  className: 'Folder',
                  robloxPath: 'game.StarterPlayer.StarterPlayerScripts.Client',
                  children: clientChildren,
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

