import { getReportChannel, setReportChannel, removeReportChannel } from './reportChannels.js'

export { ReportChannelError as BugReportChannelError } from './reportChannels.js'
export const getBugReportChannel = (serverID: string) => getReportChannel(serverID, 'bug_reports_channel')
export const setBugReportChannel = (serverID: string, body: unknown) =>
  setReportChannel(serverID, 'bug_reports_channel', body)
export const removeBugReportChannel = (serverID: string) => removeReportChannel(serverID, 'bug_reports_channel')
