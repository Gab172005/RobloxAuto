import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  Folder,
  Package,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type {
  AgentRegistry,
  CatalogItem,
  ExplorerNode,
  ExplorerRef,
  NavTab,
  PlaybookChapterMeta,
  ProjectRecord,
  SecurityScanResult,
} from '../types';

interface ExplorerAssetsViewProps {
  project: ProjectRecord | null;
  registry: AgentRegistry | null;
  onRegistrySaved: (next: AgentRegistry) => void;
  onSendRefToLead: (ref: ExplorerRef) => void;
  onNavigate: (tab: NavTab) => void;
}

const TreeNodeView: React.FC<{
  node: ExplorerNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: ExplorerNode) => void;
}> = ({ node, depth, selectedPath, onSelect }) => {
  const [open, setOpen] = useState(depth < 3);
  const hasChildren = node.children.length > 0;
  const isSelected = Boolean(node.filePath && node.filePath === selectedPath);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) setOpen((o) => !o);
          onSelect(node);
        }}
        className={`w-full flex items-center gap-1.5 py-1 px-2 rounded text-left text-xs transition ${
          isSelected ? 'bg-indigo-600/25 text-indigo-200' : 'text-slate-300 hover:bg-slate-800/70'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {node.filePath ? (
          <FileCode2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
        <span className="truncate flex-1">{node.name}</span>
        <span className="text-[10px] font-mono text-slate-500">{node.className}</span>
      </button>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TreeNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ExplorerAssetsView: React.FC<ExplorerAssetsViewProps> = ({
  project,
  registry,
  onRegistrySaved,
  onSendRefToLead,
  onNavigate,
}) => {
  const [subTab, setSubTab] = useState<'explorer' | 'catalog' | 'playbook' | 'agents'>('explorer');

  // Explorer & Code Viewer state
  const [tree, setTree] = useState<ExplorerNode | null>(null);
  const [files, setFiles] = useState<Array<{ path: string; size: number }>>([]);
  const [selectedNode, setSelectedNode] = useState<ExplorerNode | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Catalog state
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogItem | null>(null);

  // Playbook state
  const [chapters, setChapters] = useState<PlaybookChapterMeta[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<PlaybookChapterMeta | null>(null);
  const [chapterDraft, setChapterDraft] = useState('');

  // Agent Registry & Prompt editor state
  const [selectedAgentId, setSelectedAgentId] = useState<string>('Lead');
  const [promptDraft, setPromptDraft] = useState('');

  const loadProjectFiles = async () => {
    if (!project) return;
    const [expRes, filesRes] = await Promise.all([api.getExplorer(project.id), api.listFiles(project.id)]);
    setTree(expRes.tree);
    setFiles(filesRes.files);
  };

  useEffect(() => {
    void loadProjectFiles();
  }, [project?.id]);

  useEffect(() => {
    api.listCatalog().then((r) => {
      setCatalog(r.items);
      if (r.items[0]) setSelectedCatalog(r.items[0]);
    });
    api.listPlaybook().then((r) => {
      setChapters(r.chapters);
      if (r.chapters[0]) {
        setSelectedChapter(r.chapters[0]);
        setChapterDraft(r.chapters[0].content);
      }
    });
  }, []);

  useEffect(() => {
    if (subTab === 'agents' && selectedAgentId) {
      api.getAgentPrompt(selectedAgentId).then((r) => setPromptDraft(r.content)).catch(() => {});
    }
  }, [subTab, selectedAgentId]);

  const openWorkspaceFile = async (relPath: string, node?: ExplorerNode) => {
    if (!project) return;
    setSelectedFilePath(relPath);
    if (node) setSelectedNode(node);
    const res = await api.readFile(project.id, relPath);
    setFileContent(res.content);
  };

  const handleSaveWorkspaceFile = async () => {
    if (!project || !selectedFilePath) return;
    await api.saveFile(project.id, selectedFilePath, fileContent);
    setStatusBanner(`Saved & Git-checkpointed ${selectedFilePath}`);
  };

  const handleRunSecurityScan = async () => {
    if (!project) return;
    const res = await api.scanSecurity(project.id);
    setScanResult(res);
  };

  const handleInstallCatalog = async (item: CatalogItem) => {
    if (!project) return;
    const res = await api.installCatalogItem(project.id, item.id);
    setStatusBanner(`Installed "${item.name}" → ${res.targetPath} (Git committed)`);
    await loadProjectFiles();
  };

  const handleSaveChapter = async () => {
    if (!selectedChapter) return;
    await api.savePlaybookChapter(selectedChapter.filename, chapterDraft);
    setStatusBanner(`Saved playbook chapter ${selectedChapter.filename}`);
    const refreshed = await api.listPlaybook();
    setChapters(refreshed.chapters);
  };

  const handleSaveAgentPrompt = async () => {
    await api.saveAgentPrompt(selectedAgentId, promptDraft);
    setStatusBanner(`Saved role prompt for ${selectedAgentId}`);
  };

  const handleAgentFieldChange = async (agentId: string, field: 'modelTier' | 'approvalMode', value: string) => {
    if (!registry) return;
    const next: AgentRegistry = {
      ...registry,
      agents: registry.agents.map((a) => (a.id === agentId ? { ...a, [field]: value } : a)),
    };
    const saved = await api.saveRegistry(next);
    onRegistrySaved(saved.registry);
    setStatusBanner(`Updated ${agentId} ${field} → ${value} in agents/registry.json`);
  };

  const filteredCatalog = catalog.filter((c) =>
    `${c.name} ${c.category} ${c.tags.join(' ')} ${c.description}`
      .toLowerCase()
      .includes(catalogSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Explorer, Asset Catalog, Playbook &amp; Agents</h1>
          <p className="text-xs text-slate-400">
            Browse Rojo hierarchy, edit Luau scripts, install vetted templates, and tune prompts/playbooks live.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-studio-surface border border-studio-border text-xs">
          {(
            [
              { id: 'explorer', label: 'Studio Explorer & Files', icon: FileCode2 },
              { id: 'catalog', label: 'Local Asset Catalog', icon: Package },
              { id: 'playbook', label: 'Playbook Editor (8)', icon: BookOpen },
              { id: 'agents', label: 'Agent Registry (15)', icon: Bot },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                  subTab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {statusBanner && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex justify-between">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner(null)} className="text-emerald-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* TAB A: STUDIO EXPLORER & CODE VIEWER */}
      {subTab === 'explorer' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-4 studio-panel p-3 space-y-4 max-h-[72vh] overflow-y-auto">
            {!project ? (
              <p className="text-xs text-slate-500 p-4">Select a project first.</p>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                      Roblox DataModel Tree (Rojo)
                    </span>
                    <button
                      onClick={() => void handleRunSecurityScan()}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30"
                    >
                      <ShieldCheck className="w-3 h-3" /> Security Scan
                    </button>
                  </div>
                  {tree && (
                    <TreeNodeView
                      node={tree}
                      depth={0}
                      selectedPath={selectedFilePath}
                      onSelect={(n) => {
                        setSelectedNode(n);
                        if (n.filePath) void openWorkspaceFile(n.filePath, n);
                      }}
                    />
                  )}
                </div>

                <div className="border-t border-studio-border pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                    All Workspace Files ({files.length})
                  </div>
                  <div className="space-y-0.5 max-h-56 overflow-y-auto">
                    {files.map((f) => (
                      <button
                        key={f.path}
                        onClick={() => void openWorkspaceFile(f.path)}
                        className={`w-full text-left px-2 py-1 rounded text-xs font-mono truncate ${
                          selectedFilePath === f.path
                            ? 'bg-indigo-600/25 text-indigo-200'
                            : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                        }`}
                      >
                        {f.path}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="xl:col-span-8 space-y-4">
            {scanResult && (
              <div
                className={`studio-panel p-4 text-xs ${
                  scanResult.clean ? 'border-emerald-500/40' : 'border-rose-500/50'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className={scanResult.clean ? 'text-emerald-300' : 'text-rose-300'}>
                    Security &amp; Backdoor Scan: {scanResult.clean ? 'CLEAN' : 'RELEASE BLOCKED'} ({scanResult.scannedFiles}{' '}
                    files)
                  </span>
                  <span className="font-mono text-slate-400">
                    CRIT:{scanResult.criticalCount} HIGH:{scanResult.highCount} MED:{scanResult.mediumCount} LOW:
                    {scanResult.lowCount}
                  </span>
                </div>
                {scanResult.findings.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
                    {scanResult.findings.map((f) => (
                      <div key={f.id} className="p-2 rounded bg-slate-950 border border-slate-800">
                        <span className="font-mono font-semibold text-amber-300">[{f.severity}]</span>{' '}
                        <span className="text-white">{f.title}</span> —{' '}
                        <span className="font-mono text-slate-400">
                          {f.file}:{f.line}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="studio-panel flex flex-col h-[64vh] overflow-hidden">
              <div className="p-3 border-b border-studio-border flex flex-wrap items-center justify-between gap-2 bg-slate-950/70">
                <div className="text-xs font-mono text-slate-300 truncate">
                  {selectedFilePath || 'Select a Luau script, contract, or GDD file'}
                  {selectedNode && (
                    <span className="ml-2 text-indigo-400">({selectedNode.robloxPath})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedFilePath && (
                    <>
                      <button
                        onClick={() => {
                          onSendRefToLead({
                            path: selectedFilePath,
                            robloxPath: selectedNode?.robloxPath || selectedFilePath,
                            className: selectedNode?.className || 'File',
                          });
                          onNavigate('chat');
                        }}
                        className="studio-btn-secondary text-xs py-1"
                      >
                        <Send className="w-3.5 h-3.5 text-indigo-400" />
                        Send to Lead
                      </button>
                      <button onClick={() => void handleSaveWorkspaceFile()} className="studio-btn-primary text-xs py-1">
                        <Save className="w-3.5 h-3.5" /> Save
                      </button>
                    </>
                  )}
                </div>
              </div>
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                spellCheck={false}
                placeholder="Click any script or document in the Studio Explorer to inspect or edit..."
                className="flex-1 w-full bg-[#070a12] p-4 font-mono text-xs text-slate-200 focus:outline-none resize-none leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB B: LOCAL ASSET & TEMPLATE CATALOG */}
      {subTab === 'catalog' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5 studio-panel p-4 space-y-3">
            <input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search vetted --!strict Luau templates (DataStore, ProcessReceipt, Shop UI)..."
              className="studio-input text-xs"
            />
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {filteredCatalog.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedCatalog(item)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    selectedCatalog?.id === item.id
                      ? 'bg-indigo-600/15 border-indigo-500'
                      : 'bg-studio-card border-studio-border hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{item.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 uppercase">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                  <div className="text-[10px] font-mono text-slate-500 mt-1.5">→ {item.targetPath}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="xl:col-span-7 studio-panel flex flex-col h-[68vh] overflow-hidden">
            {selectedCatalog ? (
              <>
                <div className="p-4 border-b border-studio-border flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedCatalog.name}</h3>
                    <p className="text-xs font-mono text-slate-400">{selectedCatalog.targetPath}</p>
                  </div>
                  <button
                    disabled={!project}
                    onClick={() => void handleInstallCatalog(selectedCatalog)}
                    className="studio-btn-primary text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Install into {project?.name || 'Project'}
                  </button>
                </div>
                <pre className="flex-1 overflow-auto p-4 bg-[#070a12] font-mono text-xs text-slate-200 leading-relaxed">
                  {selectedCatalog.previewCode}
                </pre>
              </>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">Select a template to preview.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB C: PLAYBOOK EDITOR */}
      {subTab === 'playbook' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-4 studio-panel p-3 space-y-2 max-h-[68vh] overflow-y-auto">
            {chapters.map((ch) => (
              <button
                key={ch.filename}
                onClick={() => {
                  setSelectedChapter(ch);
                  setChapterDraft(ch.content);
                }}
                className={`w-full text-left p-3 rounded-xl border transition ${
                  selectedChapter?.filename === ch.filename
                    ? 'bg-indigo-600/15 border-indigo-500'
                    : 'bg-studio-card border-studio-border hover:border-slate-600'
                }`}
              >
                <div className="text-xs font-semibold text-white">{ch.title}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">{ch.filename}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {ch.mappedAgents.map((a) => (
                    <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                      {a}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="xl:col-span-8 studio-panel flex flex-col h-[68vh] overflow-hidden">
            <div className="p-3 border-b border-studio-border flex items-center justify-between">
              <span className="text-xs font-mono text-slate-300">{selectedChapter?.filename}</span>
              <button onClick={() => void handleSaveChapter()} className="studio-btn-primary text-xs py-1">
                <Save className="w-3.5 h-3.5" /> Save Playbook Chapter
              </button>
            </div>
            <textarea
              value={chapterDraft}
              onChange={(e) => setChapterDraft(e.target.value)}
              spellCheck={false}
              className="flex-1 bg-[#070a12] p-4 font-mono text-xs text-slate-200 focus:outline-none resize-none leading-relaxed"
            />
          </div>
        </div>
      )}

      {/* TAB D: AGENT REGISTRY & PROMPT EDITOR */}
      {subTab === 'agents' && registry && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-4 studio-panel p-3 space-y-1.5 max-h-[68vh] overflow-y-auto">
            {registry.agents.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAgentId(a.id)}
                className={`w-full text-left p-2.5 rounded-xl border transition ${
                  selectedAgentId === a.id
                    ? 'bg-indigo-600/15 border-indigo-500'
                    : 'bg-studio-card border-studio-border hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-white">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                    {a.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    {a.modelTier} • {a.approvalMode}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">{a.role}</div>
              </button>
            ))}
          </div>

          <div className="xl:col-span-8 studio-panel flex flex-col h-[68vh] overflow-hidden">
            {(() => {
              const activeAgent = registry.agents.find((a) => a.id === selectedAgentId);
              if (!activeAgent) return null;
              return (
                <>
                  <div className="p-3.5 border-b border-studio-border flex flex-wrap items-center justify-between gap-2 bg-slate-950/60">
                    <div>
                      <div className="text-sm font-bold text-white">
                        {activeAgent.name} — {activeAgent.role}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {activeAgent.promptFile} • Chapters: {activeAgent.playbookChapters.join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={activeAgent.modelTier}
                        onChange={(e) => void handleAgentFieldChange(activeAgent.id, 'modelTier', e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="pro">Tier: pro</option>
                        <option value="fast">Tier: fast</option>
                      </select>
                      <select
                        value={activeAgent.approvalMode}
                        onChange={(e) => void handleAgentFieldChange(activeAgent.id, 'approvalMode', e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="plan">approval: plan</option>
                        <option value="auto_edit">approval: auto_edit</option>
                        <option value="yolo">approval: yolo</option>
                        <option value="default">approval: default</option>
                      </select>
                      <button onClick={() => void handleSaveAgentPrompt()} className="studio-btn-primary text-xs py-1">
                        <Save className="w-3.5 h-3.5" /> Save Prompt
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    spellCheck={false}
                    className="flex-1 bg-[#070a12] p-4 font-mono text-xs text-slate-200 focus:outline-none resize-none leading-relaxed"
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

