import {
  CheckSquare,
  FolderTree,
  GitBranch,
  Home,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  Terminal,
  TrendingUp,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { api, createStudioWebSocket } from './api';
import { ExplorerAssetsView } from './components/ExplorerAssetsView';
import { LeadChatView } from './components/LeadChatView';
import { MarketView } from './components/MarketView';
import { PortfolioView } from './components/PortfolioView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { SettingsView } from './components/SettingsView';
import { TasksView } from './components/TasksView';
import { TerminalView } from './components/TerminalView';
import type {
  AgentLiveStatus,
  AgentRegistry,
  AgentStreamEvent,
  BridgeDiagnostics,
  ChatMessageRecord,
  ExplorerRef,
  NavTab,
  ProjectRecord,
  ProjectStage,
  RevenueSimResult,
  ReviewItemRecord,
  StudioSettings,
  TaskRecord,
} from './types';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'portfolio', label: 'Portfolio & Home', icon: Home },
  { id: 'chat', label: 'Chat with Lead', icon: MessageSquare },
  { id: 'market', label: 'Market & Review', icon: TrendingUp },
  { id: 'tasks', label: 'Tasks (DAG)', icon: GitBranch },
  { id: 'reviews', label: 'Review Queue', icon: CheckSquare },
  { id: 'terminal', label: 'Live Terminal', icon: Terminal },
  { id: 'explorer', label: 'Explorer & Assets', icon: FolderTree },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('portfolio');
  const [wsConnected, setWsConnected] = useState(false);

  const [diagnostics, setDiagnostics] = useState<BridgeDiagnostics | null>(null);
  const [registry, setRegistry] = useState<AgentRegistry | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentLiveStatus>>({});
  const [settings, setSettings] = useState<StudioSettings | null>(null);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessageRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewItemRecord[]>([]);
  const [logs, setLogs] = useState<AgentStreamEvent[]>([]);

  const [explorerRefs, setExplorerRefs] = useState<ExplorerRef[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [rojoBusy, setRojoBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // New Game Project Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGenre, setNewGenre] = useState('Tycoon-Simulator Hybrid');
  const [newPitch, setNewPitch] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const pendingReviewCount = reviews.filter((r) => r.status === 'pending').length;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((curr) => (curr === msg ? null : curr)), 4500);
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    const d = await api.getDiagnostics();
    setDiagnostics(d);
  }, []);

  const loadProjectData = useCallback(async (projectId: string) => {
    const [chatRes, tasksRes, reviewsRes, logsRes] = await Promise.all([
      api.listChat(projectId),
      api.listTasks(projectId),
      api.listReviews(projectId),
      api.listLogs(projectId),
    ]);
    setChatMessages(chatRes.messages);
    setTasks(tasksRes.tasks);
    setReviews(reviewsRes.reviews);
    setLogs(logsRes.logs);
  }, []);

  // Initial bootstrap load
  useEffect(() => {
    Promise.all([
      api.getDiagnostics(),
      api.getAgents(),
      api.getSettings(),
      api.listProjects(),
      api.listReviews(),
    ])
      .then(([diag, agentData, setRes, projRes, revRes]) => {
        setDiagnostics(diag);
        setRegistry(agentData.registry);
        setAgentStatuses(agentData.statuses);
        setSettings(setRes.settings);
        setProjects(projRes.projects);
        setReviews(revRes.reviews);
        if (projRes.projects.length > 0) {
          setActiveProjectId(projRes.projects[0].id);
        }
      })
      .catch((err) => showToast(`Backend connection error: ${err.message}`));
  }, [showToast]);

  useEffect(() => {
    if (activeProjectId) {
      void loadProjectData(activeProjectId);
    }
  }, [activeProjectId, loadProjectData]);

  // Live WebSocket stream
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      ws = createStudioWebSocket((msg) => {
        if (msg.type === 'hello') {
          const payload = msg.payload as { agentStatuses?: Record<string, AgentLiveStatus> };
          if (payload.agentStatuses) setAgentStatuses(payload.agentStatuses);
        } else if (msg.type === 'agent_status') {
          const p = msg.payload as { agentId: string; status: 'idle' | 'working' | 'review'; taskId?: string; taskTitle?: string };
          setAgentStatuses((prev) => ({ ...prev, [p.agentId]: { status: p.status, taskId: p.taskId, taskTitle: p.taskTitle } }));
        } else if (msg.type === 'agent_stream') {
          const evt = msg.payload as AgentStreamEvent;
          setLogs((prev) => [...prev.slice(-450), evt]);
        } else if (msg.type === 'task_updated') {
          const t = msg.payload as TaskRecord;
          setTasks((prev) => {
            const idx = prev.findIndex((item) => item.id === t.id);
            if (idx === -1) return [...prev, t];
            const copy = [...prev];
            copy[idx] = t;
            return copy;
          });
        } else if (msg.type === 'review_updated') {
          const r = msg.payload as ReviewItemRecord;
          setReviews((prev) => {
            const idx = prev.findIndex((item) => item.id === r.id);
            if (idx === -1) return [r, ...prev];
            const copy = [...prev];
            copy[idx] = r;
            return copy;
          });
        } else if (msg.type === 'chat_message') {
          const m = msg.payload as ChatMessageRecord;
          setChatMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        } else if (msg.type === 'project_updated') {
          const p = msg.payload as ProjectRecord;
          setProjects((prev) => {
            const idx = prev.findIndex((x) => x.id === p.id);
            if (idx === -1) return [p, ...prev];
            const copy = [...prev];
            copy[idx] = p;
            return copy;
          });
        } else if (msg.type === 'rojo_status') {
          void refreshDiagnostics();
        }
      });

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [refreshDiagnostics]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await api.createProject({ name: newName.trim(), genre: newGenre, pitch: newPitch });
      setProjects((prev) => [res.project, ...prev]);
      setActiveProjectId(res.project.id);
      setShowNewModal(false);
      setNewName('');
      setNewPitch('');
      showToast(`Created Git + Rojo workspace: workspace/${res.project.slug}/`);
      setActiveTab('chat');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingProject(false);
    }
  };

  const handleToggleRojo = async () => {
    if (!diagnostics) return;
    setRojoBusy(true);
    try {
      if (diagnostics.tools.rojo.serving) {
        await api.stopRojo();
        showToast('Stopped rojo serve');
      } else {
        if (!activeProjectId) {
          showToast('Select or create a project first before starting Rojo.');
          return;
        }
        await api.startRojo(activeProjectId, 34872);
        showToast('Started rojo serve on port 34872');
      }
      await refreshDiagnostics();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setRojoBusy(false);
    }
  };

  const handleSendChat = async (message: string) => {
    if (!activeProjectId) return;
    setChatSending(true);
    try {
      const res = await api.sendChat(activeProjectId, message, explorerRefs);
      setExplorerRefs([]);
      if (res.spawnedTasks.length > 0) {
        showToast(`Lead dispatched ${res.spawnedTasks.length} specialist tasks to the DAG!`);
        const tRes = await api.listTasks(activeProjectId);
        setTasks(tRes.tasks);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setChatSending(false);
    }
  };

  const handleLaunchQuickPipeline = async (templateId: string, projectIdOverride?: string) => {
    const pid = projectIdOverride || activeProjectId;
    if (!pid) return;
    try {
      const res = await api.launchQuickPipeline(pid, templateId);
      const tRes = await api.listTasks(pid);
      setTasks(tRes.tasks);
      showToast(`Pipeline launched (${res.tasks.length} tasks queued)!`);
      setActiveTab('tasks');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateStage = async (projectId: string, stage: ProjectStage) => {
    const res = await api.updateProject(projectId, { stage });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? res.project : p)));
  };

  const handleApplyKpis = async (projectId: string, sim: RevenueSimResult) => {
    const base = sim.scenarios[1];
    const res = await api.updateProject(projectId, {
      kpis: {
        ccu: base.estimatedCcu,
        dau: base.dau,
        d1Retention: sim.inputs.d1RetentionPct,
        d7Retention: sim.inputs.d7RetentionPct,
        d30Retention: sim.inputs.d30RetentionPct,
        payerPercent: sim.inputs.payerConversionPct,
        arppuRobux: sim.inputs.arppuRobux,
        estimatedMonthlyUsd: base.monthlyUsd,
        estimatedMonthlyPhp: base.monthlyPhp,
      },
    });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? res.project : p)));
    showToast(`Saved Base projection ($${base.monthlyUsd.toLocaleString()}/mo) to ${res.project.name}`);
  };

  return (
    <div className="min-h-screen flex bg-studio-bg text-slate-100">
      {/* Persistent Left Sidebar */}
      <aside className="w-60 shrink-0 border-r border-studio-border bg-[#0b0f1b] flex flex-col justify-between">
        <div>
          <div className="h-14 px-4 border-b border-studio-border flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-indigo-500/20">
              RF
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-none">RoForge Studio</div>
              <div className="text-[10px] text-indigo-300 font-mono mt-0.5">ROBLOX GAME FACTORY</div>
            </div>
          </div>

          <nav className="p-2.5 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {item.id === 'reviews' && pendingReviewCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
                      {pendingReviewCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-studio-border text-[11px] text-slate-500 space-y-1">
          <div className="flex items-center justify-between">
            <span>WebSocket Stream</span>
            <span className={`inline-flex items-center gap-1 ${wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {wsConnected ? 'Live' : 'Reconnecting'}
            </span>
          </div>
          {settings?.dryRunMode && (
            <div className="px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] text-center font-medium">
              DRY-RUN SIMULATION ACTIVE
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bridge Status Bar */}
        <header className="h-14 border-b border-studio-border bg-[#0d1221]/95 backdrop-blur px-4 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <select
              value={activeProjectId || ''}
              onChange={(e) => setActiveProjectId(e.target.value || null)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white max-w-[220px]"
            >
              {projects.length === 0 ? (
                <option value="">No Active Project</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.stage})
                  </option>
                ))
              )}
            </select>
            <button onClick={() => setShowNewModal(true)} className="studio-btn-secondary text-xs py-1.5 px-2.5">
              <Plus className="w-3.5 h-3.5" /> New Game
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs overflow-x-auto">
            {/* Gemini CLI Auth Pill */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border shrink-0 ${
                diagnostics?.geminiCli.installed
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  diagnostics?.geminiCli.installed ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              Gemini CLI {diagnostics?.geminiCli.version ? `v${diagnostics.geminiCli.version}` : 'Offline'}
            </button>

            {/* Studio MCP Status Pill */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border shrink-0 ${
                diagnostics?.mcp.robloxStudioConfigured
                  ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <Radio className="w-3 h-3" />
              Studio MCP: {diagnostics?.mcp.robloxStudioConfigured ? 'Configured' : 'Setup'}
            </button>

            {/* Rojo Serve Toggle */}
            <button
              disabled={rojoBusy}
              onClick={() => void handleToggleRojo()}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium shrink-0 transition ${
                diagnostics?.tools.rojo.serving
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
              title={diagnostics?.tools.rojo.installed ? 'Toggle rojo serve' : 'Rojo CLI not installed locally'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  diagnostics?.tools.rojo.serving ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              {diagnostics?.tools.rojo.serving
                ? `Rojo :${diagnostics.tools.rojo.port}`
                : diagnostics?.tools.rojo.installed
                  ? 'Rojo: Start'
                  : 'Rojo: Missing'}
            </button>

            <button
              onClick={() => void refreshDiagnostics()}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"
              title="Refresh Bridge Diagnostics"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Main Active View */}
        <main className="flex-1 p-5 overflow-y-auto">
          {toast && (
            <div className="mb-4 p-3 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-xs text-indigo-100 flex items-center justify-between">
              <span>{toast}</span>
              <button onClick={() => setToast(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'portfolio' && (
            <PortfolioView
              projects={projects}
              activeProjectId={activeProjectId}
              agents={registry?.agents || []}
              agentStatuses={agentStatuses}
              reviews={reviews}
              onSelectProject={setActiveProjectId}
              onOpenNewProjectModal={() => setShowNewModal(true)}
              onUpdateStage={(id, st) => void handleUpdateStage(id, st)}
              onLaunchFactory={(pid) => void handleLaunchQuickPipeline('full_game_factory', pid)}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'chat' && (
            <LeadChatView
              project={activeProject}
              messages={chatMessages}
              tasks={tasks}
              explorerRefs={explorerRefs}
              sending={chatSending}
              onRemoveExplorerRef={(rp) => setExplorerRefs((prev) => prev.filter((x) => x.robloxPath !== rp))}
              onSendMessage={handleSendChat}
              onLaunchQuickPipeline={(tpl) => handleLaunchQuickPipeline(tpl)}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'market' && (
            <MarketView
              project={activeProject}
              usdToPhpRate={settings?.usdToPhpRate || 58}
              onApplyKpisToProject={handleApplyKpis}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksView
              project={activeProject}
              tasks={tasks}
              agents={registry?.agents || []}
              onLaunchQuickPipeline={(tpl) => handleLaunchQuickPipeline(tpl)}
              onRefreshTasks={async () => {
                if (activeProjectId) {
                  const tRes = await api.listTasks(activeProjectId);
                  setTasks(tRes.tasks);
                }
              }}
            />
          )}

          {activeTab === 'reviews' && (
            <ReviewQueueView
              project={activeProject}
              reviews={reviews}
              ffmpegInstalled={Boolean(diagnostics?.tools.ffmpeg.installed)}
              onRefreshReviews={async () => {
                const rRes = await api.listReviews(activeProjectId || undefined);
                setReviews(rRes.reviews);
              }}
            />
          )}

          {activeTab === 'terminal' && (
            <TerminalView
              agents={registry?.agents || []}
              logs={logs}
              onClearLogs={() => setLogs([])}
            />
          )}

          {activeTab === 'explorer' && (
            <ExplorerAssetsView
              project={activeProject}
              registry={registry}
              onRegistrySaved={setRegistry}
              onSendRefToLead={(ref) =>
                setExplorerRefs((prev) => (prev.some((x) => x.robloxPath === ref.robloxPath) ? prev : [...prev, ref]))
              }
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'settings' && settings && (
            <SettingsView
              agents={registry?.agents || []}
              settings={settings}
              diagnostics={diagnostics}
              onSettingsUpdated={setSettings}
              onRefreshDiagnostics={refreshDiagnostics}
            />
          )}
        </main>
      </div>

      {/* New Game Factory Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form onSubmit={handleCreateProject} className="studio-panel w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Create New Roblox Game Workspace</h2>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Game Title</label>
                <input
                  className="studio-input"
                  placeholder="e.g., Abyssal Digging Tycoon"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Genre / Archetype</label>
                <select className="studio-input" value={newGenre} onChange={(e) => setNewGenre(e.target.value)}>
                  <option>Tycoon-Simulator Hybrid</option>
                  <option>RNG Collector + Base Flex</option>
                  <option>Incremental Digging / Fishing</option>
                  <option>Co-op Extraction / Escape Chaos</option>
                  <option>Auto-Battle Merge Simulator</option>
                  <option>Tower Defense</option>
                  <option>Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">1-Sentence Pitch &amp; Monetization Hook</label>
                <textarea
                  rows={3}
                  className="studio-input"
                  placeholder="Dig through glowing neon layers with friends, pull giant mythic relics, trigger 2x Server Meteor Events..."
                  value={newPitch}
                  onChange={(e) => setNewPitch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowNewModal(false)} className="studio-btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={creatingProject} className="studio-btn-primary">
                {creatingProject ? 'Scaffolding Git + Rojo...' : 'Create Game Workspace'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
export default App;

