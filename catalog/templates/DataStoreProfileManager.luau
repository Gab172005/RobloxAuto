--!strict
--[[
	RoForge Studio Catalog Template: DataStoreProfileManager
	Crash-safe player persistence with UpdateAsync session locking,
	exponential backoff retries, schema reconciliation, autosave, and BindToClose.
]]

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

export type ProfileMeta = {
	SchemaVersion: number,
	SessionJobId: string?,
	LockTimestamp: number,
	SaveCount: number,
}

export type PlayerProfile = {
	Coins: number,
	Gems: number,
	Rebirths: number,
	OnboardingStep: number,
	OwnedPasses: { [string]: boolean },
	GiftedPasses: { [string]: boolean },
	ProcessedReceipts: { [string]: number },
	DailyStreak: {
		Count: number,
		LastClaimUtcDay: number,
	},
	StarterPack: {
		UnlockedAt: number,
		ExpiresAt: number,
		Purchased: boolean,
	},
	Upgrades: { [string]: number },
	_meta: ProfileMeta,
}

local STORE_NAME = "RoForgePlayerData_v1"
local SCHEMA_VERSION = 1
local MAX_RETRIES = 5
local STALE_LOCK_SECONDS = 180
local AUTOSAVE_INTERVAL = 240

local DEFAULT_TEMPLATE: PlayerProfile = {
	Coins = 0,
	Gems = 0,
	Rebirths = 0,
	OnboardingStep = 0,
	OwnedPasses = {},
	GiftedPasses = {},
	ProcessedReceipts = {},
	DailyStreak = {
		Count = 0,
		LastClaimUtcDay = 0,
	},
	StarterPack = {
		UnlockedAt = 0,
		ExpiresAt = 0,
		Purchased = false,
	},
	Upgrades = {},
	_meta = {
		SchemaVersion = SCHEMA_VERSION,
		SessionJobId = nil,
		LockTimestamp = 0,
		SaveCount = 0,
	},
}

local DataStoreProfileManager = {}
local activeProfiles: { [number]: PlayerProfile } = {}
local activeSaves: { [number]: boolean } = {}
local dataStore: DataStore? = nil

local function getStore(): DataStore?
	if dataStore then
		return dataStore
	end
	local ok, storeOrErr = pcall(function()
		return DataStoreService:GetDataStore(STORE_NAME)
	end)
	if ok then
		dataStore = storeOrErr
		return dataStore
	end
	warn("[DataStoreProfileManager] Unable to acquire DataStore:", storeOrErr)
	return nil
end

local function deepCopy(value: any): any
	if typeof(value) ~= "table" then
		return value
	end
	local copy: { [any]: any } = {}
	for k, v in pairs(value) do
		copy[k] = deepCopy(v)
	end
	return copy
end

local function reconcile(target: { [any]: any }, template: { [any]: any })
	for key, defaultVal in pairs(template) do
		if target[key] == nil then
			target[key] = deepCopy(defaultVal)
		elseif typeof(target[key]) == "table" and typeof(defaultVal) == "table" then
			reconcile(target[key], defaultVal)
		end
	end
end

local function getSessionId(): string
	if game.JobId ~= "" then
		return game.JobId
	end
	return "Studio_" .. tostring(os.time())
end

local SESSION_ID = getSessionId()

local function getKey(userId: number): string
	return "player_" .. tostring(userId)
end

function DataStoreProfileManager.GetProfile(player: Player): PlayerProfile?
	return activeProfiles[player.UserId]
end

