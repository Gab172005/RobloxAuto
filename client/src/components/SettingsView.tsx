import { CheckCircle2, Cpu, KeyRound, Monitor, Plug, Save, Wrench } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { AgentDefinition, BridgeDiagnostics, StudioSettings } from '../types';

interface SettingsViewProps {
  agents: AgentDefinition[];
  settings: StudioSettings;
  diagnostics: BridgeDiagnostics | null;
  onSettingsUpdated: (next: StudioSettings) => void;
  onRefreshDiagnostics: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  agents,
  settings,
  diagnostics,
  onSettingsUpdated,
  onRefreshDiagnostics,
}) => {
  const [draft, setDraft] = useState<StudioSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // MCP Helper state
  const [includeBlender, setIncludeBlender] = useState(false);
  const [mcpPreview, setMcpPreview] = useState<{
    targetPath: string;
    snippet: Record<string, unknown>;
    instructions: string[];
  } | null>(null);

  // Local Open Cloud .env state
  const [openCloudKey, setOpenCloudKey] = useState('');
  const [universeId, setUniverseId] = useState(diagnostics?.openCloud.defaultUniverseId || '');
  const [testPlaceId, setTestPlaceId] = useState(diagnostics?.openCloud.testPlaceId || '');
  const [prodPlaceId, setProdPlaceId] = useState(diagnostics?.openCloud.prodPlaceId || '');

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    api.previewMcpConfig(includeBlender).then(setMcpPreview).catch(() => {});
  }, [includeBlender]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateSettings(draft);
      onSettingsUpdated(res.settings);
      setNotice('Studio orchestrator & model routing settings saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyMcp = async () => {
    setSaving(true);
    try {
      const res = await api.applyMcpConfig({ includeBlender });
      await onRefreshDiagnostics();
      setNotice(
        `Applied Roblox_Studio MCP config to ${res.settingsPath}${res.backupPath ? ` (backup: ${res.backupPath})` : ''}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOpenCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.saveOpenCloud({
        apiKey: openCloudKey || undefined,
        defaultUniverseId: universeId,
        testPlaceId,
        prodPlaceId,
      });
      setOpenCloudKey('');
      await onRefreshDiagnostics();
      setNotice(res.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white">Studio Settings, Model Routing &amp; Bridge Config</h1>
        <p className="text-xs text-slate-400">
          Configure Gemini CLI per-agent model tiers, parallel concurrency, Roblox Studio MCP, and local-only Open Cloud credentials.
        </p>
      </div>

      {notice && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {notice}
          </span>
          <button onClick={() => setNotice(null)} className="text-emerald-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Orchestrator & Gemini Model Routing */}
      <form onSubmit={handleSaveSettings} className="studio-panel p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            Gemini CLI Model Routing &amp; Factory Controls
          </h2>
          <button type="submit" disabled={saving} className="studio-btn-primary text-xs">
            <Save className="w-3.5 h-3.5" /> Save Settings
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Pro Tier Model (Lead, Architect, Builder, Reviewer, Merchant)</label>
            <input
              className="studio-input font-mono"
              value={draft.proModel}
              onChange={(e) => setDraft({ ...draft, proModel: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Fast Tier Model (Pulse, Frame, Scenic, QA, Splash, AudioVFX)</label>
            <input
              className="studio-input font-mono"
              value={draft.fastModel}
              onChange={(e) => setDraft({ ...draft, fastModel: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Max Parallel Agents (Default 3)</label>
            <input
              type="number"
              min={1}
              max={8}
              className="studio-input"
              value={draft.maxParallelAgents}
              onChange={(e) => setDraft({ ...draft, maxParallelAgents: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Auto-QA Max Retries (Default 2)</label>
            <input
              type="number"
              min={0}
              max={5}
              className="studio-input"
              value={draft.maxQaRetries}
              onChange={(e) => setDraft({ ...draft, maxQaRetries: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">USD → PHP Exchange Rate</label>
            <input
              type="number"
              step="0.5"
              className="studio-input"
              value={draft.usdToPhpRate}
              onChange={(e) => setDraft({ ...draft, usdToPhpRate: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col justify-center gap-2 pt-2">
            <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.autoQaLoop}
                onChange={(e) => setDraft({ ...draft, autoQaLoop: e.target.checked })}
              />
              Auto-trigger Playtest + KidTester + Reviewer after builds
            </label>
            <label className="inline-flex items-center gap-2 text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.dryRunMode}
                onChange={(e) => setDraft({ ...draft, dryRunMode: e.target.checked })}
              />
              Dry-Run Simulation Mode (test DAG &amp; Review Queue without invoking Gemini CLI)
            </label>
          </div>
        </div>

        {/* Per-Agent Optional Model Overrides */}
        <div>
          <div className="text-xs font-semibold text-slate-300 mb-2">
            Per-Agent Model Overrides (leave blank to use agent&apos;s Pro/Fast tier default)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-2 bg-studio-card border border-studio-border rounded-lg px-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                <span className="text-xs font-medium text-slate-200 w-20 shrink-0">{a.id}</span>
                <input
                  placeholder={a.modelTier === 'pro' ? draft.proModel : draft.fastModel}
                  value={draft.agentModelOverrides[a.id] || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      agentModelOverrides: { ...draft.agentModelOverrides, [a.id]: e.target.value },
                    })
                  }
                  className="bg-transparent text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none flex-1"
                />
              </div>
            ))}
          </div>
        </div>
      </form>

      {/* Roblox Studio MCP Config Helper */}
      <div className="studio-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Plug className="w-4 h-4 text-emerald-400" />
              Roblox Studio Built-In MCP Config Helper (~/.gemini/settings.json)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Status:{' '}
              {diagnostics?.mcp.robloxStudioConfigured ? (
                <span className="text-emerald-300 font-semibold">Roblox_Studio MCP detected</span>
              ) : (
                <span className="text-amber-300 font-semibold">Not configured yet</span>
              )}{' '}
              • Existing MCP servers: {diagnostics?.mcp.configuredServers.join(', ') || 'None'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBlender}
                onChange={(e) => setIncludeBlender(e.target.checked)}
              />
              Include optional Blender MCP
            </label>
            <button onClick={() => void handleApplyMcp()} disabled={saving} className="studio-btn-primary text-xs">
              <Wrench className="w-3.5 h-3.5" />
              1-Click Merge into ~/.gemini/settings.json
            </button>
          </div>
        </div>

        {mcpPreview && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-cyan-200 overflow-auto">
              {JSON.stringify(mcpPreview.snippet, null, 2)}
            </pre>
            <div className="studio-card p-3.5 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-white mb-1">Studio Quick Connect &amp; Open Cloud Setup</div>
              {mcpPreview.instructions.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Optional Local Open Cloud Credentials */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={handleSaveOpenCloud} className="studio-panel p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              Optional Roblox Open Cloud (.env Local Only)
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
              Never Sent to Prompts
            </span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Open Cloud API Key {diagnostics?.openCloud.apiKeyConfigured && '(Currently Configured)'}
              </label>
              <input
                type="password"
                className="studio-input font-mono"
                placeholder="Leave blank to keep existing key..."
                value={openCloudKey}
                onChange={(e) => setOpenCloudKey(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Universe ID</label>
                <input className="studio-input font-mono" value={universeId} onChange={(e) => setUniverseId(e.target.value)} />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Test Place ID</label>
                <input className="studio-input font-mono" value={testPlaceId} onChange={(e) => setTestPlaceId(e.target.value)} />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Prod Place ID</label>
                <input className="studio-input font-mono" value={prodPlaceId} onChange={(e) => setProdPlaceId(e.target.value)} />
              </div>
            </div>
          </div>
          <button type="submit" disabled={saving} className="studio-btn-secondary text-xs">
            <Save className="w-3.5 h-3.5" /> Save to Local .env
          </button>
        </form>

        <div className="studio-panel p-5 space-y-3 text-xs">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-cyan-400" />
            Desktop Shell &amp; Local Toolchain Status
          </h2>
          <div className="space-y-1.5 text-slate-300">
            <div>
              • <strong>Gemini CLI</strong>: {diagnostics?.geminiCli.installed ? diagnostics.geminiCli.version : 'Not found'} (Auth:{' '}
              {diagnostics?.geminiCli.authType || 'local'})
            </div>
            <div>
              • <strong>Git</strong>: {diagnostics?.tools.git.installed ? diagnostics.tools.git.version : 'Not found'}
            </div>
            <div>
              • <strong>Rojo</strong>:{' '}
              {diagnostics?.tools.rojo.installed
                ? diagnostics.tools.rojo.version
                : 'Not installed (install via rokit/aftman for live Rojo Studio sync)'}
            </div>
            <div>
              • <strong>FFmpeg</strong>:{' '}
              {diagnostics?.tools.ffmpeg.installed
                ? 'Installed (9:16 MP4 rendering enabled)'
                : 'Not installed (storyboard fallback active — install via `winget install Gyan.FFmpeg`)'}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
            <div className="text-slate-500"># Launch in browser:</div>
            <div>npm run dev</div>
            <div className="text-slate-500 pt-1"># Launch native Electron Desktop shell alongside Roblox Studio:</div>
            <div>npm run electron:dev</div>
          </div>
        </div>
      </div>
    </div>
  );
};

