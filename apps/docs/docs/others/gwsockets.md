# Install GWSockets

GWSockets is the native WebSocket client required by Gmod Integration. All connected addon features use it to exchange data with the platform. Without GWSockets, the addon cannot connect; installing only the Workshop content is not sufficient.

Install the module on the dedicated server. Players do not need to install it on their computers.

## Installation

1. Determine the dedicated server's operating system and **process architecture**. A 32-bit Garry's Mod server requires the 32-bit module even on a 64-bit operating system. The [installation guide](../getting-started/installation.md#dll) includes a server-console command that detects the matching download.
2. Download the matching server module from the [GitHub releases page](https://github.com/FredyH/GWSockets/releases): `gmsv_gwsockets_linux.dll`, `gmsv_gwsockets_linux64.dll`, `gmsv_gwsockets_win32.dll` or `gmsv_gwsockets_win64.dll`.
3. Place the downloaded DLL in the dedicated server's `garrysmod/lua/bin/` directory. Create `bin` if necessary. If your hosting panel restricts this directory, ask your hosting provider to install the module.
4. Fully stop and start the server through its hosting panel or service manager. A map change or player reconnection does not load a newly installed native module.
5. Run `gmod-integration help` in the server console, then [configure the server ID and token](../getting-started/configuration.md).

If GWSockets is still unavailable after a restart, check the DLL's filename, server directory and process architecture. The addon reports the dependency failure in the server console and to authorized in-game administrators. Local configuration remains available, but connected features require the module to load successfully.