function DataStoreProfileManager.LoadProfile(player: Player): PlayerProfile?
	local store = getStore()
	if not store then
		if RunService:IsStudio() then
			local mock = deepCopy(DEFAULT_TEMPLATE) :: PlayerProfile
			mock._meta.SessionJobId = SESSION_ID
			mock._meta.LockTimestamp = os.time()
			activeProfiles[player.UserId] = mock
			return mock
		end
		player:Kick("Data service unavailable. Please rejoin shortly.")
		return nil
	end

	local key = getKey(player.UserId)
	local loadedProfile: PlayerProfile? = nil
	local lockConflict = false

	for attempt = 1, MAX_RETRIES do
		lockConflict = false
		local ok, result = pcall(function()
			return store:UpdateAsync(key, function(oldData: any): any
				local now = os.time()
				local profile: any = if typeof(oldData) == "table" then oldData else deepCopy(DEFAULT_TEMPLATE)
				reconcile(profile, DEFAULT_TEMPLATE)

				local meta = profile._meta
				local existingJob = meta.SessionJobId
				if existingJob ~= nil and existingJob ~= SESSION_ID then
					local lockAge = now - (meta.LockTimestamp or 0)
					if lockAge < STALE_LOCK_SECONDS then
						lockConflict = true
						return nil -- Abort write; do not steal live session lock
					end
				end

				meta.SchemaVersion = SCHEMA_VERSION
				meta.SessionJobId = SESSION_ID
				meta.LockTimestamp = now
				return profile
			end)
		end)

		if ok and not lockConflict and typeof(result) == "table" then
			loadedProfile = result :: PlayerProfile
			break
		end

		if attempt < MAX_RETRIES then
			local backoff = math.pow(2, attempt - 1) + math.random() * 0.5
			task.wait(backoff)
		end
	end

	if not loadedProfile then
		if lockConflict then
			player:Kick("Your save is finishing on another server. Please rejoin in a few seconds.")
		else
			player:Kick("Unable to load your player data safely. Please rejoin.")
		end
		return nil
	end

	if not player:IsDescendantOf(Players) then
		-- Player left mid-load: release lock immediately
		DataStoreProfileManager.ReleaseProfile(player)
		return nil
	end

	activeProfiles[player.UserId] = loadedProfile
	return loadedProfile
end

function DataStoreProfileManager.SaveProfile(player: Player, releaseLock: boolean?): boolean
	local userId = player.UserId
	local profile = activeProfiles[userId]
	if not profile then
		return false
	end

	if activeSaves[userId] then
		local waitStart = os.clock()
		while activeSaves[userId] and (os.clock() - waitStart) < 5 do
			task.wait(0.1)
		end
	end

	local store = getStore()
	if not store then
		return RunService:IsStudio()
	end

	activeSaves[userId] = true
	local snapshot = deepCopy(profile) :: PlayerProfile
	local key = getKey(userId)
	local success = false

	for attempt = 1, MAX_RETRIES do
		local ok, err = pcall(function()
			store:UpdateAsync(key, function(oldData: any): any
				-- Guard against overwriting another server's newly stolen lock
				if typeof(oldData) == "table" and typeof(oldData._meta) == "table" then
					local remoteJob = oldData._meta.SessionJobId
					if remoteJob ~= nil and remoteJob ~= SESSION_ID then
						return nil
					end
				end

				snapshot._meta.SchemaVersion = SCHEMA_VERSION
				snapshot._meta.LockTimestamp = os.time()
				snapshot._meta.SaveCount += 1
				if releaseLock then
					snapshot._meta.SessionJobId = nil
				else
					snapshot._meta.SessionJobId = SESSION_ID
				end
				return snapshot
			end)
		end)

		if ok then
			success = true
			profile._meta.SaveCount = snapshot._meta.SaveCount
			break
		else
			warn(string.format("[DataStoreProfileManager] Save retry %d failed for %d: %s", attempt, userId, tostring(err)))
			if attempt < MAX_RETRIES then
				task.wait(math.pow(2, attempt - 1))
			end
		end
	end

	activeSaves[userId] = nil
	return success
end

function DataStoreProfileManager.ReleaseProfile(player: Player)
	DataStoreProfileManager.SaveProfile(player, true)
	activeProfiles[player.UserId] = nil
end

function DataStoreProfileManager.StartAutosaveLoop()
	task.spawn(function()
		while true do
			task.wait(AUTOSAVE_INTERVAL)
			for _, player in ipairs(Players:GetPlayers()) do
				if activeProfiles[player.UserId] then
					task.spawn(function()
						DataStoreProfileManager.SaveProfile(player, false)
					end)
					task.wait(0.5)
				end
			end
		end
	end)
end

function DataStoreProfileManager.BindShutdown()
	game:BindToClose(function()
		local playersToSave = Players:GetPlayers()
		if #playersToSave == 0 then
			return
		end

		local remaining = #playersToSave
		for _, player in ipairs(playersToSave) do
			task.spawn(function()
				DataStoreProfileManager.ReleaseProfile(player)
				remaining -= 1
			end)
		end

		local deadline = os.clock() + (if RunService:IsStudio() then 5 else 25)
		while remaining > 0 and os.clock() < deadline do
			task.wait(0.1)
		end
	end)
end

return DataStoreProfileManager

