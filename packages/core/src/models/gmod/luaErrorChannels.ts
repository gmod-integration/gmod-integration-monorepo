import { getReportChannel, setReportChannel, removeReportChannel } from './reportChannels.js'

export { ReportChannelError as LuaErrorChannelError } from './reportChannels.js'
export const getLuaErrorChannel = (serverID: string) => getReportChannel(serverID, 'lua_errors_channel')
export const setLuaErrorChannel = (serverID: string, body: unknown) =>
  setReportChannel(serverID, 'lua_errors_channel', body)
export const removeLuaErrorChannel = (serverID: string) => removeReportChannel(serverID, 'lua_errors_channel')
