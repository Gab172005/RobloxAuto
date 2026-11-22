import type { StudioDatabase } from '../db/database.js';
import type { CompetitorSnapshotRecord } from '../types.js';
import type { GeminiRunner } from './geminiRunner.js';
import type { RegistryService } from './registryService.js';

export interface IdeaScoreInput {
  title: string;
  genre: string;
  coreLoop: string;
  monetizationIdeas?: string;
  targetAudience?: string;
  viralHook?: string;
  useAiEnrichment?: boolean;
  projectId?: string;
}

export interface IdeaScoreBreakdown {
  trendMomentum: number; // /20
  firstTwoMinHook: number; // /20
  mobileFit: number; // /15
  monetizationDepth: number; // /20
  viralClipPotential: number; // /15
  buildComplexityFit: number; // /10
}

export interface IdeaScoreResult {
  title: string;
  genre: string;
  totalScore: number;
  verdict: 'GREENLIGHT' | 'REFINE_HOOK' | 'PIVOT';
  breakdown: IdeaScoreBreakdown;
  strengths: string[];
  risks: string[];
  recommendedPriceLadder: Array<{ tier: string; item: string; robux: number }>;
  viralClipAngle: string;
  aiNotes?: string;
}

export interface RevenueSimInput {
  ccu?: number;
  dau?: number;
  avgSessionMinutes: number;
  d1RetentionPct: number;
  d7RetentionPct: number;
  d30RetentionPct: number;
  payerConversionPct: number;
  arppuRobux: number;
  marketplaceFeePct?: number; // default 30
  devExRateUsdPerRobux?: number; // default 0.0035
  usdToPhpRate?: number; // default 58
}

export interface ScenarioProjection {
  label: 'Conservative' | 'Base' | 'Breakout';
  multiplier: number;
  dau: number;
  estimatedCcu: number;
  dailyPayers: number;
  grossDailyRobux: number;
  netDailyRobux: number;
  arpdauRobux: number;
  dailyUsd: number;
  monthlyUsd: number;
  annualUsd: number;
  monthlyPhp: number;
  annualPhp: number;
}

export interface RevenueSimResult {
  inputs: Required<RevenueSimInput>;
  benchmarks: {
    d1Target: number;
    d7Target: number;
    d30Target: number;
    payerBaseline: number;
    retentionHealth: 'Strong' | 'Average' | 'Needs Work';
    monetizationHealth: 'Strong' | 'Average' | 'Needs Work';
  };
  scenarios: ScenarioProjection[];
}

export interface GameReviewResult {
  snapshot: CompetitorSnapshotRecord;
  source: 'roblox_live_api' | 'manual_paste';
  auditScore: number;
  pillars: {
    engagementHealth: number;
    socialProof: number;
    monetizationLadder: number;
    retentionSignals: number;
  };
  pricingGaps: string[];
  strengths: string[];
  upgradeBacklog: Array<{ priority: 'P0' | 'P1' | 'P2'; agent: string; action: string }>;
  aiTeardown?: string;
}

const HOT_GENRE_WEIGHTS: Record<string, number> = {
  rng: 17,
  simulator: 16,
  tycoon: 16,
  'tycoon-simulator': 18,
  fishing: 17,
  digging: 17,
  incremental: 17,
  survival: 16,
  escape: 16,
  horror: 16,
  tower: 15,
  defense: 15,
  arena: 15,
  obby: 10,
  rpg: 11,
};

