# Chapter 03 — Strict Luau Architecture, Rojo Conventions & Crash-Safe DataStores

> Mapped to: `Architect`, `Builder`, `Playtest`

## 1. Rojo Project Layout (`default.project.json`)
Every RoForge workspace follows one predictable, version-controlled Rojo hierarchy:
- `src/shared/` -> `ReplicatedStorage.Shared` (Configs, Type definitions, Remote manifest, Constants — NO server secrets!)
- `src/server/` -> `ServerScriptService.Server` (`*.server.luau` entrypoints + `modules/*.luau` services + `world/*.luau` procedural map builders)
- `src/client/` -> `StarterPlayer.StarterPlayerScripts.Client` (`*.client.luau` entrypoints + `ui/*.luau` + `vfx/*.luau`)

## 2. Strict Luau Standards (`--!strict`)
- **Every `.luau` file MUST begin with `--!strict`**.
- Export explicit record types (`export type PlayerProfile = { ... }`) in `src/shared/Types.luau`.
- Avoid untyped `any` except at validated external boundaries (`RemoteEvent.OnServerEvent` parameters, immediately narrowed via `typeof(...)` guards).
- Use `task.wait`, `task.spawn`, `task.delay`, and `task.defer`—NEVER deprecated `wait()`, `spawn()`, or `delay()`.
- Avoid `while true do` loops without clean lifecycle termination (`player.Parent == Players` or `Maid`/cleanup flags).
- Minimize `WaitForChild(name)` without timeouts on dynamic objects; use `WaitForChild(name, 10)` and handle `nil` gracefully to prevent `Infinite yield possible` warnings.

## 3. Crash-Safe DataStore Pattern (Zero Data Loss, Zero Dupes)
All player persistence MUST follow these 6 hardened rules (see `catalog/templates/DataStoreProfileManager.luau`):

1. **Single Atomic `UpdateAsync` Per Profile**: Store the player's entire profile in one structured table under key `"player_" .. tostring(player.UserId)` rather than scattering 10 separate `SetAsync` calls across stores (eliminates partial-save corruption and DataStore budget exhaustion).
2. **Session Locking Inside `UpdateAsync`**:
   - Store `_meta = { SchemaVersion = 1, SessionJobId = game.JobId, LockTimestamp = os.time(), SaveCount = 0 }`.
   - If another live server (`SessionJobId ~= game.JobId`) holds a lock fresher than `180` seconds, retry with backoff before either stealing a stale lock or kicking the player cleanly (`"Your data is still saving on another server—please rejoin in a moment."`).
3. **Exponential Backoff with `pcall`**:
   - Retry transient DataStore failures up to 5 times (`1s, 2s, 4s, 8s` jittered).
   - If loading still fails, DO NOT create an empty default profile that will overwrite real data on leave! Mark profile as unavailable and kick/notify safely.
4. **Schema Reconciliation / Migration**:
   - Recursively merge default template fields into loaded tables so adding new features (e.g., `DailyStreak`, `SeasonPassXp`) never crashes returning players with `nil` indexing.
5. **Autosave + `PlayerRemoving` + `game:BindToClose`**:
   - Periodic autosave every 180–300 seconds (staggered per player).
   - Release `SessionJobId = nil` inside `PlayerRemoving` and `BindToClose`.
   - Inside `BindToClose`, save all remaining active profiles in parallel via `task.spawn`, waiting until all finish or a 25-second safety ceiling elapses (in Studio, skip unnecessary delays if no profiles remain).
6. **Never Yield Between Check & Mutate**:
   - Deduct currency or mark a daily reward claimed *synchronously* before any yielding call.

## 4. Mandatory `AnalyticsService` & `ConfigService` Wrappers
- **`AnalyticsService`**:
  - `LogOnboardingFunnelStepEvent(player, step, stepName)` — Steps 1..5 from `docs/contracts.json`.
  - `LogFunnelStepEvent(player, funnelName, sessionId, step, stepName)` — Shop open -> Item clicked -> Purchase completed.
  - `LogEconomyEvent(player, flowType, currencyType, amount, endingBalance, transactionType, itemSku)` — Every coin/gem grant and spend.
  - Always wrap Analytics calls in `pcall` so Studio test environments never break gameplay loops.
- **`ConfigService` Remote Tuning**:
  - Load remote A/B test parameters (`StarterPackPriceRobux`, `BaseRewardMultiplier`, `DailyBonusScale`, `EventActive`) safely through a cached `ConfigWrapper` module that falls back to `docs/contracts.json` defaults whenever offline or in Studio.

## 5. Remote Management
Create a single server bootstrapper (`src/server/RemotesInit.server.luau`) that creates `ReplicatedStorage.Remotes` and every `RemoteEvent`/`RemoteFunction` declared in `docs/contracts.json` on startup so clients never race or infinitely yield.

