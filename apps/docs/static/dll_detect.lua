-- dll_detect_and_print_dll.lua

if CLIENT then
  print("Run this command in the dedicated server console, not the player console.")
  return
end

if game.SinglePlayer() then
  print("Gmod Integration is not supported in Singleplayer!")
  return
end

local function detectOS()
  local architecture = jit and jit.arch
  if architecture ~= "x86" and architecture ~= "x64" then
    return "unknown"
  end
  if system.IsWindows() then
    return architecture == "x64" and "win64" or "win32"
  elseif system.IsLinux() then
    return architecture == "x64" and "linux64" or "linux"
  else
    return "unknown"
  end
end

local platform = detectOS()

print("\n\27[36m==============================================================\27[0m")
print("\27[1;36m    Gmod Integration – Required GWSockets Module    \27[0m")
print("\27[36m==============================================================\27[0m")
print("\27[2mDocumentation: https://docs.gmod-integration.com/getting-started/installation\27[0m")
print("\27[36m--------------------------------------------------------------\27[0m\n")

print("GWSockets is mandatory. Without it, no connected Gmod Integration features work.")
print("Choose the binary for the dedicated server process, not your own computer or OS bitness.")

if platform == "unknown" then
  print("\27[31m[ERROR]\27[0m Unsupported or unknown server OS/architecture; check with your host.")
  print("Downloads: https://github.com/FredyH/GWSockets/releases")
else
  local gwsockets_dll = "gmsv_gwsockets_" .. platform .. ".dll"
  local url_gwsockets = "https://github.com/FredyH/GWSockets/releases/latest/download/" .. gwsockets_dll

  print("\27[32m[INFO]\27[0m Detected server platform: \27[1m" .. platform .. "\27[0m\n")
  print("\27[1mYou need to download and install the following DLL:\27[0m\n")

  print("\n\27[1;33m GWSockets DLL :\27[0m")
  print(" " .. gwsockets_dll)
  print("   → " .. url_gwsockets)

  print("\n\27[33m[IMPORTANT]\27[0m Place the DLL on the dedicated server in: \27[4mgarrysmod/lua/bin/\27[0m\n")
  print("\27[2mIf the 'bin' folder does not exist, create it manually.\27[0m\n")
end

print("Completely stop and start the dedicated server after installation; changing maps is not enough.")
print("The Workshop addon alone does not install this binary module.")

print("\27[36m==============================================================\27[0m\n")
