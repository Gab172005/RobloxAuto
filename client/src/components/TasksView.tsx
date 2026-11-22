import {
  Clock,
  Columns3,
  FileDiff,
  GitBranch,
  Play,
  RotateCcw,
  StopCircle,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { api } from '../api';
import type { AgentDefinition, ProjectRecord, TaskRecord, TaskStatus } from '../types';

interface TasksViewProps {
  project: ProjectRecord | null;
  tasks: TaskRecord[];
  agents: AgentDefinition[];
  onLaunchQuickPipeline: (templateId: string) => Promise<void>;
  onRefreshTasks: () => Promise<void>;
}

const COLUMNS: Array<{ id: string; label: string; statuses: TaskStatus[]; accent: string }> = [
  { id: 'pending', label: 'Queued / Pending', statuses: ['pending', 'queued'], accent: 'border-t-slate-500' },
  { id: 'running', label: 'Running Live', statuses: ['running'], accent: 'border-t-cyan-400' },
  { id: 'review', label: 'Awaiting Review', statuses: ['awaiting_review'], accent: 'border-t-amber-400' },
  { id: 'done', label: 'Completed', statuses: ['completed'], accent: 'border-t-emerald-400' },
  { id: 'other', label: 'Failed / Rolled Back', statuses: ['failed', 'cancelled', 'rolled_back'], accent: 'border-t-rose-400' },
];

export const TasksView: React.FC<TasksViewProps> = ({
  project,
  tasks,
  agents,
  onLaunchQuickPipeline,
  onRefreshTasks,
}) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'dag'>('kanban');
  const [diffModal, setDiffModal] = useState<{ title: string; diff: string; before: string | null; after: string | null } | null>(
    null
  );
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const agentColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.color);
    return map;
  }, [agents]);

  // Compute topological depth layers for DAG visualization
  const dagLayers = useMemo(() => {
    const byKey = new Map(tasks.map((t) => [t.taskKey, t]));
    const depthMemo = new Map<string, number>();

    const getDepth = (key: string, visiting = new Set<string>()): number => {
      if (depthMemo.has(key)) return depthMemo.get(key)!;
      if (visiting.has(key)) return 0;
      visiting.add(key);
      const task = byKey.get(key);
      if (!task || task.dependsOn.length === 0) {
        depthMemo.set(key, 0);
        return 0;
      }
      const maxParent = Math.max(...task.dependsOn.map((d) => (byKey.has(d) ? getDepth(d, visiting) + 1 : 0)));
      depthMemo.set(key, maxParent);
      return maxParent;
    };

    const grouped = new Map<number, TaskRecord[]>();
    for (const t of tasks) {
      const d = getDepth(t.taskKey);
      const list = grouped.get(d) || [];
      list.push(t);
      grouped.set(d, list);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [tasks]);

  if (!project) {
    return (
      <div className="studio-panel p-10 text-center text-slate-400">
        Select or create a project to view its DAG task graph and Kanban board.
      </div>
    );
  }

  const handleOpenDiff = async (task: TaskRecord) => {
    setBusyTaskId(task.id);
    try {
      const res = await api.getTaskDiff(task.id);
      setDiffModal({
        title: `[${task.agentId}] ${task.title}`,
        diff: res.diff || '(No file changes recorded in Git for this task yet.)',
        before: res.before,
        after: res.after,
      });
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleRollback = async (task: TaskRecord) => {
    if (!window.confirm(`Roll back workspace to pre-task Git checkpoint for "${task.title}"?`)) return;
    setBusyTaskId(task.id);
    try {
      await api.rollbackTask(task.id);
      await onRefreshTasks();
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleCancel = async (task: TaskRecord) => {
    setBusyTaskId(task.id);
    try {
      await api.cancelTask(task.id);
      await onRefreshTasks();
    } finally {
      setBusyTaskId(null);
    }
  };

  const renderTaskCard = (task: TaskRecord) => {
    const color = agentColor.get(task.agentId) || '#6366f1';
    return (
      <div key={task.id} className="studio-card p-3.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold text-white"
            style={{ backgroundColor: `${color}30`, border: `1px solid ${color}70` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            {task.agentId}
          </span>
          <span className="font-mono text-[10px] text-slate-500">{task.taskKey}</span>
        </div>

        <div className="font-semibold text-slate-100 leading-snug">{task.title}</div>

        {task.dependsOn.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
            <span>After:</span>
            {task.dependsOn.map((d) => (
              <span key={d} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono">
                {d}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
          {task.elapsedMs > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {(task.elapsedMs / 1000).toFixed(1)}s
            </span>
          )}
          {(task.tokensIn > 0 || task.tokensOut > 0) && (
            <span className="font-mono text-[10px]">
              {task.tokensIn}↓ / {task.tokensOut}↑ tok
            </span>
          )}
          {task.requiresReview && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Review Gate</span>
          )}
        </div>

        {task.error && (
          <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] line-clamp-2">
            {task.error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
          {task.status === 'running' && (
            <button
              disabled={busyTaskId === task.id}
              onClick={() => void handleCancel(task)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white text-[11px]"
            >
              <StopCircle className="w-3 h-3" /> Cancel
            </button>
          )}
          {(task.gitBeforeCommit || task.gitAfterCommit) && (
            <button
              disabled={busyTaskId === task.id}
              onClick={() => void handleOpenDiff(task)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
            >
              <FileDiff className="w-3 h-3" /> Git Diff
            </button>
          )}
          {task.gitBeforeCommit && task.status !== 'rolled_back' && task.status !== 'running' && (
            <button
              disabled={busyTaskId === task.id}
              onClick={() => void handleRollback(task)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-amber-600/30 text-amber-300 text-[11px]"
            >
              <RotateCcw className="w-3 h-3" /> Rollback
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Task Orchestration (DAG + Kanban)</h1>
          <p className="text-xs text-slate-400">
            Parallel worker pool with automatic Git checkpoints, Self-Healing QA loops, and 1-click rollback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void onLaunchQuickPipeline('full_game_factory')}
            className="studio-btn-primary text-xs py-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            Launch Full Game DAG
          </button>
          <div className="inline-flex p-1 rounded-lg bg-studio-surface border border-studio-border">
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                viewMode === 'kanban' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" /> Kanban
            </button>
            <button
              onClick={() => setViewMode('dag')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                viewMode === 'dag' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" /> DAG Layers
            </button>
          </div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="studio-panel p-12 text-center">
          <GitBranch className="w-9 h-9 text-indigo-400 mx-auto mb-3 opacity-80" />
          <h3 className="text-white font-semibold">No tasks queued for {project.name} yet</h3>
          <p className="text-xs text-slate-400 mt-1">
            Launch the Full Game Factory DAG above or describe your goal in Chat with Lead.
          </p>
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3.5 items-start">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <div key={col.id} className={`studio-panel border-t-2 ${col.accent} p-3 space-y-3`}>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span>{col.label}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                    {colTasks.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {colTasks.length === 0 ? (
                    <div className="text-[11px] text-slate-600 text-center py-4">Empty</div>
                  ) : (
                    colTasks.map(renderTaskCard)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {dagLayers.map(([depth, layerTasks]) => (
            <div key={depth} className="studio-panel p-4">
              <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">
                DAG Wave {depth + 1} ({layerTasks.length} parallel task{layerTasks.length > 1 ? 's' : ''})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {layerTasks.map(renderTaskCard)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Git Diff Modal */}
      {diffModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="studio-panel w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-studio-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{diffModal.title}</h3>
                <p className="text-xs font-mono text-slate-400">
                  {diffModal.before?.slice(0, 7) || 'init'} → {diffModal.after?.slice(0, 7) || 'HEAD'}
                </p>
              </div>
              <button onClick={() => setDiffModal(null)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-4 overflow-auto text-xs font-mono text-slate-200 bg-slate-950 leading-relaxed whitespace-pre-wrap">
              {diffModal.diff}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

