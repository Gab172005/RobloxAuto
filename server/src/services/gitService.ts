import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { WORKSPACE_DIR } from '../config.js';

const execFileAsync = promisify(execFile);

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  date: string;
}

export function slugifyProjectName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `game-${Date.now()}`;
}

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export function createDefaultRojoProjectJson(projectName: string): Record<string, unknown> {
  return {
    name: projectName,
    tree: {
      $className: 'DataModel',
      ReplicatedStorage: {
        $className: 'ReplicatedStorage',
        Shared: {
          $path: 'src/shared',
        },
      },
      ServerScriptService: {
        $className: 'ServerScriptService',
        Server: {
          $path: 'src/server',
        },
      },
      StarterPlayer: {
        $className: 'StarterPlayer',
        StarterPlayerScripts: {
          $className: 'StarterPlayerScripts',
          Client: {
            $path: 'src/client',
          },
        },
      },
      Workspace: {
        $className: 'Workspace',
        $properties: {
          FilteringEnabled: true,
          StreamingEnabled: true,
        },
      },
      SoundService: {
        $className: 'SoundService',
        $properties: {
          RespectFilteringEnabled: true,
        },
      },
    },
  };
}

export class GitService {
  /**
   * Creates a clean Git-initialized Rojo project workspace under workspace/<slug>/.
   */
  public async initProjectWorkspace(projectName: string, slug: string, customBaseDir?: string): Promise<string> {
    const baseDir = customBaseDir || WORKSPACE_DIR;
    const workspacePath = path.join(baseDir, slug);

    const subdirs = [
      'src/server',
      'src/server/modules',
      'src/server/world',
      'src/client',
      'src/client/ui',
      'src/client/vfx',
      'src/shared',
      'docs',
      'art',
      'media',
      'reports',
      'assets',
    ];

    fs.mkdirSync(workspacePath, { recursive: true });
    for (const dir of subdirs) {
      fs.mkdirSync(path.join(workspacePath, dir), { recursive: true });
    }

    const rojoPath = path.join(workspacePath, 'default.project.json');
    if (!fs.existsSync(rojoPath)) {
      fs.writeFileSync(rojoPath, JSON.stringify(createDefaultRojoProjectJson(projectName), null, 2) + '\n', 'utf8');
    }

    const starterShared = path.join(workspacePath, 'src/shared/Constants.luau');
    if (!fs.existsSync(starterShared)) {
      fs.writeFileSync(
        starterShared,
        `--!strict\n-- Auto-scaffolded by RoForge Studio for ${projectName}\nlocal Constants = {\n\tProjectName = ${JSON.stringify(projectName)},\n\tSchemaVersion = 1,\n}\nreturn Constants\n`,
        'utf8'
      );
    }

    const starterServer = path.join(workspacePath, 'src/server/Init.server.luau');
    if (!fs.existsSync(starterServer)) {
      fs.writeFileSync(
        starterServer,
        `--!strict\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal Shared = ReplicatedStorage:WaitForChild("Shared")\nlocal Constants = require(Shared:WaitForChild("Constants"))\nprint("[RoForge] Server initialized for", Constants.ProjectName)\n`,
        'utf8'
      );
    }

    const starterClient = path.join(workspacePath, 'src/client/Init.client.luau');
    if (!fs.existsSync(starterClient)) {
      fs.writeFileSync(
        starterClient,
        `--!strict\nlocal ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal Shared = ReplicatedStorage:WaitForChild("Shared")\nlocal Constants = require(Shared:WaitForChild("Constants"))\nprint("[RoForge] Client initialized for", Constants.ProjectName)\n`,
        'utf8'
      );
    }

    const readmePath = path.join(workspacePath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        `# ${projectName}\n\nManaged by **RoForge Studio** (Rojo + Multi-Agent Gemini CLI Factory).\n\n- \`src/server/\` -> \`ServerScriptService.Server\`\n- \`src/client/\` -> \`StarterPlayer.StarterPlayerScripts.Client\`\n- \`src/shared/\` -> \`ReplicatedStorage.Shared\`\n- \`docs/\` -> GDD, technical contracts, monetization spec\n- \`reports/\` -> Playtest, KidTester, Security, and Liveops reports\n`,
        'utf8'
      );
    }

