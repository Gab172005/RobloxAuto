import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ExternalLink,
  Flame,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type {
  CompetitorSnapshotRecord,
  GameReviewResult,
  IdeaScoreResult,
  ProjectRecord,
  RevenueSimResult,
} from '../types';

interface MarketViewProps {
  project: ProjectRecord | null;
  usdToPhpRate: number;
  onApplyKpisToProject?: (projectId: string, sim: RevenueSimResult) => Promise<void>;
}

export const MarketView: React.FC<MarketViewProps> = ({ project, usdToPhpRate, onApplyKpisToProject }) => {
  const [subTab, setSubTab] = useState<'idea' | 'review' | 'calculator'>('idea');

  // Trending + Idea Scorer state
  const [trending, setTrending] = useState<
    Array<{
      id: string;
      name: string;
      momentumScore: number;
      avgMobileShare: string;
      monetizationFit: string;
      viralHook: string;
      estimatedMvpHours: string;
    }>
  >([]);
  const [ideaTitle, setIdeaTitle] = useState('Skyline Digging Tycoon');
  const [ideaGenre, setIdeaGenre] = useState('Incremental Digging Simulator');
  const [ideaLoop, setIdeaLoop] = useState(
    'Tap/hold to dig layers in 5 seconds, uncover absurdly giant glowing relics, sell for instant upgrades, unlock deeper worlds, and trigger server-wide meteor luck events.'
  );
  const [ideaMonetization, setIdeaMonetization] = useState(
    '99 R$ Starter Pack, Auto-Dig 249 R$, 2x Luck 349 R$, VIP 499 R$, Server Meteor Rain 399 R$, Friend Gifting'
  );
  const [ideaViral, setIdeaViral] = useState('Pulling a 1-in-50,000 Giant Golden Dinosaur bigger than the lobby!');
  const [ideaUseAi, setIdeaUseAi] = useState(false);
  const [ideaScore, setIdeaScore] = useState<IdeaScoreResult | null>(null);
  const [scoringIdea, setScoringIdea] = useState(false);

  // Competitor / Game Review state
  const [gameUrl, setGameUrl] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualCcu, setManualCcu] = useState(1250);
  const [manualVisits, setManualVisits] = useState(4200000);
  const [manualFavs, setManualFavs] = useState(65000);
  const [manualUp, setManualUp] = useState(18500);
  const [manualDown, setManualDown] = useState(2100);
  const [reviewUseAi, setReviewUseAi] = useState(false);
  const [reviewResult, setReviewResult] = useState<GameReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<CompetitorSnapshotRecord[]>([]);

  // Revenue & DevEx Calculator state
  const [simCcu, setSimCcu] = useState(400);
  const [simSession, setSimSession] = useState(14);
  const [simD1, setSimD1] = useState(14.5);
  const [simD7, setSimD7] = useState(4.2);
  const [simD30, setSimD30] = useState(2.0);
  const [simPayerPct, setSimPayerPct] = useState(5.2);
  const [simArppu, setSimArppu] = useState(380);
  const [simPhpRate, setSimPhpRate] = useState(usdToPhpRate || 58);
  const [simResult, setSimResult] = useState<RevenueSimResult | null>(null);

  useEffect(() => {
    api.getTrending().then((r) => setTrending(r.archetypes)).catch(() => {});
    api.getSnapshots().then((r) => setSnapshots(r.snapshots)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .simulateRevenue({
          ccu: simCcu,
          avgSessionMinutes: simSession,
          d1RetentionPct: simD1,
          d7RetentionPct: simD7,
          d30RetentionPct: simD30,
          payerConversionPct: simPayerPct,
          arppuRobux: simArppu,
          usdToPhpRate: simPhpRate,
        })
        .then(setSimResult)
        .catch(() => {});
    }, 120);
    return () => clearTimeout(timer);
  }, [simCcu, simSession, simD1, simD7, simD30, simPayerPct, simArppu, simPhpRate]);

  const handleScoreIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    setScoringIdea(true);
    try {
      const res = await api.scoreIdea({
        title: ideaTitle,
        genre: ideaGenre,
        coreLoop: ideaLoop,
        monetizationIdeas: ideaMonetization,
        viralHook: ideaViral,
        useAiEnrichment: ideaUseAi,
        projectId: project?.id,
      });
      setIdeaScore(res);
    } finally {
      setScoringIdea(false);
    }
  };

  const handleReviewGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await api.reviewGame(
        manualMode
          ? {
              projectId: project?.id,
              useAiTeardown: reviewUseAi,
              manualData: {
                name: manualName || 'Manual Benchmark Game',
                playing: manualCcu,
                visits: manualVisits,
                favoritedCount: manualFavs,
                upVotes: manualUp,
                downVotes: manualDown,
              },
            }
          : {
              gameUrlOrId: gameUrl,
              projectId: project?.id,
              useAiTeardown: reviewUseAi,
            }
      );
      setReviewResult(res);
      const updated = await api.getSnapshots();
      setSnapshots(updated.snapshots);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Market Intelligence, Game Review &amp; Revenue Lab</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Powered by Pulse + Live Roblox Public APIs + 2026 DevEx Revenue Modeling
          </p>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-studio-surface border border-studio-border">
          {(
            [
              { id: 'idea', label: 'Score My Idea', icon: Sparkles },
              { id: 'review', label: 'Competitor / Game Review', icon: Search },
              { id: 'calculator', label: 'Revenue & DevEx Calculator', icon: Calculator },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
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

      {/* TAB 1: SCORE MY IDEA */}
      {subTab === 'idea' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-6 space-y-4">
            <form onSubmit={handleScoreIdea} className="studio-panel p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Idea Scorecard Input (Pulse)</h2>
                <span className="text-[11px] text-slate-400">6-Pillar 0–100 Rubric</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Game Concept Title</label>
                  <input className="studio-input" value={ideaTitle} onChange={(e) => setIdeaTitle(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Genre / Archetype</label>
                  <input className="studio-input" value={ideaGenre} onChange={(e) => setIdeaGenre(e.target.value)} required />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Core Loop &amp; First-2-Minute Hook</label>
                <textarea
                  rows={3}
                  className="studio-input"
                  value={ideaLoop}
                  onChange={(e) => setIdeaLoop(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Planned Robux Monetization</label>
                <input
                  className="studio-input"
                  value={ideaMonetization}
                  onChange={(e) => setIdeaMonetization(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Viral 10-Second TikTok / Shorts Moment</label>
                <input className="studio-input" value={ideaViral} onChange={(e) => setIdeaViral(e.target.value)} />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ideaUseAi}
                    onChange={(e) => setIdeaUseAi(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Include Live Pulse Gemini CLI Critique
                </label>
                <button type="submit" disabled={scoringIdea} className="studio-btn-primary">
                  <Sparkles className="w-4 h-4" />
                  {scoringIdea ? 'Scoring...' : 'Score Idea (0–100)'}
                </button>
              </div>
            </form>

            {/* Trending High-ROI Archetypes */}
            <div className="studio-panel p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Flame className="w-4 h-4 text-orange-400" />
                High-ROI 2026 Roblox Archetypes (Click to Load)
              </h3>
              <div className="space-y-2.5">
                {trending.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setIdeaTitle(a.name);
                      setIdeaGenre(a.name);
                      setIdeaMonetization(a.monetizationFit);
                      setIdeaViral(a.viralHook);
                    }}
                    className="w-full text-left p-3 rounded-lg bg-studio-card hover:border-indigo-500/50 border border-studio-border transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{a.name}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                        Momentum {a.momentumScore}/100
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Mobile: {a.avgMobileShare} • MVP: {a.estimatedMvpHours}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="xl:col-span-6">
            {!ideaScore ? (
              <div className="studio-panel p-10 text-center h-full flex flex-col items-center justify-center">
                <TrendingUp className="w-10 h-10 text-indigo-400 mb-3 opacity-80" />
                <h3 className="text-white font-semibold">Run Pulse Idea Scorecard</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Evaluate Trend Momentum, First-2-Min Hook, Mobile Fit, Monetization Depth, Viral Clip Potential, and Build Complexity before committing build hours.
                </p>
              </div>
            ) : (
              <div className="studio-panel p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-studio-border pb-4">
                  <div>
                    <div className="text-xs text-slate-400">{ideaScore.genre}</div>
                    <h2 className="text-lg font-bold text-white">{ideaScore.title}</h2>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-extrabold text-indigo-400">
                      {ideaScore.totalScore}
                      <span className="text-sm text-slate-500">/100</span>
                    </div>
                    <span
                      className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full mt-1 ${
                        ideaScore.verdict === 'GREENLIGHT'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : ideaScore.verdict === 'REFINE_HOOK'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {ideaScore.verdict}
                    </span>
                  </div>
                </div>

                {/* 6 Pillar Bars */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Trend Momentum', val: ideaScore.breakdown.trendMomentum, max: 20 },
                    { label: 'First-2-Min Hook', val: ideaScore.breakdown.firstTwoMinHook, max: 20 },
                    { label: 'Mobile Fit', val: ideaScore.breakdown.mobileFit, max: 15 },
                    { label: 'Monetization Depth', val: ideaScore.breakdown.monetizationDepth, max: 20 },
                    { label: 'Viral Clip Potential', val: ideaScore.breakdown.viralClipPotential, max: 15 },
                    { label: 'Build Complexity Fit', val: ideaScore.breakdown.buildComplexityFit, max: 10 },
                  ].map((p) => (
                    <div key={p.label} className="studio-card p-3">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-300">{p.label}</span>
                        <span className="font-mono text-white">
                          {p.val}/{p.max}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.round((p.val / p.max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Strengths & Risks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="studio-card p-3.5 space-y-1.5">
                    <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
                    </div>
                    {ideaScore.strengths.map((s, i) => (
                      <p key={i} className="text-slate-300">
                        • {s}
                      </p>
                    ))}
                  </div>
                  <div className="studio-card p-3.5 space-y-1.5">
                    <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Watch-Outs
                    </div>
                    {ideaScore.risks.length === 0 ? (
                      <p className="text-slate-400">No major structural flags.</p>
                    ) : (
                      ideaScore.risks.map((r, i) => (
                        <p key={i} className="text-slate-300">
                          • {r}
                        </p>
                      ))
                    )}
                  </div>
                </div>

                {/* Recommended 3-Tier Price Ladder */}
                <div className="studio-card p-3.5">
                  <div className="text-xs font-semibold text-white mb-2">Recommended 3-Tier Robux Price Ladder</div>
                  <div className="space-y-1.5 text-xs">
                    {ideaScore.recommendedPriceLadder.map((row, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0">
                        <span className="text-slate-400">{row.tier}</span>
                        <span className="text-slate-200">{row.item}</span>
                        <span className="font-mono text-amber-300 font-semibold">{row.robux} R$</span>
                      </div>
                    ))}
                  </div>
                </div>

                {ideaScore.aiNotes && (
                  <div className="studio-card p-3.5 text-xs text-slate-200 whitespace-pre-wrap border-indigo-500/40">
                    <div className="font-semibold text-indigo-300 mb-1">Pulse Live AI Critique</div>
                    {ideaScore.aiNotes}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMPETITOR / GAME REVIEW */}
      {subTab === 'review' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-5 space-y-4">
            <form onSubmit={handleReviewGame} className="studio-panel p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Free Roblox Game Audit &amp; Teardown</h2>
                <button
                  type="button"
                  onClick={() => setManualMode((m) => !m)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {manualMode ? 'Switch to Live URL Mode' : 'Use Manual Paste Mode'}
                </button>
              </div>

              {!manualMode ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Roblox Game URL, Place ID, or universe:ID</label>
                  <input
                    className="studio-input"
                    placeholder="https://www.roblox.com/games/1537690962/Bee-Swarm-Simulator"
                    value={gameUrl}
                    onChange={(e) => setGameUrl(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Fetches public CCU, visits, favorites, like ratio, thumbnails &amp; GamePass ladder (no API key needed).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="col-span-2">
                    <label className="block text-slate-400 mb-1">Game Name</label>
                    <input className="studio-input" value={manualName} onChange={(e) => setManualName(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Active CCU</label>
                    <input type="number" className="studio-input" value={manualCcu} onChange={(e) => setManualCcu(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Total Visits</label>
                    <input type="number" className="studio-input" value={manualVisits} onChange={(e) => setManualVisits(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Favorites</label>
                    <input type="number" className="studio-input" value={manualFavs} onChange={(e) => setManualFavs(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Upvotes / Downvotes</label>
                    <div className="flex gap-1.5">
                      <input type="number" className="studio-input" value={manualUp} onChange={(e) => setManualUp(Number(e.target.value))} />
                      <input type="number" className="studio-input" value={manualDown} onChange={(e) => setManualDown(Number(e.target.value))} />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewUseAi}
                    onChange={(e) => setReviewUseAi(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  AI Teardown via Pulse CLI
                </label>
                <button type="submit" disabled={reviewLoading} className="studio-btn-primary">
                  <Search className="w-4 h-4" />
                  {reviewLoading ? 'Auditing...' : 'Run Game Review'}
                </button>
              </div>

              {reviewError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {reviewError}
                </div>
              )}
            </form>

            {/* Recent Snapshots */}
            <div className="studio-panel p-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Saved Competitor Snapshots ({snapshots.length})
              </h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {snapshots.length === 0 ? (
                  <p className="text-xs text-slate-500">No audits run yet.</p>
                ) : (
                  snapshots.map((s) => (
                    <div key={s.id} className="studio-card p-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{s.name}</div>
                        <div className="text-slate-400">
                          {s.playing.toLocaleString()} CCU • {s.likeRatio}% Likes • {s.gamePasses.length} Passes
                        </div>
                      </div>
                      <span className="font-mono text-indigo-300 font-semibold shrink-0">{s.auditScore ?? '—'}/100</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="xl:col-span-7">
            {!reviewResult ? (
              <div className="studio-panel p-10 text-center h-full flex flex-col items-center justify-center">
                <ExternalLink className="w-9 h-9 text-indigo-400 mb-3 opacity-80" />
                <h3 className="text-white font-semibold">Paste any Roblox Experience URL or Place ID</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Pull live CCU, like ratio, favorites, thumbnails, and GamePass pricing ladders to pinpoint exact monetization &amp; retention opportunities.
                </p>
              </div>
            ) : (
              <div className="studio-panel p-5 space-y-4">
                <div className="flex items-start justify-between gap-4 border-b border-studio-border pb-4">
                  <div className="flex items-center gap-3">
                    {reviewResult.snapshot.iconUrl && (
                      <img
                        src={reviewResult.snapshot.iconUrl}
                        alt={reviewResult.snapshot.name}
                        className="w-14 h-14 rounded-xl object-cover border border-slate-700"
                      />
                    )}
                    <div>
                      <h2 className="text-lg font-bold text-white">{reviewResult.snapshot.name}</h2>
                      <p className="text-xs text-slate-400">
                        by {reviewResult.snapshot.creatorName} • Universe {reviewResult.snapshot.universeId}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-extrabold text-indigo-400">{reviewResult.auditScore}/100</div>
                    <div className="text-[11px] text-slate-400 uppercase">{reviewResult.source.replace(/_/g, ' ')}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="studio-card p-3">
                    <div className="text-slate-400">Live CCU</div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {reviewResult.snapshot.playing.toLocaleString()}
                    </div>
                  </div>
                  <div className="studio-card p-3">
                    <div className="text-slate-400">Visits</div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {reviewResult.snapshot.visits.toLocaleString()}
                    </div>
                  </div>
                  <div className="studio-card p-3">
                    <div className="text-slate-400">Like Ratio</div>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">{reviewResult.snapshot.likeRatio}%</div>
                  </div>
                  <div className="studio-card p-3">
                    <div className="text-slate-400">GamePasses</div>
                    <div className="text-base font-bold text-amber-300 mt-0.5">
                      {reviewResult.snapshot.gamePasses.length}
                    </div>
                  </div>
                </div>

                {reviewResult.snapshot.gamePasses.length > 0 && (
                  <div className="studio-card p-3.5">
                    <div className="text-xs font-semibold text-white mb-2">Detected GamePass Pricing Ladder</div>
                    <div className="flex flex-wrap gap-2">
                      {reviewResult.snapshot.gamePasses.slice(0, 14).map((gp) => (
                        <span
                          key={gp.id}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
                        >
                          {gp.name}: <span className="font-mono text-amber-300">{gp.price ?? 'Off-sale'} R$</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="studio-card p-3.5 space-y-2">
                  <div className="text-xs font-semibold text-white">Prioritized Revenue &amp; Retention Upgrade Backlog</div>
                  {reviewResult.upgradeBacklog.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs p-2 rounded-lg bg-slate-900/70">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-semibold">
                        {item.priority}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                        {item.agent}
                      </span>
                      <span className="text-slate-200">{item.action}</span>
                    </div>
                  ))}
                </div>

                {reviewResult.aiTeardown && (
                  <div className="studio-card p-3.5 text-xs text-slate-200 whitespace-pre-wrap border-indigo-500/40">
                    <div className="font-semibold text-indigo-300 mb-1">Pulse Live Competitor Teardown</div>
                    {reviewResult.aiTeardown}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: REVENUE & DEVEX CALCULATOR */}
      {subTab === 'calculator' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-5 studio-panel p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Robux &amp; DevEx Revenue Assumptions</h2>

            {[
              { label: 'Target Average CCU', val: simCcu, min: 20, max: 10000, step: 20, set: setSimCcu, unit: ' CCU' },
              { label: 'Avg Session Length', val: simSession, min: 4, max: 45, step: 1, set: setSimSession, unit: ' min' },
              { label: 'Day 1 Retention (Median 10.3%)', val: simD1, min: 3, max: 35, step: 0.5, set: setSimD1, unit: '%' },
              { label: 'Day 7 Retention (Median 1.6%)', val: simD7, min: 0.5, max: 15, step: 0.2, set: setSimD7, unit: '%' },
              { label: 'Day 30 Retention (Median 0.5%)', val: simD30, min: 0.1, max: 10, step: 0.1, set: setSimD30, unit: '%' },
              { label: 'Payer Conversion (Baseline 3.8%)', val: simPayerPct, min: 1, max: 15, step: 0.2, set: setSimPayerPct, unit: '%' },
              { label: 'Monthly ARPPU (Robux)', val: simArppu, min: 50, max: 2500, step: 10, set: setSimArppu, unit: ' R$' },
              { label: 'USD → PHP Exchange Rate', val: simPhpRate, min: 45, max: 70, step: 0.5, set: setSimPhpRate, unit: ' ₱' },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{s.label}</span>
                  <span className="font-mono text-indigo-300 font-semibold">
                    {s.val}
                    {s.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={s.val}
                  onChange={(e) => s.set(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            ))}

            {project && simResult && onApplyKpisToProject && (
              <button
                onClick={() => void onApplyKpisToProject(project.id, simResult)}
                className="studio-btn-primary w-full"
              >
                Save Base Projection to Active Project ({project.name})
              </button>
            )}
          </div>

          <div className="xl:col-span-7 space-y-4">
            {simResult && (
              <>
                <div className="studio-panel p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Marketplace Fee:</span>{' '}
                    <span className="text-white font-semibold">30% (70% Net Robux)</span>
                  </div>
                  <div>
                    <span className="text-slate-400">DevEx Rate:</span>{' '}
                    <span className="text-white font-semibold">${simResult.inputs.devExRateUsdPerRobux}/R$</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Retention Health:</span>{' '}
                    <span className="text-emerald-300 font-semibold">{simResult.benchmarks.retentionHealth}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Monetization Health:</span>{' '}
                    <span className="text-amber-300 font-semibold">{simResult.benchmarks.monetizationHealth}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {simResult.scenarios.map((sc) => (
                    <div
                      key={sc.label}
                      className={`studio-panel p-4 flex flex-col justify-between ${
                        sc.label === 'Base' ? 'border-indigo-500/70 bg-indigo-950/20' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white">{sc.label}</span>
                          <span className="text-[11px] font-mono text-slate-400">{sc.multiplier}x scale</span>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs text-slate-400">Est. Monthly DevEx (USD)</div>
                          <div className="text-2xl font-extrabold text-emerald-400">
                            ${sc.monthlyUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-emerald-300/80 font-medium mt-0.5">
                            ₱{sc.monthlyPhp.toLocaleString(undefined, { maximumFractionDigits: 0 })} PHP / mo
                          </div>
                        </div>

                        <div className="mt-4 space-y-1.5 text-xs border-t border-slate-800 pt-3">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Est. CCU / DAU</span>
                            <span className="font-mono text-white">
                              {sc.estimatedCcu.toLocaleString()} / {sc.dau.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Gross Daily R$</span>
                            <span className="font-mono text-amber-300">{sc.grossDailyRobux.toLocaleString()} R$</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Net Daily R$ (-30%)</span>
                            <span className="font-mono text-white">{sc.netDailyRobux.toLocaleString()} R$</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">ARPDAU</span>
                            <span className="font-mono text-indigo-300">{sc.arpdauRobux} R$</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Annual DevEx</span>
                            <span className="font-mono text-emerald-300">
                              ${sc.annualUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

