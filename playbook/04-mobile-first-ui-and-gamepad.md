# Chapter 04 — Mobile-First UI, Safe Areas & Gamepad Ergonomics

> Mapped to: `Frame`, `KidTester`

## 1. Design for 667x375 First, Scale Up to 1920x1080
Over 75% of Roblox players play on landscape mobile phones (commonly **667x375** iPhone SE, **844x390** iPhone 14, and **800x360** budget Android). If your UI looks crisp on 667x375, it will look great everywhere.

### Mandatory Viewport Safe Zones
```
+-------------------------------------------------------------------+
| [Roblox Topbar Safe Area ~58px]       [Currency Pills Center/Top] |
|                                                                   |
|                                                      [Shop]       |
|                                                      [Daily]      |
|                                                      [Quests]     |
| [Reserved: Mobile Thumbstick]      [Reserved: Mobile Jump Button] |
+-------------------------------------------------------------------+
```
- Always set `ScreenGui.ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets` and `ScreenGui.ResetOnSpawn = false`.
- **NEVER** place HUD buttons in the bottom-left 25%x40% (virtual thumbstick) or bottom-right 22%x40% (jump button).
- Place primary action buttons (Shop, Daily, Quests, Rebirth) along the **mid-left or mid-right vertical rail** or **top-right**, with generous spacing (`UIPadding` + `UIListLayout`).

## 2. Scale + Constraint Rules (Zero Clipping Guarantee)
1. **Use `UDim2.fromScale(x, y)` for all layout positioning and container sizing**.
2. **Modals**: Size main modal container to roughly `UDim2.fromScale(0.78, 0.80)` centered at `AnchorPoint = Vector2.new(0.5, 0.5)`, `Position = UDim2.fromScale(0.5, 0.5)` with `UIAspectRatioConstraint` (`AspectRatio = 1.55`, `DominantAxis = Enum.DominantAxis.Height`) AND `UISizeConstraint` (`MaxSize = Vector2.new(920, 580)`, `MinSize = Vector2.new(440, 280)`).
3. **Scrollable Content**: Put shop cards, inventories, and quest lists inside `ScrollingFrame` with `AutomaticCanvasSize = Enum.AutomaticSize.Y` and `CanvasSize = UDim2.fromScale(0, 0)` paired with `UIGridLayout` or `UIListLayout` + `UIPadding`.
4. **44px+ Touch Target Rule**: Every clickable button must render at >= `44x44` screen pixels on a 667x375 phone (approx `0.12` height scale or `UISizeConstraint.MinSize = Vector2.new(44, 44)`).
5. **Readable Typography**:
   - Use `TextScaled = true` + `UITextSizeConstraint` (`MinTextSize = 11`, `MaxTextSize = 32`).
   - Prefer crisp high-contrast fonts (`Enum.Font.FredokaOne` or `Enum.Font.GothamBold` / `BuilderSansBold`) with `UIStroke` (thickness 1.5–2.5, dark outline) so numbers stay legible over bright 3D worlds.

## 3. Visual Polish & Tactile Micro-Interactions (`TweenService`)
- **Button Press Feel**: On `MouseButton1Down` / `TouchTap`, tween a child `UIScale` to `0.92` (`0.08s`, `Enum.EasingStyle.Quad`), then spring back to `1.0` (`0.15s`, `Enum.EasingStyle.Back`).
- **Modal Entrance**: Tween `UIScale` from `0.85` -> `1.0` (`0.22s`, `Enum.EasingStyle.Back`, `Out`) alongside a subtle dark backdrop fade (`BackgroundTransparency = 0.45`).
- **Attention Badges**: Add a crisp red/gold notification dot + gentle periodic pulse tween on `Daily` when claimable or `Starter Pack` while active—never obstruct the player's view.
- **Currency Roll-Up**: Smoothly interpolate displayed coin/gem numbers over `0.3s` and briefly bump text scale (`1.15x`) when coins increase.

## 4. Gamepad & Keyboard Accessibility
Console players convert at some of the highest Robux ARPPU on Roblox! Always wire:
- `Selectable = true` on all modal buttons; `Selectable = false` on non-interactive frames/labels.
- When opening any modal on gamepad (`UserInputService.GamepadEnabled`), set `GuiService.SelectedObject = primaryButton`.
- When closing a modal, clear `GuiService.SelectedObject = nil`.
- Bind `Enum.KeyCode.ButtonB` (and `Escape` on PC) via `ContextActionService` to close the active modal cleanly.
- Provide optional PC shortcut hints (`[E]`, `[B] Shop`) that automatically hide on `UserInputService.TouchEnabled` devices.

## 5. Shop UI Conversion Best Practices
- Always fetch live localized Robux prices via `MarketplaceService:GetProductInfo(id, infoType)` (cached on client) with `ShopConfig` fallback when IDs are placeholders (`0`).
- Highlight the best-value GamePass with a `"BEST VALUE"` gold ribbon and show exact concrete benefits (`+100% Coins Forever`, `Auto-Collects While Moving`).
- Keep the **Close (`X`)** button large, top-right of the modal frame, high-contrast red, and NEVER clipped off-screen on 667x375.

