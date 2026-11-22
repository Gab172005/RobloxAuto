import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AgentStreamEvent, ApprovalMode, GeminiStreamEventType } from '../types.js';

export interface GeminiRunRequest {
  runId?: string;
  projectId: string;
  taskId: string | null;
  agentId: string;
  cwd: string;
  prompt: string;
  model?: string;
  approvalMode: ApprovalMode;
  allowedMcpServers?: string[];
  includeDirectories?: string[];
  timeoutMs?: number;
  maxRetries?: number;
  dryRun?: boolean;
}

export interface GeminiRunResult {
  runId: string;
  success: boolean;
  exitCode: number;
  outputText: string;
  tokensIn: number;
  tokensOut: number;
  elapsedMs: number;
  events: AgentStreamEvent[];
  error?: string;
}

/**
 * Known Gemini CLI headless exit codes verified in SPEC Step 0:
 * 0  = success
 * 1  = general / runtime error
 * 42 = input / prompt / validation error
 * 53 = max turns / execution limit exceeded
 */
export function describeGeminiExitCode(code: number): string {
  switch (code) {
    case 0:
      return 'Success';
    case 1:
      return 'General CLI/API runtime error (exit 1)';
    case 42:
      return 'Invalid input or configuration error (exit 42)';
    case 53:
      return 'Turn or session limit reached (exit 53)';
    default:
      return `Process exited with code ${code}`;
  }
}

/**
 * Headless Gemini CLI Runner using ONLY verified flags from Step 0 `gemini --help`:
 *   -p, --prompt
 *   -o, --output-format stream-json
 *   -m, --model
 *   --approval-mode <default|auto_edit|yolo|plan>
 *   --allowed-mcp-server-names <name...>
 *   --include-directories <dir...>
 *   --skip-trust
 */
export class GeminiRunner extends EventEmitter {
  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledRuns = new Set<string>();
  private maxConcurrent = 3;
  private runningCount = 0;
  private waitQueue: Array<() => void> = [];

  public setMaxConcurrent(limit: number): void {
    this.maxConcurrent = Math.max(1, Math.min(10, Math.floor(limit)));
    this.drainQueue();
  }

  public getActiveRunIds(): string[] {
    return Array.from(this.activeProcesses.keys());
  }