export function parseRobloxGameIdentifier(input: string): { placeId?: string; universeId?: string } {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/roblox\.com\/games\/(\d+)/i);
  if (urlMatch) {
    return { placeId: urlMatch[1] };
  }
  const universePrefix = trimmed.match(/^u(?:niverse)?[:=\s]+(\d+)$/i);
  if (universePrefix) {
    return { universeId: universePrefix[1] };
  }
  if (/^\d{5,}$/.test(trimmed)) {
    return { placeId: trimmed };
  }
  return {};
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RoForgeStudio/1.0',
      },
    });
    if (res.status === 429) {
      throw new Error('Roblox public API rate-limited this request (HTTP 429). Try again shortly or use Manual Paste Mode.');
    }
    if (!res.ok) {
      throw new Error(`Roblox API responded HTTP ${res.status} for ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function simulateRevenue(raw: RevenueSimInput): RevenueSimResult {
  const avgSessionMinutes = Math.max(2, Math.min(120, raw.avgSessionMinutes || 12));
  const marketplaceFeePct = raw.marketplaceFeePct ?? 30;
  const devExRateUsdPerRobux = raw.devExRateUsdPerRobux ?? 0.0035;
  const usdToPhpRate = raw.usdToPhpRate ?? 58.0;

  // Approximate DAU from CCU using average session length & 1.8 sessions/day/DAU if DAU isn't provided
  const sessionsPerDayPerUser = 1.8;
  const derivedDau =
    raw.dau && raw.dau > 0
      ? Math.round(raw.dau)
      : Math.max(10, Math.round(((raw.ccu || 100) * 1440) / (avgSessionMinutes * sessionsPerDayPerUser)));
  const derivedCcu =
    raw.ccu && raw.ccu > 0
      ? Math.round(raw.ccu)
      : Math.max(1, Math.round((derivedDau * avgSessionMinutes * sessionsPerDayPerUser) / 1440));

  const inputs: Required<RevenueSimInput> = {
    ccu: derivedCcu,
    dau: derivedDau,
    avgSessionMinutes,
    d1RetentionPct: Math.max(0, Math.min(100, raw.d1RetentionPct)),
    d7RetentionPct: Math.max(0, Math.min(100, raw.d7RetentionPct)),
    d30RetentionPct: Math.max(0, Math.min(100, raw.d30RetentionPct)),
    payerConversionPct: Math.max(0, Math.min(50, raw.payerConversionPct)),
    arppuRobux: Math.max(0, raw.arppuRobux),
    marketplaceFeePct,
    devExRateUsdPerRobux,
    usdToPhpRate,
  };

  const netFactor = Math.max(0, 1 - marketplaceFeePct / 100);
  // Retention lift factor reflects compounding DAU stability & repeat spend depth
  const retentionMultiplier = Math.max(
    0.55,
    Math.min(1.65, 0.7 + (inputs.d1RetentionPct / 15) * 0.25 + (inputs.d7RetentionPct / 4) * 0.15 + (inputs.d30RetentionPct / 2) * 0.1)
  );

  const buildScenario = (label: ScenarioProjection['label'], multiplier: number): ScenarioProjection => {
    const scenarioDau = Math.round(inputs.dau * multiplier);
    const scenarioCcu = Math.round(inputs.ccu * multiplier);
    const effectivePayerPct = inputs.payerConversionPct * (label === 'Conservative' ? 0.8 : label === 'Breakout' ? 1.25 : 1.0);
    const effectiveArppu = inputs.arppuRobux * (label === 'Conservative' ? 0.85 : label === 'Breakout' ? 1.25 : 1.0) * retentionMultiplier;

    const dailyPayers = scenarioDau * (effectivePayerPct / 100);
    // Spread monthly ARPPU across ~6 active spending days/month for realistic daily run-rate
    const grossDailyRobux = dailyPayers * (effectiveArppu / 6);
    const netDailyRobux = grossDailyRobux * netFactor;
    const arpdauRobux = scenarioDau > 0 ? grossDailyRobux / scenarioDau : 0;
    const dailyUsd = netDailyRobux * devExRateUsdPerRobux;
    const monthlyUsd = dailyUsd * 30;
    const annualUsd = dailyUsd * 365;

    return {
      label,
      multiplier,
      dau: scenarioDau,
      estimatedCcu: scenarioCcu,
      dailyPayers: Number(dailyPayers.toFixed(1)),
      grossDailyRobux: Math.round(grossDailyRobux),
      netDailyRobux: Math.round(netDailyRobux),
      arpdauRobux: Number(arpdauRobux.toFixed(2)),
      dailyUsd: Number(dailyUsd.toFixed(2)),
      monthlyUsd: Number(monthlyUsd.toFixed(2)),
      annualUsd: Number(annualUsd.toFixed(2)),
      monthlyPhp: Number((monthlyUsd * usdToPhpRate).toFixed(2)),
      annualPhp: Number((annualUsd * usdToPhpRate).toFixed(2)),
    };
  };

  const retentionHealth =
    inputs.d1RetentionPct >= 13 && inputs.d7RetentionPct >= 3.5
      ? 'Strong'
      : inputs.d1RetentionPct >= 9.5
        ? 'Average'
        : 'Needs Work';

  const monetizationHealth =
    inputs.payerConversionPct >= 5.0 && inputs.arppuRobux >= 300
      ? 'Strong'
      : inputs.payerConversionPct >= 3.5
        ? 'Average'
        : 'Needs Work';

  return {
    inputs,
    benchmarks: {
      d1Target: 14,
      d7Target: 4.5,
      d30Target: 2.5,
      payerBaseline: 3.8,
      retentionHealth,
      monetizationHealth,
    },
    scenarios: [
      buildScenario('Conservative', 0.5),
      buildScenario('Base', 1.0),
      buildScenario('Breakout', 3.5),
    ],
  };
}

export class MarketService {
  constructor(
    private db: StudioDatabase,
    private registry: RegistryService,
    private gemini: GeminiRunner
  ) {}

  public getTrendingArchetypes() {
    return [
      {
        id: 'rng-collector-tycoon',
        name: 'RNG Roll + Base Flex Tycoon',
        momentumScore: 91,
        avgMobileShare: '82%',
        monetizationFit: 'Very High (Luck Passes, Server Luck, Auto-Roll, Gifting)',
        viralHook: '1-in-1,000,000 mythic cutscenes + giant glowing base displays',
        estimatedMvpHours: '4–8 hrs with RoForge',
      },
      {
        id: 'incremental-dig-fish',
        name: 'Incremental Digging / Fishing / Salvage',
        momentumScore: 89,
        avgMobileShare: '79%',
        monetizationFit: 'Very High (Auto-Collect, Storage, 2x Cash, Server Meteor Rain)',
        viralHook: 'Pulling absurdly giant rare items out of the ground/ocean',
        estimatedMvpHours: '5–9 hrs with RoForge',
      },
      {
        id: 'coop-extraction-chaos',
        name: 'Co-op Extraction / Escape Chaos',
        momentumScore: 86,
        avgMobileShare: '72%',
        monetizationFit: 'High (Revives, Loadout Passes, Troll/Event Triggers, Season Pass)',
        viralHook: '10-second clutch escapes & hilarious physics fails for TikTok/Shorts',
        estimatedMvpHours: '8–14 hrs with RoForge',
      },
      {
        id: 'pet-merge-arena',
        name: 'Auto-Battle Merge & Rebirth Simulator',
        momentumScore: 84,
        avgMobileShare: '85%',
        monetizationFit: 'Very High (Starter Pack, +Equip Slots, 2x Speed, VIP)',
        viralHook: 'Before/After Level 1 vs Level 999 army showcase',
        estimatedMvpHours: '6–10 hrs with RoForge',
      },
    ];
  }

  public async scoreIdea(input: IdeaScoreInput): Promise<IdeaScoreResult> {
    const text = `${input.title} ${input.genre} ${input.coreLoop} ${input.monetizationIdeas || ''} ${input.viralHook || ''}`.toLowerCase();

    // 1. Trend Momentum (0-20)
    let trendMomentum = 13;
    for (const [kw, weight] of Object.entries(HOT_GENRE_WEIGHTS)) {
      if (text.includes(kw)) {
        trendMomentum = Math.max(trendMomentum, weight);
      }
    }
    if (/(co-op|coop|friends|multiplayer|server|social|flex|trade)/.test(text)) trendMomentum = Math.min(20, trendMomentum + 2);

    // 2. First-2-Min Hook (0-20)
    let firstTwoMinHook = 12;
    if (/(instant|fast|10s|collect|roll|upgrade|dig|fish|click|tap|hatch|unlock|rebirth)/.test(text)) firstTwoMinHook += 4;
    if (input.coreLoop.length >= 40) firstTwoMinHook += 2;
    if (/(complex story|long tutorial|cutscene|open world rpg)/.test(text)) firstTwoMinHook -= 4;
    firstTwoMinHook = Math.max(5, Math.min(20, firstTwoMinHook));

    // 3. Mobile Fit (0-15)
    let mobileFit = 11;
    if (/(auto|one-tap|tap|idle|simulator|tycoon|rng|collect|merge|fish|dig)/.test(text)) mobileFit += 3;
    if (/(fps|sniper|precision aim|complex combo|20 buttons)/.test(text)) mobileFit -= 4;
    mobileFit = Math.max(4, Math.min(15, mobileFit));

    // 4. Monetization Depth (0-20)
    let monetizationDepth = 11;
    if (/(starter pack|vip|2x|auto|luck|storage|pass)/.test(text)) monetizationDepth += 4;
    if (/(server boost|server luck|event|gift|season pass|cosmetic|skin|revive|spin)/.test(text)) monetizationDepth += 4;
    if (!input.monetizationIdeas || input.monetizationIdeas.trim().length < 10) monetizationDepth -= 1;
    monetizationDepth = Math.max(5, Math.min(20, monetizationDepth));

    // 5. Viral Clip Potential (0-15)
    let viralClipPotential = 9;
    if (/(rare|mythic|giant|chaos|troll|explosion|meteor|fail|secret|boss|1 in|shiny|golden)/.test(text)) {
      viralClipPotential += 4;
    }
    if (input.viralHook && input.viralHook.trim().length > 15) viralClipPotential += 2;
    viralClipPotential = Math.max(4, Math.min(15, viralClipPotential));

    // 6. Build Complexity Fit (0-10)
    let buildComplexityFit = 7;
    if (/(procedural|simulator|tycoon|rng|obby|fishing|digging|arena)/.test(text)) buildComplexityFit += 2;
    if (/(mmo|open world|100 quests|realistic physics|custom anime combat)/.test(text)) buildComplexityFit -= 4;
    buildComplexityFit = Math.max(2, Math.min(10, buildComplexityFit));

    const totalScore =
      trendMomentum + firstTwoMinHook + mobileFit + monetizationDepth + viralClipPotential + buildComplexityFit;
    const verdict: IdeaScoreResult['verdict'] =
      totalScore >= 78 ? 'GREENLIGHT' : totalScore >= 64 ? 'REFINE_HOOK' : 'PIVOT';

    const strengths: string[] = [];
    const risks: string[] = [];

    if (trendMomentum >= 16) strengths.push('Aligned with high-velocity Roblox discovery sub-genres.');
    else risks.push('Genre momentum looks crowded or slow—add a fresh viral twist or social mechanic.');

    if (mobileFit >= 12) strengths.push('Strong two-thumb phone ergonomics (75%+ Roblox mobile audience).');
    else risks.push('Control scheme may feel cramped on 667x375 mobile screens—simplify interactions.');

    if (monetizationDepth >= 15) strengths.push('Clear path to 3-tier Robux monetization (Impulse + Passes + Social Whale Sinks).');
    else risks.push('Add a 99 R$ Starter Pack, Auto-Collect pass, and repeatable Server-Wide Boost to beat 3.8% payer baseline.');

    if (viralClipPotential >= 12) strengths.push('Natural 10-second visual payoff moments for TikTok/Reels/Shorts.');
    else risks.push('Inject a dramatic spectacle mechanic (server-wide meteor/luck event or absurd scale progression) for clipability.');

    if (buildComplexityFit < 6) risks.push('High art/engineering scope—slice MVP to 1 core zone + 1 progression loop first.');

    let aiNotes: string | undefined;
    if (input.useAiEnrichment && input.projectId) {
      const project = this.db.getProject(input.projectId);
      const settings = this.db.getSettings();
      if (project && !settings.dryRunMode) {
        const { systemPrompt } = this.registry.buildAgentContextPrompt('Pulse', project.workspacePath);
        const prompt = `${systemPrompt}\n\nScore this Roblox game concept briefly (max 200 words) with 1 killer twist to raise CTR & ARPDAU:\nTitle: ${input.title}\nGenre: ${input.genre}\nCore Loop: ${input.coreLoop}\nMonetization: ${input.monetizationIdeas || 'Standard 3-tier'}\nViral Hook: ${input.viralHook || 'None specified'}\nDeterministic Baseline Score: ${totalScore}/100`;
        const run = await this.gemini.run({
          projectId: project.id,
          taskId: null,
          agentId: 'Pulse',
          cwd: project.workspacePath,
          prompt,
          model: this.registry.resolveModelForAgent('Pulse', settings),
          approvalMode: 'plan',
          timeoutMs: 60_000,
          maxRetries: 0,
        });
        if (run.success && run.outputText.trim()) {
          aiNotes = run.outputText.trim();
        }
      }
    }

    if (input.projectId) {
      this.db.updateProject(input.projectId, { ideaScore: totalScore });
    }

    return {
      title: input.title,
      genre: input.genre,
      totalScore,
      verdict,
      breakdown: {
        trendMomentum,
        firstTwoMinHook,
        mobileFit,
        monetizationDepth,
        viralClipPotential,
        buildComplexityFit,
      },
      strengths,
      risks,
      recommendedPriceLadder: [
        { tier: 'Impulse (Tier 1)', item: 'First-Session Starter Pack (25m Timer)', robux: 99 },
        { tier: 'Impulse (Tier 1)', item: '15-Min 2x Luck / Currency Boost', robux: 49 },
        { tier: 'Permanent (Tier 2)', item: 'Auto-Collect / Auto-Action Pass', robux: 249 },
        { tier: 'Permanent (Tier 2)', item: '2x Currency Forever Pass', robux: 349 },
        { tier: 'Permanent (Tier 2)', item: 'VIP Crown + +25% Daily Streak', robux: 499 },
        { tier: 'Social Whale (Tier 3)', item: 'Server-Wide 2x Event Trigger (15m)', robux: 399 },
        { tier: 'Social Whale (Tier 3)', item: 'Season Pass + Repeatable Tier Skips', robux: 499 },
      ],
      viralClipAngle:
        input.viralHook?.trim() ||
        `"POV: Someone triggered a 10x Server Event in ${input.title} and my starter gear evolved into a GIANT mythic!"`,
      aiNotes,
    };
  }

  /**
   * Fetches live public Roblox API telemetry for any game URL, Place ID, or Universe ID,
   * or analyzes manually pasted game metrics when rate-limited/offline.
   */
  public async reviewGame(input: {
    gameUrlOrId?: string;
    projectId?: string;
    useAiTeardown?: boolean;
    manualData?: {
      name: string;
      creatorName?: string;
      playing: number;
      visits: number;
      favoritedCount: number;
      upVotes: number;
      downVotes: number;
      gamePasses?: Array<{ id: number; name: string; price: number | null }>;
    };
  }): Promise<GameReviewResult> {
    let source: 'roblox_live_api' | 'manual_paste' = 'roblox_live_api';
    let placeId = '0';
    let universeId = '0';
    let name = 'Unknown Experience';
    let creatorName = 'Unknown Creator';
    let playing = 0;
    let visits = 0;
    let favoritedCount = 0;
    let upVotes = 0;
    let downVotes = 0;
    let iconUrl: string | null = null;
    let thumbnailUrls: string[] = [];
    let gamePasses: Array<{ id: number; name: string; price: number | null }> = [];
    let rawPayload: unknown = {};

    if (input.manualData) {
      source = 'manual_paste';
      name = input.manualData.name;
      creatorName = input.manualData.creatorName || 'Manual Entry';
      playing = input.manualData.playing;
      visits = input.manualData.visits;
      favoritedCount = input.manualData.favoritedCount;
      upVotes = input.manualData.upVotes;
      downVotes = input.manualData.downVotes;
      gamePasses = input.manualData.gamePasses || [];
      rawPayload = input.manualData;
    } else if (input.gameUrlOrId) {
      const parsed = parseRobloxGameIdentifier(input.gameUrlOrId);
      if (!parsed.placeId && !parsed.universeId) {
        throw new Error('Could not parse a valid Roblox Game URL, Place ID, or Universe ID.');
      }

      placeId = parsed.placeId || '0';
      universeId = parsed.universeId || '';

      if (!universeId && parsed.placeId) {
        const uniRes = await fetchJsonWithTimeout<{ universeId?: number }>(
          `https://apis.roblox.com/universes/v1/places/${parsed.placeId}/universe`
        );
        if (!uniRes.universeId) {
          throw new Error(`No Universe ID returned for Place ID ${parsed.placeId}.`);
        }
        universeId = String(uniRes.universeId);
      }

      const [detailsRes, votesRes, iconRes, thumbsRes, passesRes] = await Promise.allSettled([
        fetchJsonWithTimeout<{ data?: Array<Record<string, unknown>> }>(
          `https://games.roblox.com/v1/games?universeIds=${universeId}`
        ),
        fetchJsonWithTimeout<{ data?: Array<{ upVotes?: number; downVotes?: number }> }>(
          `https://games.roblox.com/v1/games/votes?universeIds=${universeId}`
        ),
        fetchJsonWithTimeout<{ data?: Array<{ imageUrl?: string }> }>(
          `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`
        ),
        fetchJsonWithTimeout<{ data?: Array<{ thumbnails?: Array<{ imageUrl?: string }> }> }>(
          `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=4&defaults=true&size=768x432&format=Png&isCircular=false`
        ),
        fetchJsonWithTimeout<{ data?: Array<{ id: number; name: string; price: number | null }> }>(
          `https://games.roblox.com/v1/games/${universeId}/game-passes?limit=100&sortOrder=Asc`
        ),
      ]);

      if (detailsRes.status === 'fulfilled' && detailsRes.value.data?.[0]) {
        const d = detailsRes.value.data[0];
        name = String(d.name || name);
        placeId = String(d.rootPlaceId || placeId);
        const creator = d.creator as Record<string, unknown> | undefined;
        creatorName = String(creator?.name || creatorName);
        playing = Number(d.playing || 0);
        visits = Number(d.visits || 0);
        favoritedCount = Number(d.favoritedCount || 0);
        rawPayload = d;
      } else {
        throw new Error(
          detailsRes.status === 'rejected'
            ? detailsRes.reason?.message || 'Failed to fetch Roblox universe details'
            : `Universe ${universeId} was not found in Roblox public API.`
        );
      }

      if (votesRes.status === 'fulfilled' && votesRes.value.data?.[0]) {
        upVotes = Number(votesRes.value.data[0].upVotes || 0);
        downVotes = Number(votesRes.value.data[0].downVotes || 0);
      }
      if (iconRes.status === 'fulfilled' && iconRes.value.data?.[0]?.imageUrl) {
        iconUrl = iconRes.value.data[0].imageUrl;
      }
      if (thumbsRes.status === 'fulfilled' && thumbsRes.value.data?.[0]?.thumbnails) {
        thumbnailUrls = thumbsRes.value.data[0].thumbnails
          .map((t) => t.imageUrl)
          .filter((u): u is string => Boolean(u));
      }
      if (passesRes.status === 'fulfilled' && Array.isArray(passesRes.value.data)) {
        gamePasses = passesRes.value.data.map((p) => ({
          id: Number(p.id),
          name: String(p.name),
          price: p.price !== null && p.price !== undefined ? Number(p.price) : null,
        }));
      }
    } else {
      throw new Error('Provide either gameUrlOrId or manualData.');
    }

    const totalVotes = upVotes + downVotes;
    const likeRatio = totalVotes > 0 ? Number(((upVotes / totalVotes) * 100).toFixed(1)) : 0;
    const favRate = visits > 0 ? (favoritedCount / visits) * 100 : 0;

    // Score audit pillars (each 0-25 -> total 0-100)
    const engagementHealth = Math.min(
      25,
      Math.round((playing >= 5000 ? 25 : playing >= 1000 ? 22 : playing >= 200 ? 18 : playing >= 30 ? 13 : 8))
    );
    const socialProof = Math.min(
      25,
      Math.round(likeRatio >= 90 ? 25 : likeRatio >= 82 ? 21 : likeRatio >= 72 ? 16 : likeRatio >= 60 ? 11 : 6)
    );
    const retentionSignals = Math.min(
      25,
      Math.round(favRate >= 2.0 ? 24 : favRate >= 1.0 ? 20 : favRate >= 0.4 ? 15 : 10)
    );

    const pricedPasses = gamePasses.filter((g) => g.price !== null && g.price > 0);
    const hasImpulse = pricedPasses.some((g) => (g.price || 0) <= 199);
    const hasMidTier = pricedPasses.some((g) => (g.price || 0) >= 200 && (g.price || 0) <= 799);
    const hasWhaleTier = pricedPasses.some((g) => (g.price || 0) >= 800);

    let monetizationLadder = 6;
    if (hasImpulse) monetizationLadder += 6;
    if (hasMidTier) monetizationLadder += 7;
    if (hasWhaleTier) monetizationLadder += 6;
    monetizationLadder = Math.min(25, monetizationLadder);

    const auditScore = engagementHealth + socialProof + retentionSignals + monetizationLadder;

    const pricingGaps: string[] = [];
    const strengths: string[] = [];
    const upgradeBacklog: GameReviewResult['upgradeBacklog'] = [];

    if (likeRatio >= 85) strengths.push(`High player sentiment (${likeRatio}% like ratio).`);
    else {
      upgradeBacklog.push({
        priority: 'P0',
        agent: 'KidTester',
        action: `Like ratio is ${likeRatio}% — audit first-120s onboarding, mobile clipping, and bugs causing early downvotes.`,
      });
    }

    if (playing >= 500) strengths.push(`Strong live concurrency (${playing.toLocaleString()} CCU).`);
    if (thumbnailUrls.length >= 3) strengths.push(`${thumbnailUrls.length} active thumbnails ready for A/B personalization.`);
    else {
      upgradeBacklog.push({
        priority: 'P0',
        agent: 'Splash',
        action: 'Ship 3 genuinely distinct 16:9 A/B thumbnails for Roblox Thumbnail Personalization to boost Home CTR.',
      });
    }

    if (!hasImpulse) {
      pricingGaps.push('Missing low-friction impulse tier (49–199 R$ Starter Pack / entry pass) to lift payer % past 3.8%.');
      upgradeBacklog.push({
        priority: 'P0',
        agent: 'Merchant',
        action: 'Add a 99 R$ timed Starter Pack & 49 R$ 2x Boost impulse tier.',
      });
    }
    if (!hasMidTier) {
      pricingGaps.push('Missing core permanent convenience GamePasses (200–799 R$ Auto-Collect, 2x Currency, VIP).');
      upgradeBacklog.push({
        priority: 'P1',
        agent: 'Merchant',
        action: 'Add Auto-Collect (249 R$), 2x Currency (349 R$), and VIP (499 R$) permanent passes.',
      });
    }
    if (!hasWhaleTier) {
      pricingGaps.push('Missing high-LTV whale/social tier (800+ R$ pass, Server-Wide Boosts, or Gifting).');
      upgradeBacklog.push({
        priority: 'P1',
        agent: 'Merchant',
        action: 'Add repeatable Server-Wide Boost events (399–799 R$) + Friend Pass Gifting to lift ARPPU.',
      });
    }
    if (favRate < 1.0) {
      upgradeBacklog.push({
        priority: 'P1',
        agent: 'Liveops',
        action: 'Favorite-to-visit ratio is below 1% — add 7-day escalating daily streaks & next-update countdown board.',
      });
    }

    let aiTeardown: string | undefined;
    if (input.useAiTeardown && input.projectId) {
      const project = this.db.getProject(input.projectId);
      const settings = this.db.getSettings();
      if (project && !settings.dryRunMode) {
        const { systemPrompt } = this.registry.buildAgentContextPrompt('Pulse', project.workspacePath);
        const prompt = `${systemPrompt}\n\nProvide a concise competitor teardown (max 250 words) and 3 tactics to out-earn this Roblox game:\nGame: ${name} by ${creatorName}\nCCU: ${playing}, Visits: ${visits}, Favorites: ${favoritedCount}, Like Ratio: ${likeRatio}%\nGamePasses: ${JSON.stringify(gamePasses.slice(0, 15))}\nIdentified Gaps: ${pricingGaps.join('; ')}`;
        const run = await this.gemini.run({
          projectId: project.id,
          taskId: null,
          agentId: 'Pulse',
          cwd: project.workspacePath,
          prompt,
          model: this.registry.resolveModelForAgent('Pulse', settings),
          approvalMode: 'plan',
          timeoutMs: 60_000,
          maxRetries: 0,
        });
        if (run.success && run.outputText.trim()) {
          aiTeardown = run.outputText.trim();
        }
      }
    }

    const summaryText = `Audit ${auditScore}/100 | CCU ${playing.toLocaleString()} | Like ${likeRatio}% | Passes ${pricedPasses.length}`;
    const snapshot = this.db.saveCompetitorSnapshot({
      projectId: input.projectId || null,
      placeId,
      universeId,
      name,
      creatorName,
      playing,
      visits,
      favoritedCount,
      upVotes,
      downVotes,
      likeRatio,
      iconUrl,
      thumbnailUrls,
      gamePasses,
      auditScore,
      auditSummary: aiTeardown || summaryText,
      rawPayload,
    });

    return {
      snapshot,
      source,
      auditScore,
      pillars: {
        engagementHealth,
        socialProof,
        monetizationLadder,
        retentionSignals,
      },
      pricingGaps,
      strengths,
      upgradeBacklog,
      aiTeardown,
    };
  }
}