    const gitignorePath = path.join(workspacePath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '*.rbxlx.lock\n.DS_Store\nThumbs.db\n', 'utf8');
    }

    // Initialize git repository if needed
    if (!fs.existsSync(path.join(workspacePath, '.git'))) {
      await runGit(workspacePath, ['init']);
      await runGit(workspacePath, ['config', 'user.name', 'RoForge Studio']);
      await runGit(workspacePath, ['config', 'user.email', 'studio@roforge.local']);
      await runGit(workspacePath, ['add', '-A']);
      await runGit(workspacePath, ['commit', '-m', `chore: initialize RoForge Rojo workspace for ${projectName}`]);
    }

    return workspacePath;
  }

  public async getHeadCommit(workspacePath: string): Promise<string | null> {
    try {
      const { stdout } = await runGit(workspacePath, ['rev-parse', 'HEAD']);
      return stdout || null;
    } catch {
      return null;
    }
  }

  /**
   * Stages all workspace changes and commits a checkpoint if the tree is dirty.
   * Returns the HEAD commit hash (even if working tree had no changes).
   */
  public async checkpoint(workspacePath: string, message: string): Promise<{ hash: string | null; committed: boolean }> {
    if (!fs.existsSync(path.join(workspacePath, '.git'))) {
      return { hash: null, committed: false };
    }

    await runGit(workspacePath, ['add', '-A']);
    const { stdout: status } = await runGit(workspacePath, ['status', '--porcelain']);
    if (!status) {
      return { hash: await this.getHeadCommit(workspacePath), committed: false };
    }

    await runGit(workspacePath, ['commit', '-m', message]);
    const hash = await this.getHeadCommit(workspacePath);
    return { hash, committed: true };
  }

  public async getDiff(workspacePath: string, fromCommit: string | null, toCommit: string | null): Promise<string> {
    if (!fs.existsSync(path.join(workspacePath, '.git'))) return '';
    try {
      if (fromCommit && toCommit && fromCommit !== toCommit) {
        const { stdout } = await runGit(workspacePath, ['diff', '--stat', '-p', fromCommit, toCommit]);
        return stdout;
      }
      if (toCommit) {
        const { stdout } = await runGit(workspacePath, ['show', '--stat', '-p', toCommit]);
        return stdout;
      }
      const { stdout } = await runGit(workspacePath, ['diff', 'HEAD']);
      return stdout;
    } catch (err) {
      return `Unable to generate diff: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * 1-click safe rollback of a task back to its pre-task checkpoint commit.
   * Restores the exact working tree of targetCommit and records a clean rollback commit
   * so history remains auditable and recoverable.
   */
  public async rollbackToCommit(
    workspacePath: string,
    targetCommit: string,
    reason: string
  ): Promise<{ hash: string | null; restoredFrom: string }> {
    if (!fs.existsSync(path.join(workspacePath, '.git'))) {
      throw new Error('Workspace is not a Git repository');
    }

    // Ensure target commit exists
    await runGit(workspacePath, ['rev-parse', '--verify', targetCommit]);

    // Clean working tree to exact snapshot of targetCommit without rewriting pushed history
    await runGit(workspacePath, ['rm', '-rf', '--ignore-unmatch', '.']);
    await runGit(workspacePath, ['checkout', targetCommit, '--', '.']);
    await runGit(workspacePath, ['add', '-A']);

    const { stdout: status } = await runGit(workspacePath, ['status', '--porcelain']);
    if (status) {
      await runGit(workspacePath, ['commit', '-m', `revert: rollback to ${targetCommit.slice(0, 7)} (${reason})`]);
    }
    const newHead = await this.getHeadCommit(workspacePath);
    return { hash: newHead, restoredFrom: targetCommit };
  }

  public async listRecentCommits(workspacePath: string, limit = 25): Promise<GitCommitInfo[]> {
    if (!fs.existsSync(path.join(workspacePath, '.git'))) return [];
    try {
      const { stdout } = await runGit(workspacePath, [
        'log',
        `-${limit}`,
        '--pretty=format:%H|%h|%s|%cI',
      ]);
      if (!stdout) return [];
      return stdout.split(/\r?\n/).map((line) => {
        const [hash, shortHash, subject, date] = line.split('|');
        return { hash, shortHash, subject, date };
      });
    } catch {
      return [];
    }
  }

  public async createReleaseTag(workspacePath: string, tagName: string, message: string): Promise<string> {
    const cleanTag = tagName.replace(/[^a-zA-Z0-9._-]/g, '');
    await runGit(workspacePath, ['tag', '-a', cleanTag, '-m', message]);
    return cleanTag;
  }
}

