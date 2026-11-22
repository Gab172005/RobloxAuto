--!strict
--[[
	RoForge Studio Catalog Template: MobileShopUITemplate
	Phone-first procedural Roblox Shop ScreenGui engineered for 667x375 & 844x390
	mobile screens, 1920x1080 PC, and Gamepad navigation.
]]

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

export type ShopOffer = {
	Id: string,
	Title: string,
	Subtitle: string,
	PriceText: string,
	Badge: string?,
	AccentColor: Color3,
	OnPurchase: () -> (),
}

local MobileShopUI = {}

local function addPressBounce(button: TextButton)
	local scale = Instance.new("UIScale")
	scale.Parent = button

	local downTween = TweenService:Create(scale, TweenInfo.new(0.08, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Scale = 0.93,
	})
	local upTween = TweenService:Create(scale, TweenInfo.new(0.16, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
		Scale = 1.0,
	})

	button.MouseButton1Down:Connect(function()
		downTween:Play()
	end)
	button.MouseButton1Up:Connect(function()
		upTween:Play()
	end)
	button.MouseLeave:Connect(function()
		upTween:Play()
	end)
end

function MobileShopUI.Mount(offers: { ShopOffer }): { Open: () -> (), Close: () -> (), Destroy: () -> () }
	local player = Players.LocalPlayer
	local playerGui = player:WaitForChild("PlayerGui")

	local screenGui = Instance.new("ScreenGui")
	screenGui.Name = "RoForgeShopGui"
	screenGui.ResetOnSpawn = false
	screenGui.IgnoreGuiInset = false
	screenGui.ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets
	screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	screenGui.Enabled = false
	screenGui.Parent = playerGui

	-- Dim backdrop
	local backdrop = Instance.new("Frame")
	backdrop.Name = "Backdrop"
	backdrop.Size = UDim2.fromScale(1, 1)
	backdrop.BackgroundColor3 = Color3.fromRGB(9, 11, 20)
	backdrop.BackgroundTransparency = 0.45
	backdrop.BorderSizePixel = 0
	backdrop.Parent = screenGui

	-- Responsive phone-first modal container
	local modal = Instance.new("Frame")
	modal.Name = "Modal"
	modal.AnchorPoint = Vector2.new(0.5, 0.5)
	modal.Position = UDim2.fromScale(0.5, 0.5)
	modal.Size = UDim2.fromScale(0.86, 0.84)
	modal.BackgroundColor3 = Color3.fromRGB(22, 27, 42)
	modal.BorderSizePixel = 0
	modal.Parent = backdrop

	local modalCorner = Instance.new("UICorner")
	modalCorner.CornerRadius = UDim.new(0, 16)
	modalCorner.Parent = modal

	local modalStroke = Instance.new("UIStroke")
	modalStroke.Color = Color3.fromRGB(99, 102, 241)
	modalStroke.Thickness = 2
	modalStroke.Parent = modal

	local modalSizeConstraint = Instance.new("UISizeConstraint")
	modalSizeConstraint.MinSize = Vector2.new(440, 270)
	modalSizeConstraint.MaxSize = Vector2.new(900, 560)
	modalSizeConstraint.Parent = modal

	local modalScale = Instance.new("UIScale")
	modalScale.Scale = 0.88
	modalScale.Parent = modal

	-- Header bar
	local header = Instance.new("Frame")
	header.Name = "Header"
	header.Size = UDim2.new(1, 0, 0.16, 0)
	header.BackgroundColor3 = Color3.fromRGB(30, 37, 58)
	header.BorderSizePixel = 0
	header.Parent = modal

	local headerCorner = Instance.new("UICorner")
	headerCorner.CornerRadius = UDim.new(0, 16)
	headerCorner.Parent = header

	local titleLabel = Instance.new("TextLabel")
	titleLabel.Name = "Title"
	titleLabel.BackgroundTransparency = 1
	titleLabel.Position = UDim2.fromScale(0.04, 0.15)
	titleLabel.Size = UDim2.fromScale(0.75, 0.7)
	titleLabel.Font = Enum.Font.GothamBold
	titleLabel.Text = "ROFORGE SHOP"
	titleLabel.TextColor3 = Color3.fromRGB(248, 250, 252)
	titleLabel.TextScaled = true
	titleLabel.TextXAlignment = Enum.TextXAlignment.Left
	titleLabel.Parent = header

	local titleConstraint = Instance.new("UITextSizeConstraint")
	titleConstraint.MinTextSize = 14
	titleConstraint.MaxTextSize = 28
	titleConstraint.Parent = titleLabel

	-- 44px+ guaranteed Close button
	local closeBtn = Instance.new("TextButton")
	closeBtn.Name = "CloseButton"
	closeBtn.AnchorPoint = Vector2.new(1, 0.5)
	closeBtn.Position = UDim2.new(1, -10, 0.5, 0)
	closeBtn.Size = UDim2.fromScale(0.1, 0.78)
	closeBtn.BackgroundColor3 = Color3.fromRGB(239, 68, 68)
	closeBtn.Font = Enum.Font.GothamBold
	closeBtn.Text = "X"
	closeBtn.TextColor3 = Color3.new(1, 1, 1)
	closeBtn.TextScaled = true
	closeBtn.Selectable = true
	closeBtn.Parent = header

	local closeMin = Instance.new("UISizeConstraint")
	closeMin.MinSize = Vector2.new(44, 44)
	closeMin.MaxSize = Vector2.new(56, 56)
	closeMin.Parent = closeBtn

	local closeAspect = Instance.new("UIAspectRatioConstraint")
	closeAspect.AspectRatio = 1
	closeAspect.Parent = closeBtn

	local closeCorner = Instance.new("UICorner")
	closeCorner.CornerRadius = UDim.new(0, 10)
	closeCorner.Parent = closeBtn
	addPressBounce(closeBtn)

	-- Scrollable offers grid
	local scroll = Instance.new("ScrollingFrame")
	scroll.Name = "OfferGrid"
	scroll.Position = UDim2.fromScale(0.03, 0.2)
	scroll.Size = UDim2.fromScale(0.94, 0.76)
	scroll.BackgroundTransparency = 1
	scroll.BorderSizePixel = 0
	scroll.ScrollBarThickness = 6
	scroll.CanvasSize = UDim2.fromScale(0, 0)
	scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scroll.Parent = modal

	local grid = Instance.new("UIGridLayout")
	grid.CellSize = UDim2.new(0.48, 0, 0, 128)
	grid.CellPadding = UDim2.new(0.03, 0, 0, 12)
	grid.SortOrder = Enum.SortOrder.LayoutOrder
	grid.Parent = scroll

	local gridPad = Instance.new("UIPadding")
	gridPad.PaddingTop = UDim.new(0, 6)
	gridPad.PaddingBottom = UDim.new(0, 12)
	gridPad.PaddingLeft = UDim.new(0, 4)
	gridPad.PaddingRight = UDim.new(0, 4)
	gridPad.Parent = scroll

	local firstSelectableButton: TextButton? = nil

	for index, offer in ipairs(offers) do
		local card = Instance.new("Frame")
		card.Name = "Offer_" .. offer.Id
		card.LayoutOrder = index
		card.BackgroundColor3 = Color3.fromRGB(31, 41, 64)
		card.BorderSizePixel = 0
		card.Parent = scroll

		local cardCorner = Instance.new("UICorner")
		cardCorner.CornerRadius = UDim.new(0, 12)
		cardCorner.Parent = card

		local cardStroke = Instance.new("UIStroke")
		cardStroke.Color = offer.AccentColor
		cardStroke.Thickness = 1.5
		cardStroke.Parent = card

		local nameLbl = Instance.new("TextLabel")
		nameLbl.BackgroundTransparency = 1
		nameLbl.Position = UDim2.fromScale(0.05, 0.08)
		nameLbl.Size = UDim2.fromScale(0.9, 0.26)
		nameLbl.Font = Enum.Font.GothamBold
		nameLbl.Text = offer.Title
		nameLbl.TextColor3 = Color3.fromRGB(255, 255, 255)
		nameLbl.TextScaled = true
		nameLbl.TextXAlignment = Enum.TextXAlignment.Left
		nameLbl.Parent = card

		local nameLimit = Instance.new("UITextSizeConstraint")
		nameLimit.MinTextSize = 12
		nameLimit.MaxTextSize = 22
		nameLimit.Parent = nameLbl

		local subLbl = Instance.new("TextLabel")
		subLbl.BackgroundTransparency = 1
		subLbl.Position = UDim2.fromScale(0.05, 0.34)
		subLbl.Size = UDim2.fromScale(0.9, 0.24)
		subLbl.Font = Enum.Font.Gotham
		subLbl.Text = offer.Subtitle
		subLbl.TextColor3 = Color3.fromRGB(186, 198, 224)
		subLbl.TextScaled = true
		subLbl.TextWrapped = true
		subLbl.TextXAlignment = Enum.TextXAlignment.Left
		subLbl.Parent = card

		local subLimit = Instance.new("UITextSizeConstraint")
		subLimit.MinTextSize = 11
		subLimit.MaxTextSize = 16
		subLimit.Parent = subLbl

		local buyBtn = Instance.new("TextButton")
		buyBtn.Name = "BuyButton"
		buyBtn.AnchorPoint = Vector2.new(0.5, 1)
		buyBtn.Position = UDim2.new(0.5, 0, 0.94, 0)
		buyBtn.Size = UDim2.fromScale(0.9, 0.34)
		buyBtn.BackgroundColor3 = offer.AccentColor
		buyBtn.Font = Enum.Font.GothamBold
		buyBtn.Text = offer.PriceText
		buyBtn.TextColor3 = Color3.new(1, 1, 1)
		buyBtn.TextScaled = true
		buyBtn.Selectable = true
		buyBtn.Parent = card

		local buyMin = Instance.new("UISizeConstraint")
		buyMin.MinSize = Vector2.new(100, 44)
		buyMin.Parent = buyBtn

		local buyCorner = Instance.new("UICorner")
		buyCorner.CornerRadius = UDim.new(0, 8)
		buyCorner.Parent = buyBtn

		local buyTextLimit = Instance.new("UITextSizeConstraint")
		buyTextLimit.MinTextSize = 12
		buyTextLimit.MaxTextSize = 20
		buyTextLimit.Parent = buyBtn

		addPressBounce(buyBtn)
		buyBtn.Activated:Connect(function()
			offer.OnPurchase()
		end)

		if not firstSelectableButton then
			firstSelectableButton = buyBtn
		end
	end

	local openTween = TweenService:Create(modalScale, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
		Scale = 1.0,
	})

	local function close()
		screenGui.Enabled = false
		GuiService.SelectedObject = nil
		ContextActionService:UnbindAction("RoForgeCloseShop")
	end

	local function open()
		modalScale.Scale = 0.88
		screenGui.Enabled = true
		openTween:Play()

		if UserInputService.GamepadEnabled and firstSelectableButton then
			GuiService.SelectedObject = firstSelectableButton
		end

		ContextActionService:BindAction("RoForgeCloseShop", function(_, state)
			if state == Enum.UserInputState.Begin then
				close()
				return Enum.ContextActionResult.Sink
			end
			return Enum.ContextActionResult.Pass
		end, false, Enum.KeyCode.ButtonB, Enum.KeyCode.Escape)
	end

	closeBtn.Activated:Connect(close)

	return {
		Open = open,
		Close = close,
		Destroy = function()
			close()
			screenGui:Destroy()
		end,
	}
end

return MobileShopUI

