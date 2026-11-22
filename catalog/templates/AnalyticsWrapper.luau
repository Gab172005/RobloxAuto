--!strict
--[[
	RoForge Studio Catalog Template: AnalyticsWrapper
	Safe instrumentation wrapper for AnalyticsService (Onboarding Funnel,
	Custom Funnels, Economy Sources/Sinks) and ConfigService remote A/B tuning.
]]

local AnalyticsService = game:GetService("AnalyticsService")
local HttpService = game:GetService("HttpService")

local AnalyticsWrapper = {}

local cachedConfigSnapshot: any = nil
local lastConfigFetch = 0
local CONFIG_CACHE_TTL = 120

function AnalyticsWrapper.NewSessionId(): string
	return HttpService:GenerateGUID(false)
end

function AnalyticsWrapper.LogOnboardingStep(player: Player, stepNumber: number, stepName: string)
	pcall(function()
		AnalyticsService:LogOnboardingFunnelStepEvent(player, stepNumber, stepName)
	end)
end

function AnalyticsWrapper.LogFunnelStep(
	player: Player,
	funnelName: string,
	funnelSessionId: string,
	stepNumber: number,
	stepName: string
)
	pcall(function()
		AnalyticsService:LogFunnelStepEvent(player, funnelName, funnelSessionId, stepNumber, stepName)
	end)
end

function AnalyticsWrapper.LogEconomySource(
	player: Player,
	currencyType: string,
	amount: number,
	endingBalance: number,
	transactionType: Enum.AnalyticsEconomyTransactionType,
	itemSku: string?
)
	if amount <= 0 then
		return
	end
	pcall(function()
		AnalyticsService:LogEconomyEvent(
			player,
			Enum.AnalyticsEconomyFlowType.Source,
			currencyType,
			amount,
			endingBalance,
			transactionType.Name,
			itemSku
		)
	end)
end

function AnalyticsWrapper.LogEconomySink(
	player: Player,
	currencyType: string,
	amount: number,
	endingBalance: number,
	transactionType: Enum.AnalyticsEconomyTransactionType,
	itemSku: string?
)
	if amount <= 0 then
		return
	end
	pcall(function()
		AnalyticsService:LogEconomyEvent(
			player,
			Enum.AnalyticsEconomyFlowType.Sink,
			currencyType,
			amount,
			endingBalance,
			transactionType.Name,
			itemSku
		)
	end)
end

function AnalyticsWrapper.GetRemoteConfigNumber(key: string, defaultValue: number): number
	local now = os.clock()
	if not cachedConfigSnapshot or (now - lastConfigFetch) > CONFIG_CACHE_TTL then
		lastConfigFetch = now
		local ok, configService = pcall(function()
			return game:GetService("ConfigService")
		end)
		if ok and configService then
			local snapOk, snap = pcall(function()
				return (configService :: any):GetConfigAsync()
			end)
			if snapOk and snap then
				cachedConfigSnapshot = snap
			end
		end
	end

	if cachedConfigSnapshot then
		local ok, val = pcall(function()
			return cachedConfigSnapshot:GetValue(key)
		end)
		if ok and typeof(val) == "number" and val == val then
			return val
		end
	end

	return defaultValue
end

return AnalyticsWrapper

