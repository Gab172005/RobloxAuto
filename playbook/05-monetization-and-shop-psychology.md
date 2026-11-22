# Chapter 05 — Monetization Architecture, Shop Psychology & ProcessReceipt Reliability

> Mapped to: `Merchant`, `Builder`, `Frame`, `Liveops`

## 1. Platform Economics & Revenue Math
- **Marketplace Fee**: Roblox retains 30% on GamePasses & Developer Products; creators keep **70% net Robux**.
- **DevEx Conversion**: Reference DevEx exchange rate (`$0.0035 USD per Robux` -> `$350 USD per 100,000 Robux`, check Roblox DevEx portal for current official rate).
- **Platform Payer Conversion Baseline**: **~3.8%** of active users spend Robux.
- **Revenue Lever Equation**:
  $$\text{Daily DevEx USD} = \text{DAU} \times \text{Payer\%} \times \text{ARPPU}_{\text{Robux}} \times 0.70 \times \text{DevExRate}$$
  Lifting **Payer % from 2.5% -> 6.0%** via a great Starter Pack PLUS lifting **ARPPU via repeatable social sinks** multiplies income by 4x–6x at the exact same CCU!

## 2. The Ethical 3-Tier Robux Pricing Ladder
Never lock core fun behind a paywall—sell **acceleration, convenience, prestige, and social generosity**:

### Tier 1 — First-Payer Impulse Conversion (25–199 Robux)
- **Starter Pack (79–149 R$, 1-time, 25-minute timer)**: Unlocked *after* Onboarding Step 4 (never at second 0). Bundles an exclusive starter tool/pet + 15m 2x Boost + coin jumpstart representing ~3.5x standalone value. Single biggest driver of breaking the 3.8% payer barrier.
- **Mini-Boosts & Instant Actions (25–79 R$)**: 15-min 2x Luck/Coins (49 R$), Instant Spin / Skip Cooldown / Extra Life (29–59 R$).

### Tier 2 — Permanent Core Convenience & Value Passes (149–799 Robux)
- **Auto-Collect / Auto-Action (199–349 R$)**: Highest-converting pass on mobile touch screens.
- **2x Currency / 2x Luck (249–499 R$)**: Clear permanent progression boost.
- **VIP Status (399–599 R$)**: Gold chat tag, overhead crown/aura, +25% daily streak bonus, VIP chest every 4 hours.
- **+Storage / +Equip Slots (149–399 R$)**: Natural mid-game quality-of-life purchase once players accumulate loot.

### Tier 3 — High-LTV Repeatable Whale & Social Sinks (149–1,999 Robux)
- **Server-Wide Boost / Event Trigger (199–999 R$)**: Repeatable DevProduct that activates 10–15 minutes of `2x Server Luck` or `Meteor Coin Rain` for EVERYONE in the server, broadcasting a celebratory golden banner (`"🔥 @Buyer triggered 2X SERVER LUCK for 15 minutes!"`). Whales buy these repeatedly for lobby acclaim!
- **Gift Any GamePass to a Friend**: Mirror every GamePass as a repeatable DevProduct with a server-validated recipient selector. Gifts double revenue per enthusiastic supporter.
- **Season Pass (399–599 R$) + +5 Tier Skips (149 R$)**: Pairs directly with 30-day retention goals.

## 3. Contextual Purchase Triggers (Never Spammy)
Show relevant offers at peak desire moments, capped with strict cooldowns (max 1 contextual prompt per 8 minutes):
- **Starter Pack**: Subtle top-left countdown pill appears after First Upgrade; pops open once cleanly after 3–5 minutes of active play.
- **Storage Pass**: Gentle prompt when backpack hits 100% capacity for the 2nd time ("Upgrade to 2x Bag?").
- **2x Boost / Server Event**: Highlighted inside the shop when player opens it voluntarily or enters a new zone.

## 4. Bulletproof `MarketplaceService.ProcessReceipt` Rules
A single bug in `ProcessReceipt` causes either **lost customer Robux** (mass dislikes & Roblox moderation risk) OR **infinite free-item exploits**:
1. **Single Global Handler**: Assign `MarketplaceService.ProcessReceipt` in ONE server script (`MonetizationServer.server.luau`) ONLY.
2. **Idempotency Log (`ProcessedReceipts`)**: Check `profile.ProcessedReceipts[receiptInfo.PurchaseId]` first. If already present, return `Enum.ProductPurchaseDecision.PurchaseGranted` immediately without re-granting!
3. **Profile Readiness Guard**: If the player left or their profile isn't loaded yet, return `Enum.ProductPurchaseDecision.NotProcessedYet` so Roblox retries safely on their next join.
4. **Atomic Persist Before Grant Confirmation**: Record `profile.ProcessedReceipts[purchaseId] = os.time()`, mutate inventory/currency, persist via `ProfileManager.SaveProfile(player)` (`UpdateAsync`), and ONLY return `PurchaseGranted` when the save succeeds! On save failure, roll back in-memory state and return `NotProcessedYet`.
5. **Trim Old Receipt IDs Carefully**: Keep the latest 100–200 receipt IDs in the profile (sorted/pruned by timestamp) so DataStore size stays small while preventing duplicate replay.
6. **GamePass Verification**: Cache ownership per session via `pcall(MarketplaceService.UserOwnsGamePassAsync, ...)` + listen to `MarketplaceService.PromptGamePassPurchaseFinished` + check gifted passes saved in `profile.GiftedPasses`.

## 5. A/B Price & Offer Experiments (`ConfigService`)
Drive Starter Pack SKU (`StarterPack_79` vs `StarterPack_149`) and boost durations from `ConfigService` so `Liveops` can run controlled price-elasticity tests without pushing code builds.

