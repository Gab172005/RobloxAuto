# Chapter 02 — First Two Minutes, Onboarding Funnels & Retention

> Mapped to: `Architect`, `Builder`, `KidTester`, `Liveops`

## 1. The Brutal Reality of the First 120 Seconds
On Roblox mobile, **30%–50% of new players leave within the first 60 seconds** if they feel confused, bored, or hit with text walls or aggressive popups. Winning games script the first 120 seconds down to the second:

| Window | Player Experience | Concrete Engineering Implementation |
|---|---|---|
| **0–5s** | Instant clarity on spawn | Orient `SpawnLocation` directly toward the first glowing target; spawn a live `Beam` trail from the player's torso to Objective #1. Zero modal popups! |
| **5–20s** | First tactile action + immediate reward | Single-tap or walk-over interaction triggers sound + particle burst + floating `+25` popup within 10 seconds of moving. |
| **20–60s** | First upgrade / power spike | Player affords Upgrade #1 in under 45 seconds and visibly feels stronger/faster/richer immediately. |
| **60–120s** | First milestone + next tease | Complete Onboarding Step 5, grant a mini celebration chest, and visually reveal the next locked zone/tier ("Unlock Neon Zone: 500 Coins") + gentle Starter Pack badge in HUD. |

## 2. Mandatory Onboarding Funnel Instrumentation (`AnalyticsService`)
Every RoForge game MUST track a 5-step onboarding funnel via `AnalyticsService:LogOnboardingFunnelStepEvent`:
1. `Step 1 — JoinedAndSpawned`: Character loaded safely on SpawnLocation.
2. `Step 2 — FirstCoreAction`: Player performed first core verb (harvested, rolled, collected, defeated, built).
3. `Step 3 — FirstCurrencyEarned`: First reward credited to profile.
4. `Step 4 — FirstUpgradePurchased`: Player spent currency on first progression upgrade.
5. `Step 5 — CoreLoopCompleted`: Player completed one full core loop (e.g., filled backpack & sold, finished round 1, unlocked 2nd station).

**Diagnostic Rule**: If >25% drop between Step 1 and Step 2, the spawn sightline or mobile controls are unclear. If >30% drop between Step 3 and Step 4, the first upgrade costs too much or the shop beacon isn't obvious.

## 3. Retention Architecture (D1 -> D7 -> D30)

### Day 1 Retention (Platform Median: 10.3% | Target: 13%–16%+)
- **7-Day Escalating Daily Streak**: Show Day 1–7 rewards clearly; Day 1 is instantly claimable after 2 minutes of play, and Day 2 displays an exciting reward ("Come back tomorrow for Rare Egg / 2x Luck Potion!"). Use UTC day math with a 48-hour grace window before resetting streak so timezone shifts never punish players.
- **Session Playtime Rewards**: 6 escalating gift timers during a single session (`2m`, `5m`, `10m`, `15m`, `25m`, `40m`) with subtle bouncing badge notification—directly boosts Average Session Length and D1 habit formation.
- **Unfinished Goal Teaser**: Always ensure the player logs off *close* to an exciting unlock (e.g., 70% toward their next zone or rebirth).

### Day 7 Retention (Platform Median: 1.6% | Target: 4%–6%+)
- **Rebirth / Prestige Loop**: Resets soft currency for permanent multipliers, exclusive titles/auras, and access to new zones—giving active players a 7+ day climb.
- **Index / Collection Compendium**: Discovering rare items/pets/fish fills a visual collection grid with permanent milestone bonuses (e.g., "Collect 15/50 for +20% Luck").
- **Friend Boosts**: Automatic `+10%` currency/luck per friend in the same server (capped at `+30%`)—encourages organic invites and social return sessions.

### Day 30 Retention (Platform Median: 0.5% | Target: 2%–5%+)
- **Weekly Content Cadence**: Modular data-driven tables (`ShopConfig`, `ZoneConfig`, `EventConfig`) let the studio drop a new zone, limited pet/item, and promo code every weekend without rewriting core code.
- **Weekend / Hourly Live Events**: Built-in `ConfigService`-driven 2x Weekend Events and hourly 5-minute Mini-Events ("Meteor Shower in 14:22!") give veterans a reason to return every week.
- **Season Pass (30-Day Track)**: 25–30 free & premium tiers earned via daily quests (`Play 10m`, `Upgrade 3 times`, `Collect 500 coins`).

## 4. Onboarding Anti-Patterns to Eliminate
- Never force a 5-page dialog tutorial before letting the player move.
- Never open a Robux purchase modal on second 0 before the player knows if they like the game.
- Never hide core objectives behind tiny text menus—use 3D world beacons, `BillboardGui` icons, and directional `Beam` trails.

