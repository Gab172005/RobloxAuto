--!strict
--[[
	RoForge Studio Catalog Template: AudioVFXJuice
	Mobile-safe client game-feel controller: pitch-varied SFX, particle bursts,
	floating reward numbers, Highlight pulses, and reduced-motion camera trauma.
]]

local Debris = game:GetService("Debris")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local AudioVFXJuice = {}
AudioVFXJuice.SfxVolume = 0.7
AudioVFXJuice.ReducedMotion = false

local trauma = 0
local shakeBound = false

function AudioVFXJuice.PlaySfx(soundId: string, baseVolume: number?, pitchMin: number?, pitchMax: number?)
	if AudioVFXJuice.SfxVolume <= 0 or soundId == "" then
		return
	end

	local sound = Instance.new("Sound")
	sound.SoundId = soundId
	sound.Volume = (baseVolume or 0.6) * AudioVFXJuice.SfxVolume
	local lo = pitchMin or 0.94
	local hi = pitchMax or 1.07
	sound.PlaybackSpeed = lo + math.random() * (hi - lo)
	sound.Parent = SoundService

	sound:Play()
	Debris:AddItem(sound, 3)
end

function AudioVFXJuice.BurstParticles(worldPosition: Vector3, color: Color3, count: number?)
	local anchor = Instance.new("Part")
	anchor.Name = "VfxBurstAnchor"
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanTouch = false
	anchor.CanQuery = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(0.2, 0.2, 0.2)
	anchor.CFrame = CFrame.new(worldPosition)
	anchor.Parent = workspace

	local emitter = Instance.new("ParticleEmitter")
	emitter.Enabled = false
	emitter.Color = ColorSequence.new(color)
	emitter.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.45),
		NumberSequenceKeypoint.new(1, 0),
	})
	emitter.Lifetime = NumberRange.new(0.35, 0.75)
	emitter.Speed = NumberRange.new(10, 22)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Drag = 4
	emitter.Parent = anchor

	emitter:Emit(math.clamp(count or 14, 4, 35))
	Debris:AddItem(anchor, 1.2)
end

function AudioVFXJuice.SpawnFloatingNumber(worldPosition: Vector3, text: string, color: Color3)
	local anchor = Instance.new("Part")
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanTouch = false
	anchor.CanQuery = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(0.1, 0.1, 0.1)
	anchor.CFrame = CFrame.new(worldPosition + Vector3.new((math.random() - 0.5) * 1.5, 1.5, (math.random() - 0.5) * 1.5))
	anchor.Parent = workspace

	local billboard = Instance.new("BillboardGui")
	billboard.Size = UDim2.fromScale(4, 1.4)
	billboard.AlwaysOnTop = true
	billboard.Parent = anchor

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBold
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.Parent = billboard

	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Color = Color3.fromRGB(15, 18, 30)
	stroke.Parent = label

	TweenService:Create(anchor, TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		CFrame = anchor.CFrame + Vector3.new(0, 3.2, 0),
	}):Play()

	TweenService:Create(label, TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
		TextTransparency = 1,
	}):Play()

	Debris:AddItem(anchor, 0.9)
end

function AudioVFXJuice.FlashHighlight(target: Instance, color: Color3, duration: number?)
	local highlight = Instance.new("Highlight")
	highlight.FillColor = color
	highlight.OutlineColor = Color3.new(1, 1, 1)
	highlight.FillTransparency = 0.45
	highlight.OutlineTransparency = 0
	highlight.Adornee = target
	highlight.Parent = target

	local dur = duration or 0.45
	TweenService:Create(highlight, TweenInfo.new(dur, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		FillTransparency = 1,
		OutlineTransparency = 1,
	}):Play()

	Debris:AddItem(highlight, dur + 0.05)
end

function AudioVFXJuice.AddCameraTrauma(amount: number)
	if AudioVFXJuice.ReducedMotion then
		return
	end
	trauma = math.clamp(trauma + amount, 0, 0.65)
	if not shakeBound then
		shakeBound = true
		RunService:BindToRenderStep("RoForgeCameraJuice", Enum.RenderPriority.Camera.Value + 1, function(dt: number)
			if trauma <= 0.001 then
				trauma = 0
				return
			end
			local camera = workspace.CurrentCamera
			if camera then
				local shake = trauma * trauma
				local offset = CFrame.new(
					(math.random() - 0.5) * shake * 1.1,
					(math.random() - 0.5) * shake * 1.1,
					0
				)
				camera.CFrame = camera.CFrame * offset
			end
			trauma = math.max(0, trauma - dt * 1.9)
		end)
	end
end

return AudioVFXJuice

