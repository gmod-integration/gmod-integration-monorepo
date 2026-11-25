# Live console

Open **Console** in your game server's dashboard to follow messages printed by its Lua scripts.
This feature requires Premium, permission to administer the server, and an updated Gmod Integration
addon connected through GWSockets.

## Dashboard access

Community access requires Discord **Administrator** permission and a linked Steam account in one of
the configured **Game administrator groups** on at least one game server linked to that community.
Opening a specific game server's dashboard, including its Console, requires that group on the
target server.

The Discord server owner and the buyer whose active GmodStore purchase is assigned to that community
are exempt from this combined administrator requirement. An active purchase assigned to another
community does not grant access here.

These checks apply to the dashboard and its protected data as well as configuration changes. If access
cannot be verified, retry after checking your account links and permissions.

If access is refused, a dialog explains the missing requirement. **How to get access** opens it again:

1. Sign in with the correct Discord account and ask the community owner to check its **Administrator** permission.
2. Open **Account** and link the Steam account used on the game server.
3. Ask the game server owner to assign an administrator group to that Steam account. Someone who already has
   dashboard access must include that exact group in **Server configuration → Game administrator groups**.
4. Join the game server, wait a few seconds, then disconnect so the addon reports your group. Wait for
   synchronization and select **Recheck access**. You do not need to remain connected in game.

Rechecking never changes permissions. Your pending edits are kept while access is blocked and return
when access is restored. If no community is accessible, the community selector also offers this guidance.

## Follow console output

Output starts while this page is open. Leaving the page stops your subscription. If several tabs
are watching the same server, capture stops when the last viewer leaves. After an unexpected network
loss, capture stops automatically within 30 seconds. The temporary export setting returns to `false`;
it is never saved as enabled.

Use **Follow new output** to keep the newest messages visible, or turn it off to read older lines.
**Clear output** clears this viewer. The page retains only the latest 2,000 lines and 128 Ki characters;
there is no console history to reload.

The console receives Lua `print`, `Msg`, `MsgN` and `MsgC` output. Native engine or binary-module output
may not appear.

## Execute a command

Enter a command in **Console command**, select **Execute command**, and review the exact command and
target server before confirming. Execution follows the dashboard access rules above. You do not need
to be connected to the game. Authorized support sessions can also execute commands within the
represented account's dashboard permissions.

The **Game administrator groups** list in the server configuration controls the ranks recognized by
the dashboard access check and the addon's in-game administrator access. Console execution uses the
dashboard's authorization once access has been granted.

Commands must fit on one line and contain at most 8,192 UTF-8 bytes. The result distinguishes console
acceptance, rejection and an unconfirmed outcome. Acceptance confirms that the game console received
the command; it does not guarantee the command's effects. Native command responses, such as the
engine's `status` output, may not appear in the Lua stream.

The draft is retained when a command is rejected or its result is unknown. An uncertain command is
never sent again automatically: check the server state before choosing to execute it again. Commands
are not kept in browser history, and request logs omit their contents.
