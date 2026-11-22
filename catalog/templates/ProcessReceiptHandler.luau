--!strict
--[[
	RoForge Studio Catalog Template: ProcessReceiptHandler
	Single-source idempotent MarketplaceService.ProcessReceipt handler,
	GamePass ownership cache, Server-Wide Boost triggers, and Economy telemetry.
]]

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local MAX_STORED_RECEIPTS = 150

export type ReceiptGrantFn = (player: Player, profile: any, receiptInfo: { [string]: any }) -> boolean

type ProductHandlerMap = { [number]: ReceiptGrantFn }

local Monetization = {}
local productHandlers: ProductHandlerMap = {}
local gamePassCache: { [number]: { [number]: boolean } } = {}
local serverBoostEndsAt = 0

-- Replace these module references with your project's actual modules
local ProfileManager: any = nil
local AnalyticsWrapper: any = nil

function Monetization.Configure(deps: { ProfileManager: any, AnalyticsWrapper: any? })
	ProfileManager = deps.ProfileManager
	AnalyticsWrapper = deps.AnalyticsWrapper
end

function Monetization.RegisterProduct(productId: number, handler: ReceiptGrantFn)
	assert(productId > 0, "ProductId must be > 0 before live registration")
	productHandlers[productId] = handler
end

local function pruneReceipts(receipts: { [string]: number })
	local keys: { string } = {}
	for purchaseId in pairs(receipts) do
		table.insert(keys, purchaseId)
	end
	if #keys <= MAX_STORED_RECEIPTS then
		return
	end
	table.sort(keys, function(a, b)
		return (receipts[a] or 0) < (receipts[b] or 0)
	end)
	local toRemove = #keys - MAX_STORED_RECEIPTS
	for i = 1, toRemove do
		receipts[keys[i]] = nil
	end
end

function Monetization.GetServerBoostRemaining(): number
	return math.max(0, serverBoostEndsAt - os.time())
end

function Monetization.ActivateServerBoost(buyerName: string, durationSeconds: number, multiplier: number)
	local now = os.time()
	serverBoostEndsAt = math.max(serverBoostEndsAt, now) + durationSeconds

	local remotes = ReplicatedStorage:FindFirstChild("Remotes")
	local bannerRemote = if remotes then remotes:FindFirstChild("ServerEventBanner") else nil
	if bannerRemote and bannerRemote:IsA("RemoteEvent") then
		bannerRemote:FireAllClients({
			Title = string.format("%dx SERVER BOOST ACTIVE!", multiplier),
			Subtitle = string.format("THANK YOU @%s!", buyerName),
			EndsAt = serverBoostEndsAt,
		})
	end
end

function Monetization.PlayerOwnsGamePass(player: Player, passId: number, passKey: string?): boolean
	if passId <= 0 then
		return false
	end

	-- Check gifted passes in persistent profile first
	if ProfileManager and passKey then
		local profile = ProfileManager.GetProfile(player)
		if profile and profile.GiftedPasses and profile.GiftedPasses[passKey] then
			return true
		end
	end

	local cache = gamePassCache[player.UserId]
	if cache and cache[passId] ~= nil then
		return cache[passId]
	end

	local ok, owns = pcall(function()
		return MarketplaceService:UserOwnsGamePassAsync(player.UserId, passId)
	end)
	if ok then
		gamePassCache[player.UserId] = gamePassCache[player.UserId] or {}
		gamePassCache[player.UserId][passId] = owns
		return owns
	end
	return false
end

function Monetization.Init()
	assert(ProfileManager ~= nil, "Call Monetization.Configure(...) before Init()")

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player: Player, passId: number, wasPurchased: boolean)
		if wasPurchased then
			gamePassCache[player.UserId] = gamePassCache[player.UserId] or {}
			gamePassCache[player.UserId][passId] = true
		end
	end)

	Players.PlayerRemoving:Connect(function(player: Player)
		gamePassCache[player.UserId] = nil
	end)

	-- SINGLE GLOBAL ProcessReceipt ASSIGNMENT
	MarketplaceService.ProcessReceipt = function(receiptInfo): Enum.ProductPurchaseDecision
		local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
		if not player then
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		local profile = ProfileManager.GetProfile(player)
		if not profile then
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		profile.ProcessedReceipts = profile.ProcessedReceipts or {}
		local purchaseId = tostring(receiptInfo.PurchaseId)

		-- Idempotency check: prevent duplicate grants on retry
		if profile.ProcessedReceipts[purchaseId] ~= nil then
			return Enum.ProductPurchaseDecision.PurchaseGranted
		end

		local handler = productHandlers[receiptInfo.ProductId]
		if not handler then
			warn("[Monetization] Unregistered ProductId:", receiptInfo.ProductId)
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		local grantOk, granted = pcall(handler, player, profile, receiptInfo)
		if not grantOk or not granted then
			warn("[Monetization] Product grant failed for", receiptInfo.ProductId, granted)
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		profile.ProcessedReceipts[purchaseId] = os.time()
		pruneReceipts(profile.ProcessedReceipts)

		local saved = ProfileManager.SaveProfile(player, false)
		if not saved then
			-- Roll back receipt marker so Roblox safely retries
			profile.ProcessedReceipts[purchaseId] = nil
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		if AnalyticsWrapper then
			AnalyticsWrapper.LogEconomySource(
				player,
				"RobuxProduct",
				receiptInfo.CurrencySpent or 0,
				profile.Coins or 0,
				Enum.AnalyticsEconomyTransactionType.IAP,
				"product_" .. tostring(receiptInfo.ProductId)
			)
		end

		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
end

return Monetization

