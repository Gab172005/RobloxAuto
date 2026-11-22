# SPEC: RoForge Studio — Multi-Agent Roblox Game Factory (Powered by Gemini CLI)

Build a complete, production-ready local multi-agent Roblox game automation studio called **RoForge Studio**. It must replicate every feature of **RoAutomation Studio Pro** (https://roautomation.dev/) and extend it with advanced revenue, monetization, competitor intelligence, portfolio management, and automated growth tooling specifically engineered to produce **income-generating Roblox games** using my locally authenticated `gemini` CLI account (zero separate API billing, zero credit caps).

---

## Step 0: Environment & CLI Verification (Mandatory First Action)
Before writing any runner code, execute shell checks to inspect my local environment:
1. Run `gemini --help` to verify exact supported flags for:
   - Headless mode (`-p` / `--prompt` + stdin piping)
   - Structured output (`--output-format json` and `--output-format stream-json` emitting `init`, `message`, `tool_use`, `tool_result`, `error`, `result` JSONL events; exit codes `0`, `1`, `42`, `53`)
   - Model selection flag (e.g., `-m` / `--model`)
   - Non-interactive approval / sandbox flags (e.g., `--yolo` / `--approval-mode`)
2. Check whether `git`, `rojo`, `ffmpeg`, and `~/.gemini/settings.json` exist on this machine.
Use ONLY verified CLI flags in the codebase.

---

## Architecture & Tech Stack
Build a clean TypeScript monorepo launchable with a single root `npm run dev` (plus an optional `npm run electron:dev` desktop shell):

1. **`server/`** — Node.js + TypeScript + Express + WebSocket (`ws`) + SQLite (`better-sqlite3` or `node:sqlite`) for persistent projects, portfolio KPIs, tasks, chat logs, review items, competitor snapshots, and asset catalog metadata.
2. **`client/`** — React + Vite + TypeScript + Tailwind CSS (sleek dark-mode studio UI modeled after RoAutomation + live Studio Explorer + Portfolio Revenue Dashboard).
3. **`desktop/`** — Lightweight Electron wrapper (`electron/`) so the app can run either in the browser OR as a native Windows/macOS desktop app alongside Roblox Studio.
4. **`agents/`** — Exact 15-agent registry (`agents/registry.json`) + deep role prompts (`agents/prompts/*.md`) + per-agent model tier (`fast` vs `pro`) + per-agent tool/permission scopes.
5. **`playbook/`** — Structured, deeply detailed Roblox Playbook chapters (`playbook/*.md`) mapped per agent in `registry.json` so every specialist only loads its domain chapters.
6. **`catalog/`** — Local curated asset, template, and world-pack library (`catalog/index.json` + starter reusable Luau modules & monetization/UI templates).
7. **`workspace/<project-slug>/`** — Git-initialized Rojo project (`default.project.json`, `src/server`, `src/client`, `src/shared`, `docs/`, `art/`, `media/`, `reports/`, `assets/`).

---

## Exact 15-Agent Roster (RoAutomation Structure + Revenue Upgrades)
Define all 15 agents in `agents/registry.json` (fully editable without code changes) and write detailed, production-grade system prompts in `agents/prompts/`:

1. **`Lead`** (Studio Manager & Orchestrator)
   - Primary conversational interface. Turns high-level goals into a strict JSON Task Graph (DAG), delegates to the 14 specialists, tracks blockers, manages cross-agent handoffs, enforces quality/security gates, and surfaces ONLY high-leverage human decisions (idea pick, GDD sign-off, pricing ladder, launch art, promos, publishing) in the **Review Queue**.
2. **`Pulse`** (Market Trends, Competitor Teardown & Idea Scorer)
   - Uses live public Roblox web APIs (wrapped via local server endpoints) to analyze rising genres, competitor CCU, like ratios, visits, favorites, and GamePass price ladders.
   - Powers **Market Trends**, **Score My Idea** (0–100 scorecard across Trend Momentum, First-2-Min Hook, Mobile Fit, Monetization Depth, Viral Clip Potential, Build Complexity), and **Game Review** (paste any Roblox URL/Universe ID for an instant public-data audit).
3. **`Architect`** (Game Designer & Systems Architect)
   - Writes the complete **Game Design Document** (`docs/GDD.md`) and strict machine-readable **Technical Contract** (`docs/contracts.json`: RemoteEvents, RemoteFunctions, DataStore schemas, progression curves, onboarding funnel steps, and `ConfigService` A/B test keys) BEFORE any code is written.
4. **`Builder`** (Core Gameplay, Persistence & Telemetry Engineer)
   - Writes `--!strict` Luau in `src/server/` and `src/shared/`.
   - Implements server-authoritative loops, crash-safe DataStores (`pcall`, session locking, exponential backoff, `BindToClose`), first-2-minute onboarding rewards, and mandatory `AnalyticsService` instrumentation (`LogOnboardingFunnelStepEvent`, `LogFunnelStepEvent`, `LogEconomyEvent`) + `ConfigService` remote tuning hooks.
5. **`Frame`** (Mobile-First UI / UX Engineer)
   - Builds working procedural Studio UI in `src/client/ui/` (HUD, shop, inventory, daily rewards, starter pack popup, quests, rebirth/upgrade modals) following strict phone-first layout rules: `UDim2` scale, `UIListLayout`, `UIAspectRatioConstraint`, `UIPadding`, 44px+ touch targets, safe-area insets, and crisp `TweenService` feedback.
6. **`Scenic`** (3D World, Terrain, Lighting & Atmosphere Builder)
   - Builds the 3D environment via Roblox Studio MCP tools (`generate_procedural_model`, `generate_material`, 3D mesh generation, `execute_luau` terrain/lighting builders) and procedural Luau scripts (`src/server/world/`), optimizing draw calls/streaming for mobile GPUs.
7. **`Librarian`** (Asset Catalog, 3D/Animation Sourcing & Backdoor Sanitizer)
   - Manages the local `catalog/` templates & world packs, searches Creator Store/Inventory via Studio MCP (`insert_asset`, `generate_animation`), supports optional Blender MCP asset workflows, and enforces a **Hard Security Sanitization Rule**: automatically inspects every imported model and strips unauthorized `Script`, `LocalScript`, `ModuleScript`, `require(assetId)`, or `getfenv` backdoors.
8. **`Playtest`** (Automated Studio QA & Cross-Place Tester)
   - Runs automated Luau static checks + live Roblox Studio MCP playtests (including cross-place teleport tests when applicable), reads server & client Output logs, checks DataStore save/load, spawn safety, reward anti-duplication, and captures viewport screenshots for Review (`reports/playtest.json`). Auto-routes failures back to `Builder`, `Frame`, or `Scenic`.
9. **`KidTester`** (Multi-Device Player Experience Tester — Phone, PC, Gamepad)
   - Simulates a first-time player on **mobile phone (844x390 & 667x375), PC, and gamepad** using Studio MCP device simulation/screenshots and keyboard/navigation checks.
   - Audits the **critical first 120 seconds**: time-to-first-fun, UI overlap/cut-offs on phones, thumb ergonomics, readability, and tutorial friction (`reports/kid_tester.json`).
10. **`Reviewer`** (Security, Economy & Exploit Auditor)
    - Independently audits all scripts, RemoteEvents, `MarketplaceService.ProcessReceipt` idempotency (preventing double grants or lost purchases), DataStore race conditions, client-trusted payloads, rate limiting, and trade/gift dupe vectors. Blocks release on any `CRITICAL` or `HIGH` finding (`reports/security_review.json`).
11. **`Merchant`** (Monetization, Pricing Ladder & Live-Ops Economy Designer)
    - Engineers high-converting, ethical Roblox monetization (`docs/monetization.md`, `src/shared/ShopConfig.luau`, `src/server/MonetizationServer.server.luau`):
      - Low-friction impulse tier (49–199 Robux Starter Pack, 2x Boosts, Spin/Skip) to lift payer conversion above the 3.8% platform baseline.
      - Mid-tier permanent value (VIP, Auto-Collect, 2x Luck/Currency, Storage GamePasses).
      - High-LTV whale sinks (repeatable DevProducts, Server-Wide Luck/Event Triggers, Gifting Passes to Friends, Season Pass + Tier Skips).
    - Can auto-provision Developer Products and Game Passes via Roblox Studio MCP's `open_cloud_invoke` ONLY after explicit user approval in the Review Queue.
12. **`Splash`** (Launch Art, Thumbnail A/B Pack, Store Copy & TikTok/Shorts Promo Maker)
    - Generates SEO-optimized game titles, store descriptions, update logs, icon & multi-variant thumbnail concepts/specs (for Roblox Thumbnail Personalization A/B testing), and short-form video promo scripts + shot lists (`art/store_page.md`, `art/promo_scripts.md`).
    - Integrates with local `ffmpeg` video builder service to assemble Studio gameplay clips + hooks/captions into ready-to-post 9:16 TikTok/Reels/Shorts MP4s, dropping previews directly into the **Review Queue**.
13. **`Liveops`** (Post-Launch Analytics, Retention & Revenue Optimizer)
    - Ingests live game stats (Open Cloud analytics / pasted Creator Dashboard CSVs / public Roblox API snapshots) and benchmarks them against 2026 Roblox targets (D1 median 10.3% -> target 13–16%+; D7 median 1.6%; D30 median 0.5% -> target 2–5%+ via seasonal events; ARPDAU & payer conversion).
    - Diagnoses the exact bottleneck in priority order: (1) Low Play-Through -> route new thumbnails to `Splash`, (2) First-minute bounce -> shorten onboarding via `Builder`/`Frame`, (3) Low D1 return -> add daily streaks/session goals, (4) High retention + low spend -> optimize shop offers/triggers via `Merchant`.
14. **`AudioVFX`** *(Customizable Slot 14 — Juice, Audio & VFX Specialist)*
    - Implements satisfying game feel ("juice") that drives session length and viral clips: `SoundService` SFX bindings, `ParticleEmitter`/`Beam`/`Highlight` reward bursts, camera shake, number popups, and procedural VFX modules (`src/client/vfx/`, `src/shared/AudioConfig.luau`).
15. **`Publisher`** *(Customizable Slot 15 — Release, Version Checkpoints & Open Cloud Ops)*
    - Manages Git release tags, staged Test Place vs. Production Place checklists, patch notes, and Open Cloud / MCP publishing workflows.
    - **Hard Safety Rule**: NEVER publishes to live production, uploads paid assets, or modifies live Robux prices without explicit human approval in the Review Queue.

---

## Modular Roblox Playbook (`playbook/`)
Create rich, actionable Markdown chapters (not thin placeholders) mapped to specific agents in `agents/registry.json`:
1. `01-market-and-viral-hooks.md` (`Lead`, `Pulse`, `Splash`) — Rising genre signals, first-5-second thumbnail CTR rules, viral TikTok clip moments.
2. `02-first-two-minutes-and-retention.md` (`Architect`, `Builder`, `KidTester`, `Liveops`) — Onboarding funnels, immediate gratification loops, D1/D7/D30 retention mechanics, daily streaks, seasonal live-ops events.
3. `03-luau-architecture-and-datastores.md` (`Architect`, `Builder`) — Strict Luau (`--!strict`), Rojo conventions, Profile/session locking, `BindToClose`, `AnalyticsService` & `ConfigService` patterns.
4. `04-mobile-first-ui-and-gamepad.md` (`Frame`, `KidTester`) — Phone aspect ratios, thumb zones, `UIListLayout`/`UIAspectRatioConstraint`, zero clipping, gamepad focus navigation.
5. `05-monetization-and-shop-psychology.md` (`Merchant`, `Builder`, `Frame`, `Liveops`) — 3-tier Robux pricing ladder (Starter Pack, Permanent Passes, Server Boosts/Gifting/Season Pass), contextual purchase triggers, `ProcessReceipt` reliability, A/B price experiments.
6. `06-anti-exploit-and-asset-security.md` (`Reviewer`, `Librarian`, `Builder`) — Server authority, RemoteEvent validation & rate limiting, dupe prevention, Creator Store backdoor scanning.
7. `07-world-polish-audio-vfx.md` (`Scenic`, `AudioVFX`, `Librarian`) — Mobile draw-call budgets, lighting mood, Studio MCP asset generation, high-dopamine VFX/SFX feedback.
8. `08-launch-liveops-and-scaling.md` (`Splash`, `Liveops`, `Publisher`) — Test-place staging, thumbnail A/B testing, ad/sponsor launch checklist, reading funnel drop-offs, weekly update cadence.

---

## Core Engine & Backend Services (`server/src/`)

### 1. Headless Gemini CLI Runner (`geminiRunner.ts`)
- Executes `gemini` subprocesses using my local Gemini CLI login (NO API keys required).
- Supports per-agent model routing (configurable in Settings & `registry.json`, e.g., assign Pro model to `Lead`/`Architect`/`Reviewer`/`Merchant` and Flash model to fast formatting/logging tasks).
- Pipes prompts safely via `stdin` (no OS arg length overflow).
- Streams `--output-format stream-json` events (`init`, `message`, `tool_use`, `tool_result`, `error`, `result`) in real time over WebSockets to the UI, tracking exact token counts, latency, and exit codes (`0`, `1`, `42`, `53`).
- Supports concurrency limits, timeouts, retry with backoff, and instant kill/cancel.

### 2. Multi-Agent DAG Orchestrator & Autonomous Factory Loop (`orchestrator.ts`)
- **Conversational Lead + Autonomous Background Execution**: Chat with `Lead` to launch an entire game pipeline ("Find a trending niche, score it, design it, build core + mobile UI + shop, playtest on phone/PC, audit exploits, and prep launch art + TikTok promo") or run targeted feature jobs.
- **DAG Validation & Parallel Worker Pool**: Strict JSON schema validation, cycle detection, automatic JSON repair retry, parallel execution (default concurrency `3`) respecting `dependsOn`.
- **Git Auto-Checkpoint & Diffs**: Automatically commits before/after every task inside `workspace/<project-slug>/`, exposing file diffs and 1-click task rollback in the UI.
- **Self-Healing QA/Security Loop**: After build tasks finish, automatically schedules `Playtest`, `KidTester`, and `Reviewer`. Any `CRITICAL`/`HIGH` finding automatically spawns fix tasks routed to the responsible agent (up to `maxRetries = 2`).
- **Human-in-the-Loop Review Gate**: Any task with `requiresReview: true` (Idea Pitch, GDD, Monetization Pricing, Visual Screenshots/Clips, Store Art/Promos, Publishing) pauses cleanly in the **Review Queue** until approved or sent back with revision notes.

### 3. Roblox Studio Bridge & MCP Diagnostics (`robloxBridge.ts`)
- **Roblox Studio Built-In MCP Detection**: Inspects `~/.gemini/settings.json` for the `Roblox_Studio` MCP entry (and optional `blender` MCP entry), surfaces connection readiness in the UI, and provides a 1-click "Generate Gemini CLI MCP Config" helper + setup instructions for Studio's Quick Connect and `open_cloud_invoke` permissions.
- **Rojo Sync Controller**: Auto-scaffolds `default.project.json`, detects `rojo` CLI, and provides start/stop controls + live port status for `rojo serve`.
- **Live Explorer Panel (Rojo + Studio Snapshot)**: Lets the user browse the game's Roblox hierarchy (`ServerScriptService`, `ReplicatedStorage`, `StarterPlayerScripts`, `Workspace` scripts), inspect properties/code, and click "Send to Lead" to reference any object in chat.

### 4. Market Intelligence, Game Review & Revenue Simulator (`marketService.ts`)
- **Public Roblox API Fetcher (No Key Needed)**: Given any Roblox Game URL, Place ID, or Universe ID, fetches live public data (`apis.roblox.com` / `games.roblox.com` / `thumbnails.roblox.com`) including Universe details, CCU, visits, favorites, upvote/downvote ratio, icons/thumbnails, and public GamePasses/prices (with graceful rate-limit handling and fallback manual paste mode).
- **Free Game Review & Competitor Teardown**: Feeds fetched data to `Pulse` + `Merchant` + `Liveops` to generate a scored audit (0–100) and concrete revenue/retention upgrade backlog.
- **Robux & DevEx Revenue Simulator**: Interactive calculator modeling `DAU / CCU`, `D1/D7/D30 retention`, `Payer %`, `ARPPU / ARPDAU`, `Roblox marketplace fee (30%)`, and `DevEx USD payout` across conservative / base / breakout scenarios—plus estimated PHP & USD conversion display.

### 5. Media, Asset Catalog & Promo Video Service (`mediaService.ts`)
- Manages `workspace/<project>/art/` and `media/` (screenshots, icons, thumbnails, recorded gameplay clips) served statically to the **Review Queue** with image/video preview players.
- **TikTok / Shorts Assembler**: If `ffmpeg` is installed, provides a server endpoint `Splash` can invoke to crop/scale gameplay clips to `1080x1920` (9:16), burn in hook captions, and export a ready-to-upload MP4 promo into the Review Queue (gracefully falls back to storyboard + edit script if `ffmpeg` is absent).
- **Local Asset Catalog (`catalog/`)**: Searchable library of starter Luau monetization templates (DataStore Profile Manager, `ProcessReceipt` Handler, Daily Reward System, Starter Pack Timer, `AnalyticsService` Wrapper, Mobile Shop UI Template) that `Librarian` and `Builder` can clone directly into new projects.

---

## Dashboard UI (`client/`) — RoAutomation + Revenue Factory Layout
Build a sleek, responsive dark-mode studio app with persistent left sidebar navigation and top Bridge Status Bar (Gemini CLI Auth, Studio MCP Status, Rojo Serve Toggle, Active Project Switcher):

1. **Portfolio & Home**: Multi-game studio overview (Idea -> Building -> Testing -> Live), estimated revenue summary, quick "New Game Factory" button, and live 15-agent status grid.
2. **Chat with Lead**: Primary chat workspace with inline delegation cards, quick-action templates ("Pitch Trending Game", "Run Full QA + Security Audit", "Add Monetization Shop", "Generate Launch Pack"), and object references from the Explorer.
3. **Market & Game Review**:
   - **Score My Idea** form -> instant 0–100 scorecard from `Pulse`.
   - **Competitor / Game Review** -> paste any Roblox game URL to pull live public stats + AI revenue/retention teardown.
   - **Revenue & DevEx Calculator** -> interactive sliders for CCU, retention, conversion, ARPPU, and USD/PHP payout projections.
4. **Tasks (DAG + Kanban)**: Interactive visual task board showing agent badges, dependency links, live progress, token usage, elapsed time, `git diff` viewer modal, and 1-click Git rollback.
5. **Review Queue**: Visual approval inbox for GDDs, Monetization Ladders, Screenshots (PC & Phone side-by-side), Thumbnails/Icons, Security/Playtest Reports, TikTok Promo Videos, and Publish Gates—with **Approve** and **Request Changes (with feedback)** buttons.
6. **Live Terminal**: Real-time filterable WebSocket stream (All Agents or click any of the 15 agents) showing live Gemini CLI thoughts, tool calls, and outputs.
7. **Explorer, Files & Assets**: Dual-tab view with (a) Project File & Luau Code Viewer + Roblox Hierarchy Tree and (b) Searchable Local Asset/Template Catalog + Playbook Editor + Agent Registry Editor (so I can tweak prompts, playbook chapters, or model routing in the UI).
8. **Settings**: Gemini CLI model routing per agent, max parallel agents, auto-QA retries, Roblox Studio MCP config helper, optional Open Cloud Universe ID/Key (stored locally in `.env` / OS-local config, never sent to prompts), and Electron desktop build scripts.

---

## Phased Implementation Plan (Execute Sequentially & Verify Each Phase)
Because this is a full studio application, build it cleanly in 4 phases—verifying compilation and tests at the end of EVERY phase:

- **Phase 1 — Foundation, Registry, Playbook & Core Backend**:
  - Run Step 0 CLI/environment checks.
  - Create monorepo structure, root `package.json`, `agents/registry.json`, all 15 `agents/prompts/*.md`, all 8 `playbook/*.md`, and starter `catalog/` Luau templates.
  - Implement SQLite store, `geminiRunner.ts`, `orchestrator.ts` (DAG + Git checkpoints + QA loop + Review Gates), and `robloxBridge.ts`.
  - Verify `server` TypeScript build passes with 0 errors.
- **Phase 2 — Market Intelligence, Media/Promo Service & REST/WS API**:
  - Implement `marketService.ts` (Roblox public API fetcher, Competitor Teardown, Revenue/DevEx math), `mediaService.ts` (`ffmpeg` 9:16 promo assembler + review media hosting), and all Express + WebSocket endpoints.
  - Add and run `npm run test:core` verifying: (a) all 15 agents + playbook mappings load cleanly, (b) DAG topological sort & cycle detection, (c) Review Gate pause/resume, (d) Git checkpoint + rollback, and (e) Creator Store backdoor scanner regex/AST check.
- **Phase 3 — Full Studio Dashboard UI (`client/`)**:
  - Build all 8 sidebar views in React + Tailwind CSS connected live to REST + WebSockets, including the interactive Revenue/DevEx simulator, visual Review Queue (images/video/markdown/diffs), Live Terminal, Explorer, and Playbook/Agent Editor.
  - Verify `client` production build (`vite build`) passes with 0 errors.
- **Phase 4 — Desktop Wrapper (`desktop/`), Documentation & End-to-End Verification**:
  - Add lightweight Electron wrapper (`npm run electron:dev`) and comprehensive `README.md` covering: Gemini CLI login check, Roblox Studio MCP Quick Connect + `open_cloud_invoke` permissions guide, Rojo setup, `ffmpeg` optional setup, and a "Zero to First Earning Game" workflow guide.
  - Run full root build + `npm run test:core` and report exact commands to launch.