import {
  CheckCircle2,
  Clapperboard,
  FileCode2,
  Film,
  Image as ImageIcon,
  MessageSquareWarning,
  ShieldAlert,
} from 'lucide-react';
import React, { useState } from 'react';
import { api } from '../api';
import type { ProjectRecord, ReviewItemRecord } from '../types';

interface ReviewQueueViewProps {
  project: ProjectRecord | null;
  reviews: ReviewItemRecord[];
  ffmpegInstalled: boolean;
  onRefreshReviews: () => Promise<void>;
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({
  project,
  reviews,
  ffmpegInstalled,
  onRefreshReviews,
}) => {
  const [filter, setFilter] = useState<'pending' | 'all' | 'approved' | 'changes_requested'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  // Quick 9:16 Promo Assembler state
  const [promoHook, setPromoHook] = useState('POV: Pulling a 1-in-100,000 MYTHIC on my first roll!');
  const [promoCta, setPromoCta] = useState('');
  const [promoMsg, setPromoMsg] = useState<string | null>(null);

  const filtered = reviews.filter((r) => (filter === 'all' ? true : r.status === filter));
  const activeReview = filtered.find((r) => r.id === selectedId) || filtered[0] || null;

  const handleApprove = async (id: string) => {
    setBusy(true);
    try {
      await api.approveReview(id, feedback.trim() || undefined);
      setFeedback('');
      await onRefreshReviews();
    } finally {
      setBusy(false);
    }
  };

  const handleRequestChanges = async (id: string) => {
    if (!feedback.trim()) {
      alert('Please enter revision notes explaining what the specialist should change.');
      return;
    }
    setBusy(true);
    try {
      await api.requestReviewChanges(id, feedback.trim());
      setFeedback('');
      await onRefreshReviews();
    } finally {
      setBusy(false);
    }
  };

  const handleAssemblePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setBusy(true);
    setPromoMsg(null);
    try {
      const res = await api.assemblePromo(project.id, {
        hookCaption: promoHook,
        ctaCaption: promoCta || `PLAY ${project.name.toUpperCase()} ON ROBLOX!`,
        durationSeconds: 15,
        addToReviewQueue: true,
      });
      setPromoMsg(res.message);
      await onRefreshReviews();
    } catch (err) {
      setPromoMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const imageAttachments = activeReview?.attachments.filter((a) => a.type === 'image') || [];
  const videoAttachments = activeReview?.attachments.filter((a) => a.type === 'video') || [];
  const textAttachments =
    activeReview?.attachments.filter((a) => a.type !== 'image' && a.type !== 'video') || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Human-in-the-Loop Review Queue</h1>
          <p className="text-xs text-slate-400">
            Approve high-leverage studio gates (Idea Pitch, GDD, Pricing Ladder, Phone/PC Screenshots, Security Audits, Promos, Publish) or request revisions.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-studio-surface border border-studio-border text-xs">
          {(['pending', 'all', 'approved', 'changes_requested'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize transition ${
                filter === tab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.replace('_', ' ')} (
              {tab === 'all' ? reviews.length : reviews.filter((r) => r.status === tab).length})
            </button>
          ))}
        </div>
      </div>

      {/* Splash 9:16 TikTok / Shorts Promo Assembler Strip */}
      {project && (
        <form
          onSubmit={handleAssemblePromo}
          className="studio-panel p-4 flex flex-col lg:flex-row lg:items-end gap-3 border-fuchsia-500/30 bg-fuchsia-950/10"
        >
          <div className="flex-1">
            <label className="text-xs font-semibold text-fuchsia-300 flex items-center gap-1.5 mb-1">
              <Clapperboard className="w-3.5 h-3.5" />
              Splash 9:16 TikTok / Shorts Assembler ({ffmpegInstalled ? 'ffmpeg Ready' : 'Storyboard Fallback — ffmpeg Not Installed'})
            </label>
            <input
              className="studio-input"
              value={promoHook}
              onChange={(e) => setPromoHook(e.target.value)}
              placeholder="0–4s Hook Caption..."
              required
            />
          </div>
          <div className="w-full lg:w-64">
            <label className="block text-xs text-slate-400 mb-1">End CTA Caption</label>
            <input
              className="studio-input"
              value={promoCta}
              onChange={(e) => setPromoCta(e.target.value)}
              placeholder={`PLAY ${project.name.toUpperCase()}!`}
            />
          </div>
          <button type="submit" disabled={busy} className="studio-btn-primary shrink-0">
            <Film className="w-4 h-4" />
            Generate Promo to Queue
          </button>
        </form>
      )}
      {promoMsg && (
        <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200">
          {promoMsg}
        </div>
      )}

      {/* Split Inbox View */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 studio-panel p-3 space-y-2 max-h-[68vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
              No review items in this filter.
            </div>
          ) : (
            filtered.map((item) => {
              const selected = activeReview?.id === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    selected
                      ? 'bg-indigo-600/15 border-indigo-500'
                      : 'bg-studio-card border-studio-border hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-indigo-300 uppercase">{item.category}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-medium capitalize ${
                        item.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-300'
                          : item.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 line-clamp-2">{item.title}</div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>Agent: {item.agentId}</span>
                    <span>{item.attachments.length} attachment(s)</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="xl:col-span-8 studio-panel p-5 space-y-4">
          {!activeReview ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Select an item from the inbox to inspect deliverables, screenshots, promos, or diffs.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-studio-border pb-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                      {activeReview.agentId}
                    </span>
                    <span className="uppercase font-mono">{activeReview.category}</span>
                    <span>• {new Date(activeReview.createdAt).toLocaleString()}</span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1">{activeReview.title}</h2>
                </div>
                {activeReview.category === 'publish' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 font-semibold">
                    <ShieldAlert className="w-4 h-4" />
                    Production Release Safety Gate
                  </span>
                )}
              </div>

              <div className="studio-card p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto">
                {activeReview.summary}
              </div>

              {/* Side-by-Side Image / Screenshot Previews (PC & Phone) */}
              {imageAttachments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                    Visual Screenshots &amp; Art Previews ({imageAttachments.length})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {imageAttachments.map((att, idx) => (
                      <div key={idx} className="studio-card p-2 space-y-1.5">
                        <div className="text-[11px] font-mono text-slate-400">{att.label}</div>
                        {att.url && (
                          <img
                            src={att.url}
                            alt={att.label}
                            className="w-full rounded-lg border border-slate-800 max-h-72 object-contain bg-black"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inline 9:16 TikTok / Shorts Video Players */}
              {videoAttachments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-fuchsia-400" />
                    Promo Video Previews
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {videoAttachments.map((att, idx) => (
                      <div key={idx} className="studio-card p-2 space-y-1.5">
                        <div className="text-[11px] font-mono text-slate-400">{att.label}</div>
                        {att.url && (
                          <video
                            src={att.url}
                            controls
                            className="w-full rounded-lg max-h-80 bg-black border border-slate-800"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Markdown / JSON / Diff Attachments */}
              {textAttachments.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
                    Deliverables, Reports &amp; Diffs ({textAttachments.length})
                  </div>
                  {textAttachments.map((att, idx) => (
                    <details key={idx} open={idx === 0} className="studio-card overflow-hidden">
                      <summary className="px-3.5 py-2.5 text-xs font-semibold text-slate-200 cursor-pointer hover:bg-slate-800/60 flex items-center justify-between">
                        <span>{att.label}</span>
                        <span className="font-mono text-[10px] text-slate-500 uppercase">{att.type}</span>
                      </summary>
                      <pre className="p-3.5 text-[11px] font-mono text-slate-300 bg-slate-950 border-t border-slate-800 max-h-72 overflow-auto whitespace-pre-wrap">
                        {att.content || '(Empty)'}
                      </pre>
                    </details>
                  ))}
                </div>
              )}

              {/* Approval / Request Changes Controls */}
              {activeReview.status === 'pending' ? (
                <div className="pt-3 border-t border-studio-border space-y-3">
                  <textarea
                    rows={2}
                    className="studio-input"
                    placeholder="Optional approval notes, OR required revision feedback when requesting changes..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      disabled={busy}
                      onClick={() => void handleRequestChanges(activeReview.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/35 border border-amber-500/40 text-amber-300 text-sm font-medium transition"
                    >
                      <MessageSquareWarning className="w-4 h-4" />
                      Request Changes
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void handleApprove(activeReview.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve &amp; Unblock Pipeline
                    </button>
                  </div>
                </div>
              ) : (
                activeReview.feedback && (
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                    <span className="font-semibold text-slate-200">Recorded Decision Note:</span> {activeReview.feedback}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

