--!strict
--[[
	RoForge Studio Catalog Template: DailyRewardSystem
	7-day escalating daily login streak with UTC day math, 48-hour grace window,
	VIP bonus hook, and atomic double-claim protection.
]]

export type DailyRewardTier = {
	Day: number,
	Coins: number,
	Gems: number,
	Label: string,
}

export type ClaimResult = {
	Success: boolean,
	Reason: string?,
	DayClaimed: number?,
	CoinsGranted: number?,
	GemsGranted: number?,
	NextClaimUtcDay: number?,
}

local SECONDS_PER_DAY = 86400

local REWARD_LADDER: { DailyRewardTier } = {
	{ Day = 1, Coins = 250, Gems = 5, Label = "250 Coins + 5 Gems" },
	{ Day = 2, Coins = 500, Gems = 10, Label = "500 Coins + 10 Gems" },
	{ Day = 3, Coins = 1000, Gems = 15, Label = "1,000 Coins + 15 Gems" },
	{ Day = 4, Coins = 2000, Gems = 25, Label = "2,000 Coins + 25 Gems" },
	{ Day = 5, Coins = 3500, Gems = 40, Label = "3,500 Coins + 40 Gems" },
	{ Day = 6, Coins = 6000, Gems = 65, Label = "6,000 Coins + 65 Gems" },
	{ Day = 7, Coins = 12000, Gems = 150, Label = "MEGA DAY 7 CHEST!" },
}

local DailyRewardSystem = {}

function DailyRewardSystem.GetCurrentUtcDay(): number
	return math.floor(os.time() / SECONDS_PER_DAY)
end

function DailyRewardSystem.GetLadder(): { DailyRewardTier }
	return REWARD_LADDER
end

function DailyRewardSystem.CanClaim(profile: any): (boolean, number)
	local today = DailyRewardSystem.GetCurrentUtcDay()
	local streak = profile.DailyStreak or { Count = 0, LastClaimUtcDay = 0 }
	local lastDay = streak.LastClaimUtcDay or 0

	if lastDay >= today then
		return false, ((streak.Count - 1) % #REWARD_LADDER) + 1
	end

	local daysSince = today - lastDay
	local nextCount = if lastDay > 0 and daysSince <= 2 then (streak.Count + 1) else 1
	local rewardIndex = ((nextCount - 1) % #REWARD_LADDER) + 1
	return true, rewardIndex
end

function DailyRewardSystem.Claim(profile: any, isVip: boolean): ClaimResult
	local today = DailyRewardSystem.GetCurrentUtcDay()
	profile.DailyStreak = profile.DailyStreak or { Count = 0, LastClaimUtcDay = 0 }

	local lastDay = profile.DailyStreak.LastClaimUtcDay or 0
	if lastDay >= today then
		return {
			Success = false,
			Reason = "AlreadyClaimedToday",
			NextClaimUtcDay = today + 1,
		}
	end

	-- 48-hour grace window (daysSince <= 2) keeps streaks fair across timezones
	local daysSince = today - lastDay
	local newCount = if lastDay > 0 and daysSince <= 2 then (profile.DailyStreak.Count + 1) else 1
	local tierIndex = ((newCount - 1) % #REWARD_LADDER) + 1
	local tier = REWARD_LADDER[tierIndex]

	local multiplier = if isVip then 1.25 else 1.0
	local coinsGranted = math.floor(tier.Coins * multiplier)
	local gemsGranted = math.floor(tier.Gems * multiplier)

	-- Mutate synchronously before any yield to eliminate double-claim races
	profile.DailyStreak.Count = newCount
	profile.DailyStreak.LastClaimUtcDay = today
	profile.Coins = (profile.Coins or 0) + coinsGranted
	profile.Gems = (profile.Gems or 0) + gemsGranted

	return {
		Success = true,
		DayClaimed = tierIndex,
		CoinsGranted = coinsGranted,
		GemsGranted = gemsGranted,
		NextClaimUtcDay = today + 1,
	}
end

return DailyRewardSystem

