import { Queue, QueueEvents } from 'bullmq'
import { connection } from '@gmod/infra-bullmq'

export interface WSSendToServerData {
  id: string
  data: any
}

export interface wsSendToAllClientsOfServerData {
  id: string
  action: string
  data: any
}

export const wsSendToServerQueue = new Queue<WSSendToServerData>('wsSendToServer', {
  connection,
})

const wsSendToServerQueueEvents = new QueueEvents(wsSendToServerQueue.name, {
  connection,
})

wsSendToServerQueueEvents.on('error', (error) => {
  console.error('[infra-websocket] wsSendToServerQueueEvents error:', error)
})

export async function enqueueWSSendToServerAndWait(data: WSSendToServerData, timeoutMs = 5000): Promise<boolean> {
  const job = await wsSendToServerQueue.add('wsSendToServer', data, {
    removeOnComplete: true,
    removeOnFail: true,
  })

  const result = await job.waitUntilFinished(wsSendToServerQueueEvents, timeoutMs)
  return Boolean(result)
}

export const wsSendToAllClientsOfServerQueue = new Queue<wsSendToAllClientsOfServerData>('wsSendToAllClientsOfServer', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: {
      age: 24 * 60 * 60,
      count: 1000,
    },
  },
})
