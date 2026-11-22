# RoForge Studio — Multi-Agent Roblox Game Factory (Powered by Gemini CLI)

**RoForge Studio** is a complete local multi-agent Roblox game development, monetization, QA, security, and growth studio engineered to build **income-generating Roblox experiences** using your locally authenticated **Gemini CLI** account (zero extra API billing, zero credit caps).

---

## Architecture Overview

```text
RobloxAuto/
├── server/          # Node.js + TypeScript + Express + WebSocket + SQLite (node:sqlite)
│   └── src/
│       ├── db/database.ts           # Persistent projects, KPIs, DAG tasks, chat, reviews, logs, snapshots
│       └── services/
│           ├── geminiRunner.ts      # Headless Gemini CLI runner (stdin piping + stream-json JSONL)
│           ├── orchestrator.ts      # DAG topological sort, parallel pool, Git checkpoints, QA & Review Gates
│           ├── robloxBridge.ts      # Studio MCP diagnostics, 1-click config merger, Rojo controller, Explorer
│           ├── marketService.ts     # Public Roblox API fetcher, Idea Scorer (0–100), DevEx USD/PHP Simulator
│           ├── mediaService.ts      # Art/media static hosting + 9:16 ffmpeg TikTok/Shorts Promo Assembler
│           ├── registryService.ts   # Dynamic 15-agent registry, prompt & playbook chapter loader
│           └── securityScanner.ts   # Static Luau & .rbxmx Creator Store backdoor sanitizer
├── client/          # React + Vite + TypeScript + Tailwind CSS dark-mode studio dashboard (8 views)
├── desktop/         # Lightweight Electron desktop wrapper (`npm run electron:dev`)
├── agents/          # Editable 15-agent `registry.json` + 15 production role prompts (`prompts/*.md`)
├── playbook/        # 8 domain-scoped Roblox Playbook chapters (`01`–`08`)
├── catalog/         # 8 vetted `--!strict` Luau starter systems (`index.json` + `templates/*.luau`)
└── workspace/       # Git-initialized Rojo game workspaces (`workspace/<project-slug>/`)
```

### The 15-Agent Specialist Roster
1. **Lead** (`pro`) — Conversational Studio Manager & DAG Task Graph Orchestrator
2. **Pulse** (`fast`) — Market Trends, Competitor Teardown & 0–100 Idea Scorer
3. **Architect** (`pro`) — Game Design Document (`docs/GDD.md`) & Technical Contract (`docs/contracts.json`)
4. **Builder** (`pro`) — `--!strict` Core Gameplay, Crash-Safe DataStores, `AnalyticsService` & `ConfigService`
5. **Frame** (`fast`) — Mobile-First Procedural UI/UX (667x375 & 844x390 phones, 44px+ targets, Gamepad)
6. **Scenic** (`fast`) — 3D World, Terrain, Lighting & Mobile-Budget Atmosphere Builder
7. **Librarian** (`fast`) — Local Catalog Reuse, Creator Store/Blender Sourcing & Hard Backdoor Sanitizer
8. **Playtest** (`fast`) — Automated Studio QA, DataStore & Anti-Dupe Verifier (`reports/playtest.json`)
9. **KidTester** (`fast`) — First-120s Multi-Device Player Experience Tester (Phone, PC, Gamepad)
10. **Reviewer** (`pro`) — Independent Exploit, RemoteEvent & `ProcessReceipt` Security Auditor
11. **Merchant** (`pro`) — 3-Tier Robux Pricing Ladder, `ShopConfig.luau` & Idempotent Monetization Server
12. **Splash** (`fast`) — SEO Store Copy, Icon/3-Variant Thumbnail A/B Pack & 9:16 TikTok/Shorts Promos
13. **Liveops** (`pro`) — 2026 Roblox Benchmark Analytics & Priority Bottleneck Diagnostic Engine
14. **AudioVFX** (`fast`, Customizable Slot 14) — Tactile Juice, Pitch-Varied SFX, Particle Bursts & Popups
15. **Publisher** (`pro`, Customizable Slot 15) — Git Release Tags, Test-to-Prod Staging & Gated Open Cloud Ops

---

## Quick Start

### Prerequisites
- **Node.js `>= 22.5`** (uses built-in `node:sqlite` — zero native C++ build tools required)
- **Git** (`git --version`)
- **Gemini CLI** installed and logged in locally (`gemini --version`)

### 1. Verify Local Gemini CLI Login
Confirm your local Gemini CLI works with zero separate API charges:
```powershell
gemini --version
gemini --help
```
RoForge Studio exclusively uses verified headless flags:
- `-p` (headless prompt trigger; full prompt piped safely via `stdin`)
- `-o stream-json` (real-time `init`, `message`, `tool_use`, `tool_result`, `error`, `result` events; exit codes `0`, `1`, `42`, `53`)
- `-m <model>` (per-agent Pro/Fast tier routing)
- `--approval-mode <plan|auto_edit|yolo|default>`
- `--allowed-mcp-server-names <server...>`
- `--skip-trust`

> If you have not logged in yet, run `gemini` once interactively to sign in with your Google/Gemini account.

### 2. Install Dependencies & Verify Core Tests
```powershell
npm install
npm run build
npm run test:core
```

### 3. Launch RoForge Studio
- **Web Browser Mode (Recommended for fastest iteration)**:
  ```powershell
  npm run dev
  ```
  Then open **http://localhost:5173** (API & WebSocket server runs on `http://127.0.0.1:4310`).

- **Native Desktop App Mode (runs side-by-side with Roblox Studio)**:
  ```powershell
  npm run electron:dev
  ```
  *(Note: If your npm configuration restricts install scripts via `allow-scripts`, approve Electron's postinstall once with `npm approve-scripts electron` before running `npm run electron:dev`.)*

---

## Tooling & Bridge Setup Guides

### Roblox Studio Built-In MCP Quick Connect + `open_cloud_invoke` Permissions
1. Open **Roblox Studio** → **File → Beta Features** and enable **Assistant MCP / Studio MCP Quick Connect**.
2. In RoForge Studio, open **Settings → Roblox Studio Built-In MCP Config Helper**:
   - Inspect your existing `~/.gemini/settings.json` status directly in the UI.
   - Optionally toggle **Include optional Blender MCP** if you want `Librarian` to pull low-poly Blender props.
   - Click **1-Click Merge into ~/.gemini/settings.json** (RoForge automatically creates `~/.gemini/settings.json.roforge.bak` first).
3. Verify the MCP bridge from your terminal:
   ```powershell
   gemini mcp list
   ```
4. **Enabling `open_cloud_invoke` Safely**:
   - Inside Roblox Studio's MCP permissions panel, grant `open_cloud_invoke` ONLY when you are ready to provision Developer Products / Game Passes or publish to a **Test Place**.
   - **Hard Safety Rules Built Into RoForge**:
     - `Publisher` and `Merchant` Open Cloud actions ALWAYS pause in the **Review Queue** for explicit human approval.
     - Optional local Open Cloud credentials stored via **Settings → Optional Roblox Open Cloud** are written ONLY to your local `.env` file and are explicitly stripped (`ROBLOX_OPEN_CLOUD_API_KEY=''`) from every Gemini CLI agent subprocess environment.

### Rojo Live Sync Setup (Optional, Recommended)
RoForge automatically scaffolds `default.project.json` in every `workspace/<project-slug>/` folder.
1. Install Rojo CLI via [Rokit](https://github.com/rojo-rbx/rokit), [Aftman](https://github.com/LPGhatguy/aftman), or Cargo:
   ```powershell
   cargo install rojo
   # or via rokit: rokit add rojo-rbx/rojo
   ```
2. Install the **Rojo 7** plugin inside Roblox Studio.
3. Click **`Rojo: Start`** in RoForge Studio's Top Bridge Status Bar (serves on port `34872`), then click **Connect** in Studio's Rojo plugin for live two-way code syncing.

### Optional `ffmpeg` Setup (9:16 TikTok / Reels / Shorts Promo Rendering)
RoForge's `Splash` agent and **Review Queue → Promo Assembler** automatically detect `ffmpeg`:
- **Without `ffmpeg`**: Gracefully generates an editable 9:16 storyboard JSON (`art/*_storyboard.json`) + exact ready-to-run `ffmpeg` command.
- **With `ffmpeg` installed**: Crops/scales 16:9 Studio gameplay clips in `workspace/<slug>/media/` into `1080x1920` (9:16), burns in hook & CTA captions, and drops a playable MP4 right into the **Review Queue**.
- Install on Windows:
  ```powershell
  winget install Gyan.FFmpeg
  # or: scoop install ffmpeg
  ```

---

## Zero to First Earning Game — Step-by-Step Workflow

1. **Validate & Score Your Concept (`Market & Review`)**
   - Open **Market & Review → Score My Idea**, load a trending high-ROI archetype (e.g., *Incremental Digging*, *RNG Collector + Base Flex*, *Co-op Extraction Chaos*), and iterate until your concept scores **>= 78/100 (`GREENLIGHT`)**.
   - Paste 2–3 competing Roblox game URLs into **Competitor / Game Review** to spot missing GamePass price tiers and retention gaps.
   - Model target CCU, D1/D7/D30 retention, payer %, and DevEx **USD & PHP** income in the **Revenue & DevEx Calculator**.
2. **Create Your Game Workspace (`Portfolio & Home`)**
   - Click **New Game Factory**, enter your title/genre/pitch. RoForge creates a Git-initialized Rojo project in `workspace/<slug>/`.
   - *(Tip: Toggle **Dry-Run Simulation Mode** in Settings anytime if you want to preview the full DAG + Review Queue flow instantly without invoking Gemini CLI.)*
3. **Kick Off the Multi-Agent Factory (`Chat with Lead` or `Tasks`)**
   - Click **Full Game Factory DAG** (or instruct `Lead` directly in Chat).
   - **Review Gate 1 (`Pulse`)**: Approve the Market Brief & Idea Scorecard.
   - **Review Gate 2 (`Architect`)**: Review `docs/GDD.md` (first-120-second onboarding script) and `docs/contracts.json` (RemoteEvents, DataStore schema, `AnalyticsService` funnels, `ConfigService` keys) before a single line of code is written.
4. **Parallel Engineering Wave (`Builder`, `Frame`, `Scenic`, `Merchant`, `AudioVFX`)**
   - Watch live Gemini CLI tool calls in **Live Terminal** and task progress/tokens in **Tasks (DAG + Kanban)**.
   - Every task gets automatic **before/after Git checkpoints** — inspect any diff or execute a **1-Click Git Rollback** anytime.
   - Use **Explorer & Assets → Local Asset Catalog** to drop vetted `--!strict` templates (`DataStoreProfileManager`, `ProcessReceiptHandler`, `DailyRewardSystem`, `StarterPackTimer`, `MobileShopUITemplate`, `RemoteRateLimiter`, `AudioVFXJuice`) straight into your project.
5. **Self-Healing QA, Mobile UX & Exploit Gate (`Playtest`, `KidTester`, `Reviewer`)**
   - Automatically triggers once engineering completes.
   - Any `CRITICAL`/`HIGH` bug, mobile 667x375 UI overlap, or `ProcessReceipt` / RemoteEvent exploit auto-spawns a targeted fix task routed to the responsible specialist (up to 2 retries).
   - Approve the clean QA & Security reports in the **Review Queue**.
6. **Launch Packaging & Viral Short-Form Promos (`Splash`)**
   - Review SEO titles, store copy, 512x512 icon spec, 3 distinct 16:9 A/B thumbnails (for Roblox Thumbnail Personalization), and 9:16 TikTok/Reels/Shorts promo videos/storyboards in the **Review Queue**.
7. **Staged Test Place → Live Production (`Publisher` + `Liveops`)**
   - Smoke-test on a physical phone + PC inside your **Test Place** (`ROBLOX_TEST_PLACE_ID`) verifying DataStore persistence and test purchases.
   - Approve the **Publisher Release Gate** in the Review Queue to promote to **Production**.
   - Every Monday, run `Liveops` against 2026 Roblox targets (D1 >= 13–16%, D7 >= 4–6%, Payer % >= 5%+) fixing leaks strictly in priority order: **CTR → First-Minute Bounce → D1/D7 Return → Monetization Depth**.
