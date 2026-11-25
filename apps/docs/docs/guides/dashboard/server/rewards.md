# Rewards

Use **Rewards** in a game server's dashboard to reward linked Steam and Discord players.
This feature requires Premium and a compatible Gmod Integration addon.
Rules, History and Integrations appear one after another on the same page.

## Create a reward

1. Open **Rewards → Rules → Create reward**.
2. Give the rule a name and a description explaining what the player earns.
3. Choose account verification, a validated vote, a playtime milestone or manual attribution.
4. Add one or more rewards: DarkRP money, Pointshop points, Pointshop 2 standard points, a Discord role or server-side Lua.
5. Choose the delivery deadline and, optionally, a start and end date. Save the complete rule and enable it when ready.

The **Integrations** section shows the last report from your addon. Unknown or unavailable integrations
must be resolved before their in-game rewards can be delivered. The bot needs permission to manage a
Discord reward role, and that role must be below its highest role.

Verification and playtime rewards are granted once per rule/player. Vote rewards use validated votes
and the configured cooldown. Recorded playtime is updated when the player's session ends; it does not
exclude AFK time. Existing linked accounts and recorded playtime can meet a newly enabled rule's conditions.

## Check eligibility

Select a rule and enter a player's Steam ID64 to simulate it. The result explains whether the player
qualifies, their recorded progress and missing integrations. Simulation does not distribute a reward.

Manual attribution requires a reason and confirmation. Use a manual rule for staff-awarded gifts.
Repeating the same request after a connection failure does not grant the gift twice.

## Execute server-side Lua

Choose **Execute Lua** as a reward action and enter your GLua script in the editor. It runs on the
dedicated game server when the recipient is online. The script has access to:

- `ply`: the rewarded player.
- `steamID64`: the player's Steam ID64 string.
- `reward`: delivery information containing `id`, `actionID`, `name` and `steamID64`.

For example:

```lua
ply:ChatPrint("Thanks for supporting the server!")
```

Source can contain up to 16,384 characters. Saving or simulating the rule does not run it. The script
uses the server's normal Lua environment and can call your installed addons. Its contents are kept out
of player reward listings and history.

A syntax error marks the action as failed. An error during execution leaves it needing review because
the script may have already changed something. Reconnection does not automatically execute it again.
An action is delivered when its synchronous script finishes successfully; any callbacks it schedules
run separately.

## Follow delivery

The **History** section lists recipients, dates, staff attribution and the result of each action in a bundle.
Filter it by rule, Steam ID or status:

- **Pending**: waiting for delivery, a player connection or an available integration.
- **Delivered**: the receiving integration confirmed the action.
- **Failed**: delivery was rejected; inspect the reported reason.
- **Expired**: the pending delivery deadline passed.
- **Needs review**: the result is uncertain. Check the player's wallet and the server before taking further action.

In-game rewards wait for the player's next connection until their deadline. Disabling or deleting a
rule stops further delivery and keeps its history. Editing a rule does not reset its already earned rewards.
Removing Premium pauses delivery while retaining configuration and allowing cleanup.

Players can use `/rewards` in Discord to privately view their rewards and progress. Awards from automatic
rules require no claim button. A compatible addon announces newly received in-game rewards in chat.
