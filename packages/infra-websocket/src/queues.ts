import { Queue } from 'bullmq'
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

export const wsSendToAllClientsOfServerQueue = new Queue<wsSendToAllClientsOfServerData>('wsSendToAllClientsOfServer', {
  connection,
})
