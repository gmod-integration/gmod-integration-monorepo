-- dll_detect_and_print_dll.lua

if game.SinglePlayer() then
  print("Gmod Integration is not supported in Singleplayer!")
  return
end

local function detectOS()
  if system.IsWindows() then
    return "win" .. (jit and jit.arch == "x64" and "64" or "")
  elseif system.IsLinux() then
    return "linux" .. (jit and jit.arch == "x64" and "64" or "")
  else
    return "unknown"
  end
end

local os = detectOS()


print("\n\27[36m==============================================================\27[0m")
print("\27[1;36m    Gmod Integration – Native DLL Detection & Instructions    \27[0m")
print("\27[36m==============================================================\27[0m")
print("\27[2mDocumentation: https://docs.gmod-integration.com/getting-started/installation\27[0m")
print("\27[36m--------------------------------------------------------------\27[0m\n")

if os == "unknown" then
  print("\27[31m[ERROR]\27[0m Unknown OS detected, cannot determine DLL.")
else
  local gwsockets_dll = "gmsv_gwsockets_" .. os .. ".dll"
  local url_gwsockets = "https://github.com/FredyH/GWSockets/releases/latest/download/" .. gwsockets_dll

  print("\27[32m[INFO]\27[0m Detected OS: \27[1m" .. os .. "\27[0m\n")
  print("\27[1mYou need to download and install the following DLL:\27[0m\n")

  print("\n\27[1;33m GWSockets DLL :\27[0m")
  print(" " .. gwsockets_dll)
  print("   → " .. url_gwsockets)

  print("\n\27[33m[IMPORTANT]\27[0m Place the DLL in: \27[4mgarrysmod/lua/bin/\27[0m\n")
  print("\27[2mIf the 'bin' folder does not exist, create it manually.\27[0m\n")
end

print("\27[36m==============================================================\27[0m\n")