  public cancelRun(runId: string): boolean {
    this.cancelledRuns.add(runId);
    const child = this.activeProcesses.get(runId);
    if (!child) return false;

    try {
      if (process.platform === 'win32' && child.pid) {
        // Kill process tree cleanly on Windows so cmd.exe wrapper + node child both terminate
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      // Ignore already exited
    }
    this.activeProcesses.delete(runId);
    return true;
  }

  public cancelAll(): void {
    for (const runId of this.activeProcesses.keys()) {
      this.cancelRun(runId);
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.runningCount < this.maxConcurrent) {
      this.runningCount++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.runningCount++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.runningCount = Math.max(0, this.runningCount - 1);
    this.drainQueue();
  }

  private drainQueue(): void {
    while (this.runningCount < this.maxConcurrent && this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }

  /**
   * Builds the exact CLI argument vector using ONLY verified `gemini --help` flags.
   * Prompt body itself is piped via stdin to avoid OS arg-length overflow and Windows shell quoting hazards.
   */
  public buildCliArgs(req: GeminiRunRequest): string[] {
    const args: string[] = [
      '-p',
      'Execute the full instructions provided on stdin.',
      '-o',
      'stream-json',
      '--skip-trust',
      '--approval-mode',
      req.approvalMode,
    ];

    if (req.model && req.model.trim().length > 0) {
      args.push('-m', req.model.trim());
    }

    if (req.allowedMcpServers && req.allowedMcpServers.length > 0) {
      args.push('--allowed-mcp-server-names', ...req.allowedMcpServers);
    }

    if (req.includeDirectories && req.includeDirectories.length > 0) {
      args.push('--include-directories', ...req.includeDirectories);
    }

    return args;
  }

  public async run(req: GeminiRunRequest): Promise<GeminiRunResult> {
    const runId = req.runId || randomUUID();
    const maxRetries = req.maxRetries ?? 1;

    if (req.dryRun) {
      return this.runSimulated(runId, req);
    }

    await this.acquireSlot();
    try {
      let lastResult: GeminiRunResult | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (this.cancelledRuns.has(runId)) {
          return {
            runId,
            success: false,
            exitCode: 1,
            outputText: '',
            tokensIn: 0,
            tokensOut: 0,
            elapsedMs: 0,
            events: [],
            error: 'Run cancelled by user',
          };
        }

        if (attempt > 0) {
          const delayMs = Math.min(8000, 1500 * Math.pow(2, attempt - 1));
          this.emitEvent({
            id: randomUUID(),
            projectId: req.projectId,
            taskId: req.taskId,
            agentId: req.agentId,
            type: 'system',
            timestamp: new Date().toISOString(),
            content: `Retrying Gemini CLI execution (attempt ${attempt + 1}/${maxRetries + 1}) after ${delayMs}ms backoff...`,
          });
          await new Promise((r) => setTimeout(r, delayMs));
        }

        lastResult = await this.executeOnce(runId, req);
        // Do not retry deterministic input errors (42) or user cancellations
        if (lastResult.success || lastResult.exitCode === 42 || this.cancelledRuns.has(runId)) {
          return lastResult;
        }
      }
      return lastResult!;
    } finally {
      this.cancelledRuns.delete(runId);
      this.releaseSlot();
    }
  }

  private emitEvent(event: AgentStreamEvent): void {
    this.emit('stream', event);
  }

  private async runSimulated(runId: string, req: GeminiRunRequest): Promise<GeminiRunResult> {
    const start = Date.now();
    const events: AgentStreamEvent[] = [];
    const push = (type: GeminiStreamEventType, content: string, extra?: Partial<AgentStreamEvent>) => {
      const evt: AgentStreamEvent = {
        id: randomUUID(),
        projectId: req.projectId,
        taskId: req.taskId,
        agentId: req.agentId,
        type,
        timestamp: new Date().toISOString(),
        content,
        ...extra,
      };
      events.push(evt);
      this.emitEvent(evt);
    };

    push('init', `[Dry-Run] Initialized ${req.agentId} (${req.model || 'default'})`);
    await new Promise((r) => setTimeout(r, 80));
    const summary = `[Dry-Run Completed] ${req.agentId} processed task successfully in ${req.cwd}.`;
    push('message', summary);
    push('result', summary, { tokensIn: 180, tokensOut: 95, exitCode: 0 });

    return {
      runId,
      success: true,
      exitCode: 0,
      outputText: summary,
      tokensIn: 180,
      tokensOut: 95,
      elapsedMs: Date.now() - start,
      events,
    };
  }

  private executeOnce(runId: string, req: GeminiRunRequest): Promise<GeminiRunResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const args = this.buildCliArgs(req);
      const events: AgentStreamEvent[] = [];
      const messageChunks: string[] = [];
      let tokensIn = 0;
      let tokensOut = 0;
      let stderrBuffer = '';
      let stdoutRemainder = '';
      let timedOut = false;

      const recordEvent = (evt: AgentStreamEvent) => {
        events.push(evt);
        this.emitEvent(evt);
      };

      recordEvent({
        id: randomUUID(),
        projectId: req.projectId,
        taskId: req.taskId,
        agentId: req.agentId,
        type: 'system',
        timestamp: new Date().toISOString(),
        content: `Spawning gemini CLI (${req.model || 'account-default'}, approval=${req.approvalMode}) in ${req.cwd}`,
      });

      const isWin = process.platform === 'win32';
      const spawnBin = isWin ? process.env.ComSpec || 'cmd.exe' : 'gemini';
      const spawnArgs = isWin ? ['/d', '/c', 'gemini.cmd', ...args] : args;
      const child = spawn(spawnBin, spawnArgs, {
        cwd: req.cwd,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          // Explicitly strip Open Cloud API key from agent subprocess environment!
          ROBLOX_OPEN_CLOUD_API_KEY: '',
        },
      });

      this.activeProcesses.set(runId, child);

      const timeoutMs = req.timeoutMs ?? 5 * 60 * 1000;
      const timer = setTimeout(() => {
        timedOut = true;
        this.cancelRun(runId);
      }, timeoutMs);

      const processLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;

        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          // Non-JSON line (e.g. CLI status banner); emit as system text
          recordEvent({
            id: randomUUID(),
            projectId: req.projectId,
            taskId: req.taskId,
            agentId: req.agentId,
            type: 'system',
            timestamp: new Date().toISOString(),
            content: line,
          });
          return;
        }

        const rawType = String(parsed.type || 'message');
        const type: GeminiStreamEventType =
          rawType === 'init' ||
          rawType === 'message' ||
          rawType === 'tool_use' ||
          rawType === 'tool_result' ||
          rawType === 'error' ||
          rawType === 'result'
            ? rawType
            : 'message';

        // Extract text content across Gemini CLI stream-json event shapes
        let content = '';
        let toolName: string | undefined;

