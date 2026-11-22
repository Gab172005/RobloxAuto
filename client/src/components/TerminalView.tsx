import { Search, Terminal, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { AgentDefinition, AgentStreamEvent } from '../types';

interface TerminalViewProps {
  agents: AgentDefinition[];
  logs: AgentStreamEvent[];
  onClearLogs: () => void;
}

const EVENT_COLORS: Record<string, string> = {
  init: 'text-sky-400',
  message: 'text-slate-100',
  tool_use: 'text-amber-300',
  tool_result: 'text-emerald-300',
  error: 'text-rose-400',
  result: 'text-indigo-300',
  system: 'text-slate-400',
};

export const TerminalView: React.FC<TerminalViewProps> = ({ agents, logs, onClearLogs }) => {
  const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const filtered = logs.filter((log) => {
    if (selectedAgent !== 'ALL' && log.agentId !== selectedAgent) return false;
    if (search.trim() && !`${log.agentId} ${log.type} ${log.content}`.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filtered.length, autoScroll]);

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] studio-panel overflow-hidden">
      <div className="p-4 border-b border-studio-border bg-slate-950/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h1 className="text-sm font-bold text-white">Live Gemini CLI Stream Terminal</h1>
            <span className="text-[11px] font-mono text-slate-500">({filtered.length} events)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter output..."
                className="studio-input pl-8 py-1.5 text-xs w-48"
              />
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
              Auto-scroll
            </label>
            <button onClick={onClearLogs} className="studio-btn-secondary text-xs py-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              Clear View
            </button>
          </div>
        </div>

        {/* 15-Agent Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedAgent('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
              selectedAgent === 'ALL'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Agents ({logs.length})
          </button>
          {agents.map((a) => {
            const count = logs.filter((l) => l.agentId === a.id).length;
            const active = selectedAgent === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  active ? 'bg-slate-200 text-slate-950' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                {a.id}
                {count > 0 && <span className="font-mono opacity-75">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Monospace Stream Area */}
      <div className="flex-1 overflow-y-auto bg-[#06080f] p-4 font-mono text-xs space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-slate-600 py-10 text-center">
            Waiting for live Gemini CLI stream-json events (`init`, `message`, `tool_use`, `tool_result`, `result`)...
          </div>
        ) : (
          filtered.map((evt) => (
            <div key={evt.id} className="flex items-start gap-2.5 leading-relaxed hover:bg-slate-900/50 px-1.5 py-0.5 rounded">
              <span className="text-slate-600 shrink-0 select-none">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
              <span className="px-1.5 rounded bg-slate-800/90 text-indigo-300 shrink-0 font-semibold">
                {evt.agentId}
              </span>
              <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 shrink-0">
                {evt.type}
              </span>
              <span className={`${EVENT_COLORS[evt.type] || 'text-slate-200'} whitespace-pre-wrap break-all`}>
                {evt.content}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};

