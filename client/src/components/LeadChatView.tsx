import {
  Bot,
  Code2,
  Coins,
  Megaphone,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Workflow,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessageRecord, ExplorerRef, NavTab, ProjectRecord, TaskRecord } from '../types';

interface LeadChatViewProps {
  project: ProjectRecord | null;
  messages: ChatMessageRecord[];
  tasks: TaskRecord[];
  explorerRefs: ExplorerRef[];
  sending: boolean;
  onRemoveExplorerRef: (robloxPath: string) => void;
  onSendMessage: (message: string) => Promise<void>;
  onLaunchQuickPipeline: (templateId: string) => Promise<void>;
  onNavigate: (tab: NavTab) => void;
}

const QUICK_PROMPTS = [
  {
    label: 'Pitch Trending Game',
    icon: Sparkles,
    prompt:
      'Find a high-ROI trending Roblox niche for mobile players, score it 0-100 with Pulse, and propose a first-2-minute hook + 3-tier Robux pricing ladder for Review Queue approval.',
  },
  {
    label: 'Run Full QA + Security Audit',
    icon: ShieldCheck,
    pipelineId: 'qa_security_audit',
  },
  {
    label: 'Add Monetization Shop',
    icon: Coins,
    pipelineId: 'monetization_upgrade',
  },
  {
    label: 'Generate Launch Pack',
    icon: Megaphone,
    pipelineId: 'launch_pack',
  },
  {
    label: 'Full Game Factory DAG',
    icon: Workflow,
    pipelineId: 'full_game_factory',
  },
];

export const LeadChatView: React.FC<LeadChatViewProps> = ({
  project,
  messages,
  tasks,
  explorerRefs,
  sending,
  onRemoveExplorerRef,
  onSendMessage,
  onLaunchQuickPipeline,
  onNavigate,
}) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!project) {
    return (
      <div className="studio-panel p-10 text-center">
        <Bot className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-white">Select or create a game project first</h2>
        <p className="text-sm text-slate-400 mt-1">Lead orchestrates tasks inside your active Rojo game workspace.</p>
      </div>
    );
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    await onSendMessage(text);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] studio-panel overflow-hidden">
      {/* Header + Quick Action Bar */}
      <div className="p-4 border-b border-studio-border bg-slate-950/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Lead — Studio Manager & Orchestrator</h2>
              <p className="text-xs text-slate-400">
                Active Workspace: <span className="text-indigo-300 font-medium">{project.name}</span> ({project.genre})
              </p>
            </div>
          </div>
          <button onClick={() => onNavigate('tasks')} className="studio-btn-secondary text-xs py-1.5">
            <Workflow className="w-3.5 h-3.5" />
            View Task DAG ({tasks.length})
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                disabled={sending}
                onClick={() => {
                  if (q.pipelineId) {
                    void onLaunchQuickPipeline(q.pipelineId);
                  } else if (q.prompt) {
                    void onSendMessage(q.prompt);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-indigo-600/25 border border-slate-700 hover:border-indigo-500/50 text-xs text-slate-200 transition"
              >
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
                {q.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="max-w-xl mx-auto text-center py-12">
            <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
            <h3 className="text-white font-semibold">Tell Lead what to build, optimize, or audit</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Example: &ldquo;Find a trending incremental digging niche, design the GDD &amp; contracts, build core gameplay + mobile UI + 3-tier Robux shop, run phone/PC QA &amp; security audit, and prepare launch thumbnails + TikTok scripts.&rdquo;
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const delegated = msg.delegatedTaskIds
              .map((id) => taskById.get(id))
              .filter((t): t is TaskRecord => Boolean(t));

            return (
              <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-indigo-400" />
                  </div>
                )}

                <div
                  className={`max-w-3xl rounded-xl p-3.5 text-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-studio-card border border-studio-border text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1 text-[11px] opacity-75">
                    <span className="font-semibold">{isUser ? 'Studio Owner' : msg.agentId}</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>

                  {msg.explorerRefs && msg.explorerRefs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.explorerRefs.map((ref) => (
                        <span
                          key={ref.robloxPath}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/25 text-[11px] font-mono"
                        >
                          <Code2 className="w-3 h-3" />
                          {ref.robloxPath}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="whitespace-pre-wrap leading-relaxed break-words">{msg.content}</div>

                  {/* Inline Delegation Cards */}
                  {delegated.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700/70 space-y-2">
                      <div className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider">
                        Delegated Specialist Tasks ({delegated.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {delegated.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => onNavigate('tasks')}
                            className="text-left p-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 transition"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-indigo-300">{t.agentId}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                                {t.status}
                              </span>
                            </div>
                            <div className="text-xs text-slate-200 mt-1 line-clamp-1">{t.title}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="p-3.5 border-t border-studio-border bg-slate-950/80 space-y-2">
        {explorerRefs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Attached from Explorer:</span>
            {explorerRefs.map((ref) => (
              <span
                key={ref.robloxPath}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-xs text-indigo-200 font-mono"
              >
                <Code2 className="w-3 h-3" />
                {ref.robloxPath}
                <button
                  type="button"
                  onClick={() => onRemoveExplorerRef(ref.robloxPath)}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Instruct Lead (e.g., 'Design & build a 7-day daily streak system + mobile shop popup')..."
            className="studio-input flex-1"
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()} className="studio-btn-primary px-4">
            <Send className="w-4 h-4" />
            {sending ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
};