        if (type === 'init') {
          const modelStr = parsed.model ? String(parsed.model) : req.model || 'default';
          const sessionStr = parsed.session_id ? ` session=${String(parsed.session_id).slice(0, 8)}` : '';
          content = `Session initialized (model=${modelStr}${sessionStr})`;
        } else if (type === 'message') {
          const role = String(parsed.role || 'assistant');
          const text = typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content ?? '');
          if (role === 'assistant' && text) {
            messageChunks.push(text);
          }
          content = text;
        } else if (type === 'tool_use') {
          toolName = String(parsed.tool_name || parsed.name || 'tool');
          const params = parsed.parameters ?? parsed.input ?? {};
          content = `Tool call: ${toolName}(${JSON.stringify(params).slice(0, 300)})`;
        } else if (type === 'tool_result') {
          toolName = parsed.tool_name ? String(parsed.tool_name) : undefined;
          const status = parsed.status ? `[${String(parsed.status)}] ` : '';
          const output =
            typeof parsed.output === 'string'
              ? parsed.output
              : JSON.stringify(parsed.output ?? parsed.result ?? '').slice(0, 400);
          content = `${status}${output}`;
        } else if (type === 'error') {
          content = String(parsed.message || parsed.error || JSON.stringify(parsed));
        } else if (type === 'result') {
          const stats = (parsed.stats || {}) as Record<string, unknown>;
          const inTok = Number(stats.input_tokens ?? stats.prompt_tokens ?? parsed.input_tokens ?? 0);
          const outTok = Number(stats.output_tokens ?? stats.completion_tokens ?? parsed.output_tokens ?? 0);
          if (Number.isFinite(inTok) && inTok > 0) tokensIn = inTok;
          if (Number.isFinite(outTok) && outTok > 0) tokensOut = outTok;
          if (typeof parsed.response === 'string' && parsed.response.trim() && messageChunks.length === 0) {
            messageChunks.push(parsed.response);
          }
          content = `Result: ${String(parsed.status || 'done')} (in=${tokensIn}, out=${tokensOut})`;
        }

        recordEvent({
          id: randomUUID(),
          projectId: req.projectId,
          taskId: req.taskId,
          agentId: req.agentId,
          type,
          timestamp: new Date().toISOString(),
          content,
          toolName,
          tokensIn: type === 'result' ? tokensIn : undefined,
          tokensOut: type === 'result' ? tokensOut : undefined,
          raw: parsed,
        });
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutRemainder += chunk.toString('utf8');
        const lines = stdoutRemainder.split(/\r?\n/);
        stdoutRemainder = lines.pop() ?? '';
        for (const line of lines) {
          processLine(line);
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderrBuffer += text;
        const trimmed = text.trim();
        if (trimmed) {
          recordEvent({
            id: randomUUID(),
            projectId: req.projectId,
            taskId: req.taskId,
            agentId: req.agentId,
            type: 'system',
            timestamp: new Date().toISOString(),
            content: `[stderr] ${trimmed.slice(0, 600)}`,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(runId);
        const msg = `Failed to spawn gemini CLI: ${err.message}`;
        recordEvent({
          id: randomUUID(),
          projectId: req.projectId,
          taskId: req.taskId,
          agentId: req.agentId,
          type: 'error',
          timestamp: new Date().toISOString(),
          content: msg,
          exitCode: 1,
        });
        resolve({
          runId,
          success: false,
          exitCode: 1,
          outputText: messageChunks.join(''),
          tokensIn,
          tokensOut,
          elapsedMs: Date.now() - startTime,
          events,
          error: msg,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(runId);
        if (stdoutRemainder.trim()) {
          processLine(stdoutRemainder);
        }

        const exitCode = code ?? 1;
        const elapsedMs = Date.now() - startTime;
        const cancelled = this.cancelledRuns.has(runId);
        const success = exitCode === 0 && !timedOut && !cancelled;

        let error: string | undefined;
        if (timedOut) {
          error = `Gemini CLI timed out after ${Math.round(timeoutMs / 1000)}s`;
        } else if (cancelled) {
          error = 'Execution cancelled by user';
        } else if (exitCode !== 0) {
          error = `${describeGeminiExitCode(exitCode)}${stderrBuffer ? `: ${stderrBuffer.trim().slice(0, 400)}` : ''}`;
        }

        if (error) {
          recordEvent({
            id: randomUUID(),
            projectId: req.projectId,
            taskId: req.taskId,
            agentId: req.agentId,
            type: 'error',
            timestamp: new Date().toISOString(),
            content: error,
            exitCode,
          });
        }

        resolve({
          runId,
          success,
          exitCode,
          outputText: messageChunks.join(''),
          tokensIn,
          tokensOut,
          elapsedMs,
          events,
          error,
        });
      });

      // Pipe prompt safely via stdin and close stdin so headless CLI starts immediately
      if (child.stdin) {
        child.stdin.write(req.prompt, 'utf8');
        child.stdin.end();
      }
    });
  }
}

