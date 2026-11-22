--!strict
--[[
	RoForge Studio Catalog Template: StarterPackTimer
	Server-authoritative 25-minute first-session Starter Pack controller.
	Unlocks contextually after Onboarding Step 4 (never at second 0) to lift
	first-payer conversion above the 3.8% Roblox platform baseline.
]]

export type StarterPackState = {
	Eligible: boolean,
	Purchased: boolean,
	SecondsRemaining: number,
	ExpiresAt: number,
}

local DEFAULT_DURATION_SECONDS = 25 * 60 -- 25 minutes

local StarterPackTimer = {}

function StarterPackTimer.UnlockIfEligible(profile: any, durationOverride: number?): StarterPackState
	profile.StarterPack = profile.StarterPack or {
		UnlockedAt = 0,
		ExpiresAt = 0,
		Purchased = false,
	}

	local sp = profile.StarterPack
	if sp.Purchased then
		return StarterPackTimer.GetState(profile)
	end

	if sp.UnlockedAt == 0 then
		local now = os.time()
		local duration = durationOverride or DEFAULT_DURATION_SECONDS
		sp.UnlockedAt = now
		sp.ExpiresAt = now + duration
	end

	return StarterPackTimer.GetState(profile)
end

function StarterPackTimer.GetState(profile: any): StarterPackState
	local sp = profile.StarterPack
	if not sp then
		return {
			Eligible = false,
			Purchased = false,
			SecondsRemaining = 0,
			ExpiresAt = 0,
		}
	end

	if sp.Purchased then
		return {
			Eligible = false,
			Purchased = true,
			SecondsRemaining = 0,
			ExpiresAt = sp.ExpiresAt or 0,
		}
	end

	local remaining = math.max(0, (sp.ExpiresAt or 0) - os.time())
	return {
		Eligible = sp.UnlockedAt > 0 and remaining > 0,
		Purchased = false,
		SecondsRemaining = remaining,
		ExpiresAt = sp.ExpiresAt or 0,
	}
end

function StarterPackTimer.CanPurchase(profile: any): boolean
	local state = StarterPackTimer.GetState(profile)
	return state.Eligible and not state.Purchased
end

function StarterPackTimer.MarkPurchased(profile: any): boolean
	if not StarterPackTimer.CanPurchase(profile) then
		return false
	end
	profile.StarterPack.Purchased = true
	return true
end

return StarterPackTimer

