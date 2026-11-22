# Chapter 08 — Launch Operations, Thumbnail A/B Testing, Live-Ops & Scaling

> Mapped to: `Splash`, `Liveops`, `Publisher`

## 1. Staged Launch Pipeline (Never Push Untested Code to Live)
1. **Git Release Checkpoint**: Every release candidate starts from a clean Git commit & semantic tag (`v0.1.0-test`, `v1.0.0`) after `Playtest`, `KidTester`, and `Reviewer` all pass with zero `CRITICAL`/`HIGH` findings.
2. **Test Place Staging (`ROBLOX_TEST_PLACE_ID`)**:
   - Publish first to a private/friends-only **Test Place** with real DataStores enabled.
   - Smoke-test on an actual physical iPhone/Android phone + PC: verify DataStore saves across rejoins, verify test purchases of DevProducts & GamePasses, verify zero Studio/Live Console errors (`F9`).
3. **Production Place Promotion (`ROBLOX_PROD_PLACE_ID`)**:
   - **HARD GATE**: Requires explicit human sign-off in the RoForge **Review Queue** before `Publisher` invokes Open Cloud or Studio publishing.
   - Verify all `ShopConfig.luau` IDs point to real Production GamePasses/DevProducts (no `0` placeholders).

## 2. Pre-Launch Store Packaging Checklist (`Splash`)
- **Icon (512x512)** + **3 Distinct 16:9 Thumbnails (1920x1080)** uploaded for Roblox Thumbnail Personalization.
- **Title**: Hook + searchable keyword + update tag (`[🚀 LAUNCH] ...`), under 50 chars.
- **Description**: Clear 2-line hook, active launch code (`RELEASE`), group/like milestone promise ("👍 NEW CODE AT 1,000 LIKES!"), controls, and update log.
- **3 Short-Form Promos (9:16 TikTok / Reels / YouTube Shorts)**:
  - Post 1–2 clips per day during launch week showing real gameplay hooks, rare wins, and absurd progression moments.
  - Drop 1080x1920 captioned MP4s via RoForge's `ffmpeg` assembler directly into the Review Queue before posting.

## 3. Launch Week Strategy (Low/Zero-Budget + Paid Seed)
- **Day 0 (Soft Launch)**: Share with 15–30 real players (Discord communities, friends, short-form clips) to collect initial `AnalyticsService` onboarding funnel & error logs before spending a single Robux on ads.
- **Day 2–3 (Fix Leak #1)**: Inspect Creator Dashboard Onboarding Funnel. Fix any step with >25% drop-off and verify D1 retention >= 11% before scaling traffic.
- **Day 4–7 (Thumbnail & Sponsor Validation)**:
  - Run a modest Roblox Sponsor test (e.g., 5–15 ad credits/day targeted to mobile) strictly to measure live **qPTR (CTR)**, **Session Length**, **D1**, and **ARPDAU**.
  - Kill underperforming thumbnail variants after 5,000+ impressions; promote the winner and generate 2 new challengers beating the winner.
  - Once `Home Recommendation` traffic starts climbing, keep shipping weekly updates to sustain algorithmic momentum!

## 4. Weekly Live-Ops Cadence (Turning a Launch Into Compounding Income)
Games that stop updating decay rapidly in D7/D30 and Home Recommendations. Run a lightweight weekly rhythm:
- **Monday (`Liveops`)**: Pull Creator Dashboard CSV / Open Cloud metrics -> run Bottleneck Waterfall audit (CTR -> First-Minute -> D1/D7 -> Monetization).
- **Tuesday–Thursday (`Lead` + Specialists)**: Ship 1 focused weekly update (1 new zone/tier OR 1 new rare collection + 1 balance/UX fix + 1 fresh weekend promo code + 1 A/B test via `ConfigService`).
- **Friday (`Playtest` + `Reviewer` + `Splash`)**: QA pass, security gate, update thumbnail badge (`[🔥 NEW ZONE]`), assemble 1–2 TikTok promo clips.
- **Saturday (`Publisher` -> Review Queue Approval -> Live)**: Publish during peak weekend hours (10am–2pm EST / 10pm–2am PHT), trigger Launch Weekend 2x Event via `ConfigService`, and update Roblox Events page so followers get push notifications!

## 5. Emergency Rollback Playbook
If post-publish live monitoring shows >1% server script errors or any DataStore failure spike:
1. Immediately revert live Production Place to the previous known-good Place Version in Creator Hub (takes < 30 seconds).
2. Use RoForge's 1-click Git rollback to revert the offending task commit cleanly.
3. Diagnose in Test Place with `Playtest` + `Reviewer` before re-promoting.

