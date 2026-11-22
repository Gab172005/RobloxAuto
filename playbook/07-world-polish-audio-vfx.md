# Chapter 07 — World Polish, Mobile Performance, Audio & VFX Juice

> Mapped to: `Scenic`, `AudioVFX`, `Librarian`

## 1. Visual Identity That Pops on Mobile & Thumbnails
Successful Roblox games are immediately recognizable from a single screenshot:
- **Cohesive Stylization**: Pick a strong silhouette + clean stylized palette (smooth plastic / subtle material variants / crisp neon accents) rather than noisy photorealistic textures that turn muddy on mobile screens.
- **Lighting Mood Setup**:
  - Set `Lighting.Technology = Enum.Technology.ShadowMap` or `Future` (test mobile smoothness), `GlobalShadows = true`, crisp `Brightness` (`2.0–3.0`), warm sunlit `ColorShift_Top`, and soft cool `OutdoorAmbient` so shadows never crush to black.
  - Add `Atmosphere` (`Density = 0.25–0.35`, tinted `Haze` & `Color`), subtle `BloomEffect` (`Intensity = 0.35`, `Threshold = 1.6`), and `ColorCorrectionEffect` (`Saturation = 0.12`, `Contrast = 0.08`) for vibrant thumbnail-ready frames right inside Studio.
- **Spawn Sightline Architecture**:
  - Within 15–35 studs directly in front of `SpawnLocation`, frame: (1) the first interactive object with a soft vertical light beam, (2) the Upgrade/Shop kiosk with a bold floating sign, and (3) a dramatic landmark teasing the mid-game goal.

## 2. Mobile Frame-Rate & Memory Budget
Over half of Roblox mobile devices run on 3–4 GB RAM budget chips:
- **Streaming**: Enable `Workspace.StreamingEnabled = true` (`StreamingMinRadius = 64`, `StreamingTargetRadius = 256`), keeping critical spawn pads and ground colliders always loaded.
- **Collision & Physics Hygiene**:
  - Set `Anchored = true` on all static world geometry.
  - Set `CanCollide = false`, `CanTouch = false`, `CanQuery = false`, `CastShadow = false` on purely decorative foliage, beams, trims, and distant props.
  - Prefer `CollisionFidelity = Enum.CollisionFidelity.Box` or `Hull` on complex meshes; avoid `PreciseConvexDecomposition` unless strictly needed for walkways.
- **Lighting Budget**: Avoid placing 40 overlapping shadow-casting `PointLight` instances in one room—use `Neon` parts + `BloomEffect` + 1–2 strategic area lights.

## 3. Studio MCP Procedural & Asset Workflows
When `Roblox_Studio` MCP is connected:
- Use procedural Luau world builders in `src/server/world/` so the base world is reproducible in Git, and layer Studio MCP tools (`generate_procedural_model`, `generate_material`, `insert_asset`, `generate_animation`) for hero landmarks and props.
- Always pass imported models through `Librarian`'s backdoor sanitizer before saving.

## 4. High-Dopamine Game Feel ("Juice") Checklist (`AudioVFX`)
Every core action should layer **3 synchronized sensory cues** (Audio + Visual + Motion):

| Event | Audio (`SoundService`) | Visual (`ParticleEmitter`/`Highlight`/`BillboardGui`) | Motion (`TweenService`/Camera) |
|---|---|---|---|
| **Core Click / Collect** | Crisp pop/chime with `PlaybackSpeed` jitter `0.93–1.08` (escalates on combo!) | 8–12 burst particles (`Emit(10)`) + floating `+25` BillboardGui | Target squash-and-stretch tween (`0.12s`) |
| **Upgrade / Unlock** | Rising harmonic chord + sparkle | Golden ring burst + brief `Highlight` flash on upgraded object | Subtle FOV punch (`70 -> 73 -> 70`) |
| **Rare Drop / Rebirth** | Sub-bass impact + fanfare | Sky beam + multi-stage `Emit(30)` confetti/stars + screen flash | Brief damped camera trauma shake (respects reduced-motion setting) |
| **Server-Wide Boost** | Global gong/horn + upbeat loop shift | Temporary sky tint shift + top-screen animated gold banner | All players get subtle aura trail for event duration |

## 5. Performance-Safe Client VFX Rules
- **Burst, Don't Leak**: Use `emitter:Emit(count)` on disabled emitters (`Enabled = false`) and clean up temporary attachments via `Debris:AddItem(part, 1.5)` or an object pool.
- **Respect Player Settings**: Expose an `SFXVolume`, `MusicVolume`, and `ReducedMotion` toggle in client settings so players can mute audio or turn off camera shake without losing gameplay clarity.
- **Asset Fallbacks**: Guard sound playback with safe checks so missing/unapproved audio IDs never throw client errors.

