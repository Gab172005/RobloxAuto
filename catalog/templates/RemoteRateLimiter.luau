--!strict
--[[
	RoForge Studio Catalog Template: RemoteRateLimiter
	Per-player token bucket rate limiter and strict payload validation helpers.
	Protects RemoteEvents against spam, NaN exploits, and negative-number dupes.
]]

local Players = game:GetService("Players")

type Bucket = {
	Tokens: number,
	LastRefill: number,
}

local RemoteRateLimiter = {}
local playerBuckets: { [number]: { [string]: Bucket } } = {}

Players.PlayerRemoving:Connect(function(player: Player)
	playerBuckets[player.UserId] = nil
end)

function RemoteRateLimiter.Check(
	player: Player,
	actionKey: string,
	maxBurst: number,
	refillPerSecond: number
): boolean
	local userId = player.UserId
	local buckets = playerBuckets[userId]
	if not buckets then
		buckets = {}
		playerBuckets[userId] = buckets
	end

	local now = os.clock()
	local bucket = buckets[actionKey]
	if not bucket then
		bucket = {
			Tokens = maxBurst,
			LastRefill = now,
		}
		buckets[actionKey] = bucket
	end

	local elapsed = math.max(0, now - bucket.LastRefill)
	bucket.Tokens = math.min(maxBurst, bucket.Tokens + elapsed * refillPerSecond)
	bucket.LastRefill = now

	if bucket.Tokens < 1 then
		return false
	end

	bucket.Tokens -= 1
	return true
end

function RemoteRateLimiter.IsFinitePositiveInt(value: any, minVal: number, maxVal: number): boolean
	if typeof(value) ~= "number" then
		return false
	end
	if value ~= value or math.abs(value) == math.huge then
		return false
	end
	if math.floor(value) ~= value then
		return false
	end
	return value >= minVal and value <= maxVal
end

function RemoteRateLimiter.IsSafeString(value: any, maxLen: number): boolean
	if typeof(value) ~= "string" then
		return false
	end
	return #value > 0 and #value <= maxLen
end

return RemoteRateLimiter

