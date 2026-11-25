import { DashboardChannelConfigurationSchema } from '@gmod/schema/server/DashboardChannelSchema.js'
import { fetchAPI } from '../utils/api.js'

/** Feature callers choose the endpoint; shared destination controls only receive callbacks. */
export function createReportChannelRequests(endpoint: string) {
  async function readResponse(response: Response) {
    if (!response.ok) throw new Error('Report destination request failed')
    return DashboardChannelConfigurationSchema.parse(await response.json())
  }
  return {
    load: async () => readResponse(await fetchAPI(endpoint, 'GET')),
    save: async (channelID: string) => readResponse(await fetchAPI(endpoint, 'POST', { channelID })),
    remove: async () => readResponse(await fetchAPI(endpoint, 'DELETE')),
  }
}
