import {
  Activity,
  CheckCircle2,
  Cpu,
  DollarSign,
  FolderPlus,
  Layers,
  Play,
  Rocket,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import React from 'react';
import type {
  AgentDefinition,
  AgentLiveStatus,
  NavTab,
  ProjectRecord,
  ProjectStage,
  ReviewItemRecord,
} from '../types';

interface PortfolioViewProps {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  agents: AgentDefinition[];
  agentStatuses: Record<string, AgentLiveStatus>;
  reviews: ReviewItemRecord[];
  onSelectProject: (id: string) => void;
  onOpenNewProjectModal: () => void;
  onUpdateStage: (id: string, stage: ProjectStage) => void;
  onLaunchFactory: (projectId: string) => void;
  onNavigate: (tab: NavTab) => void;
}

const STAGE_META: Record<ProjectStage, { label: string; color: string }> = {
  idea: { label: 'Idea', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  building: { label: 'Building', color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  testing: { label: 'Testing', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  live: { label: 'Live', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

const STAGES: ProjectStage[] = ['idea', 'building', 'testing', 'live'];

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  projects,
  activeProjectId,
  agents,
  agentStatuses,
  reviews,
  onSelectProject,
  onOpenNewProjectModal,
  onUpdateStage,
  onLaunchFactory,
  onNavigate,
}) => {
  const totalMonthlyUsd = projects.reduce((sum, p) => sum + (p.kpis?.estimatedMonthlyUsd || 0), 0);
  const totalMonthlyPhp = projects.reduce((sum, p) => sum + (p.kpis?.estimatedMonthlyPhp || 0), 0);
  const pendingReviews = reviews.filter((r) => r.status === 'pending').length;
  const workingAgents = Object.values(agentStatuses).filter((s) => s.status === 'working').length;

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="studio-panel p-6 bg-gradient-to-br from-indigo-950/60 via-studio-surface to-slate-950 border-indigo-500/30 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 text-xs font-medium mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            15-Agent Autonomous Roblox Game Factory • Local Gemini CLI
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Studio Portfolio & Operations</h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Manage your portfolio from Idea Validation to DevEx Revenue. Zero extra API billing — all 15 specialists run through your locally authenticated Gemini CLI with Git checkpoints and Review Gates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button onClick={onOpenNewProjectModal} className="studio-btn-primary">
            <FolderPlus className="w-4 h-4" />
            New Game Factory
          </button>
          <button onClick={() => onNavigate('market')} className="studio-btn-secondary">
            <TrendingUp className="w-4 h-4" />
            Score Idea / DevEx Sim
          </button>
        </div>
      </div>

      {/* Studio KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="studio-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Portfolio Games</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{projects.length}</div>
          <div className="text-xs text-slate-400 mt-1">
            {projects.filter((p) => p.stage === 'live').length} Live •{' '}
            {projects.filter((p) => p.stage === 'building' || p.stage === 'testing').length} In Production
          </div>
        </div>

        <div className="studio-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Est. Monthly DevEx</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">
            ${totalMonthlyUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            ≈ ₱{totalMonthlyPhp.toLocaleString(undefined, { maximumFractionDigits: 0 })} PHP / mo
          </div>
        </div>

        <button
          onClick={() => onNavigate('reviews')}
          className="studio-card p-4 text-left hover:border-amber-500/50 transition"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pending Human Reviews</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300 mt-2">{pendingReviews}</div>
          <div className="text-xs text-slate-400 mt-1">Click to open approval inbox</div>
        </button>

        <button
          onClick={() => onNavigate('terminal')}
          className="studio-card p-4 text-left hover:border-cyan-500/50 transition"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Specialist Agents</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-300 mt-2">
            {workingAgents} <span className="text-sm font-normal text-slate-500">/ {agents.length}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Click to watch live CLI stream</div>
        </button>
      </div>

      {/* Multi-Game Portfolio Grid */}
      <div className="studio-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Rocket className="w-4 h-4 text-indigo-400" />
            Game Portfolio (Idea → Building → Testing → Live)
          </h2>
          <button onClick={onOpenNewProjectModal} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
            + Create Workspace
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="border border-dashed border-slate-700 rounded-xl p-10 text-center">
            <Rocket className="w-10 h-10 text-indigo-400 mx-auto mb-3 opacity-80" />
            <h3 className="text-white font-semibold">Launch your first income-generating Roblox game</h3>
            <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
              Create a Git-initialized Rojo project workspace to unlock Lead Chat, Market Validation, DAG Pipelines, and the Review Queue.
            </p>
            <button onClick={onOpenNewProjectModal} className="studio-btn-primary mt-4">
              <FolderPlus className="w-4 h-4" />
              Create First Game Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((p) => {
              const isSelected = p.id === activeProjectId;
              const stageInfo = STAGE_META[p.stage] || STAGE_META.idea;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className={`studio-card p-4 cursor-pointer transition ${
                    isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/40' : 'hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{p.name}</h3>
                        {isSelected && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {p.genre} • <span className="font-mono text-slate-500">{p.slug}</span>
                      </p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${stageInfo.color}`}>
                      {stageInfo.label}
                    </span>
                  </div>

                  {p.pitch && <p className="text-xs text-slate-300 mt-2.5 line-clamp-2">{p.pitch}</p>}

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800 text-xs">
                    <div>
                      <div className="text-slate-500">Idea Score</div>
                      <div className="font-semibold text-slate-200">{p.ideaScore !== null ? `${p.ideaScore}/100` : '—'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Est. CCU</div>
                      <div className="font-semibold text-slate-200">{p.kpis?.ccu || 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Est. $/mo</div>
                      <div className="font-semibold text-emerald-400">
                        ${(p.kpis?.estimatedMonthlyUsd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800/80">
                    <select
                      value={p.stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateStage(p.id, e.target.value as ProjectStage)}
                      className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                    >
                      {STAGES.map((st) => (
                        <option key={st} value={st}>
                          Stage: {STAGE_META[st].label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(p.id);
                        onLaunchFactory(p.id);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-indigo-600/90 hover:bg-indigo-500 text-white font-medium"
                    >
                      <Play className="w-3 h-3" />
                      Run Factory
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live 15-Agent Status Grid */}
      <div className="studio-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Live 15-Agent Specialist Roster
          </h2>
          <button onClick={() => onNavigate('explorer')} className="text-xs text-slate-400 hover:text-indigo-300">
            Edit Prompts & Playbooks →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {agents.map((agent) => {
            const live = agentStatuses[agent.id] || { status: 'idle' };
            const statusDot =
              live.status === 'working'
                ? 'bg-emerald-400 animate-pulse'
                : live.status === 'review'
                  ? 'bg-amber-400'
                  : 'bg-slate-600';
            return (
              <div
                key={agent.id}
                className="studio-card p-3 flex flex-col justify-between hover:border-slate-600 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: agent.color }}
                      />
                      <span className="font-semibold text-sm text-white truncate">{agent.name}</span>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                        agent.modelTier === 'pro'
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'bg-cyan-500/15 text-cyan-300'
                      }`}
                    >
                      {agent.modelTier}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{agent.role}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-slate-300">
                    <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                    {live.status === 'working' ? 'Working' : live.status === 'review' ? 'In Review' : 'Idle'}
                  </span>
                  <span className="text-slate-500 truncate max-w-[110px]" title={live.taskTitle || agent.department}>
                    {live.taskTitle || agent.department}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

